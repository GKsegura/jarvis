import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { encoded, POWERSHELL } from './actions';
import { hasFaceToken } from './face-store';
import { BodyTooLargeError, isLocalRequest, readBody, sendJson } from './http';

/**
 * Mouse, teclado e volume do Windows para os gestos (mouse no ar, Alt+Tab com ✌, volume no ar).
 * Um PowerShell só fica aberto recebendo comandos por linha: subir um processo por movimento
 * do mouse seria lento demais.
 */

/** Teclas que os gestos podem apertar. Nada de texto livre: só atalhos. */
export const KEYS: Record<string, number> = {
  alt: 0x12,
  shift: 0x10,
  ctrl: 0x11,
  win: 0x5b,
  tab: 0x09,
  left: 0x25,
  right: 0x27,
  up: 0x26,
  down: 0x28,
  d: 0x44,
  esc: 0x1b,
  enter: 0x0d,
  space: 0x20,
};

export type InputCommand =
  | { move: [number, number] }
  | { button: 'down' | 'up' }
  | { scroll: number }
  | { keys: string[] }
  | { volume: number };

const MAX_COMMANDS = 20;
const unit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** Converte os comandos do navegador em linhas para o PowerShell. Devolve null se algum for inválido. */
export function toLines(cmds: unknown): string[] | null {
  if (!Array.isArray(cmds) || cmds.length === 0 || cmds.length > MAX_COMMANDS) return null;
  const lines: string[] = [];
  for (const c of cmds as Array<Record<string, unknown>>) {
    if (c && Array.isArray(c.move) && c.move.length === 2 && unit(c.move[0]) && unit(c.move[1])) {
      lines.push(`move ${c.move[0].toFixed(5)} ${c.move[1].toFixed(5)}`);
    } else if (c && (c.button === 'down' || c.button === 'up')) {
      lines.push(c.button);
    } else if (c && Number.isInteger(c.scroll) && Math.abs(c.scroll as number) <= 20 && c.scroll !== 0) {
      lines.push(`scroll ${c.scroll}`);
    } else if (c && Array.isArray(c.keys) && c.keys.length > 0 && c.keys.length <= 4 && c.keys.every((k) => typeof k === 'string' && k in KEYS)) {
      lines.push(`keys ${(c.keys as string[]).map((k) => `0x${KEYS[k].toString(16)}`).join(',')}`);
    } else if (c && unit(c.volume)) {
      lines.push(`setvol ${(c.volume as number).toFixed(3)}`);
    } else return null;
  }
  return lines;
}

/** O PowerShell que fica rodando. Números sempre com ponto (cultura invariante), mesmo no Windows em português. */
export const INPUT_SCRIPT = `
Add-Type @"
using System; using System.Threading; using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int f(); int g(); int h(); int i();
  int SetMasterVolumeLevelScalar(float level, Guid ctx);
  int j();
  int GetMasterVolumeLevelScalar(out float level);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid id, int ctx, int p, out IAudioEndpointVolume v); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator { }
public static class JarvisInput {
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint f, int x, int y, int d, UIntPtr e);
  [DllImport("user32.dll")] static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
  [DllImport("user32.dll")] static extern int GetSystemMetrics(int i);
  public static void Init() { SetProcessDPIAware(); }
  public static void Move(double nx, double ny) {
    int x = GetSystemMetrics(76), y = GetSystemMetrics(77), w = GetSystemMetrics(78), h = GetSystemMetrics(79);
    SetCursorPos(x + (int)Math.Round(nx * (w - 1)), y + (int)Math.Round(ny * (h - 1)));
  }
  public static void Button(bool down) { mouse_event(down ? 0x0002u : 0x0004u, 0, 0, 0, UIntPtr.Zero); }
  public static void Scroll(int steps) { mouse_event(0x0800u, 0, 0, steps * 120, UIntPtr.Zero); }
  public static void Keys(byte[] keys) {
    foreach (var k in keys) { keybd_event(k, 0, 0, UIntPtr.Zero); Thread.Sleep(30); }
    for (int i = keys.Length - 1; i >= 0; i--) { keybd_event(keys[i], 0, 2, UIntPtr.Zero); Thread.Sleep(20); }
  }
  static IAudioEndpointVolume Endpoint() {
    var e = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDevice dev; Marshal.ThrowExceptionForHR(e.GetDefaultAudioEndpoint(0, 1, out dev));
    var id = typeof(IAudioEndpointVolume).GUID; IAudioEndpointVolume v;
    Marshal.ThrowExceptionForHR(dev.Activate(ref id, 23, 0, out v));
    return v;
  }
  public static float GetVolume() { float v; Marshal.ThrowExceptionForHR(Endpoint().GetMasterVolumeLevelScalar(out v)); return v; }
  public static void SetVolume(float v) { Marshal.ThrowExceptionForHR(Endpoint().SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, v)), Guid.Empty)); }
}
"@
[JarvisInput]::Init()
$inv = [Globalization.CultureInfo]::InvariantCulture
[Console]::Out.WriteLine('ready')
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($line -eq $null) { break }
  $p = $line.Split(' ')
  try {
    switch ($p[0]) {
      'move' { [JarvisInput]::Move([double]::Parse($p[1], $inv), [double]::Parse($p[2], $inv)) }
      'down' { [JarvisInput]::Button($true) }
      'up' { [JarvisInput]::Button($false) }
      'scroll' { [JarvisInput]::Scroll([int]$p[1]) }
      'keys' { [JarvisInput]::Keys([byte[]]($p[1].Split(',') | ForEach-Object { [Convert]::ToByte($_, 16) })) }
      'setvol' { [JarvisInput]::SetVolume([float]::Parse($p[1], $inv)) }
      'vol' { [Console]::Out.WriteLine('vol ' + [JarvisInput]::GetVolume().ToString($inv)) }
    }
  } catch { [Console]::Out.WriteLine('error ' + $_.Exception.Message) }
  [Console]::Out.Flush()
}
`;

/** O PowerShell auxiliar: sobe na primeira vez que precisa e reaparece se cair. */
export class InputHelper {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = '';
  private waiting: Array<(line: string) => void> = [];

  private start(): ChildProcessWithoutNullStreams {
    if (this.child && this.child.exitCode === null) return this.child;
    const child = spawn('powershell.exe', [...POWERSHELL, encoded(INPUT_SCRIPT)], { windowsHide: true });
    child.stdout.on('data', (d: Buffer) => {
      this.buffer += d.toString();
      let i: number;
      while ((i = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, i).trim();
        this.buffer = this.buffer.slice(i + 1);
        if (line.startsWith('vol ') || line.startsWith('error')) this.waiting.shift()?.(line);
        if (line.startsWith('error')) console.warn('[entrada]', line);
      }
    });
    child.on('exit', () => {
      this.child = null;
      for (const w of this.waiting.splice(0)) w('error encerrado');
    });
    child.on('error', (e) => console.warn('[entrada]', e));
    this.child = child;
    return child;
  }

  send(lines: string[]): void {
    this.start().stdin.write(`${lines.join('\n')}\n`);
  }

  /** Volume do Windows (0..1). */
  volume(timeoutMs = 4000): Promise<number> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('O Windows não respondeu o volume')), timeoutMs);
      this.waiting.push((line) => {
        clearTimeout(timer);
        const v = Number(line.slice(4));
        if (line.startsWith('vol ') && Number.isFinite(v)) resolve(v);
        else reject(new Error(line));
      });
      this.send(['vol']);
    });
  }

  stop(): void {
    this.child?.stdin.end();
    this.child = null;
  }
}

export function input(): Plugin {
  const helper = new InputHelper();
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/input')) return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
    if (process.platform !== 'win32') return sendJson(res, 501, { message: 'Só funciona no Windows' });
    // Mexer no mouse e no teclado é coisa do dono
    if (!hasFaceToken(req)) return sendJson(res, 403, { message: 'Rosto não verificado', code: 'face' });
    try {
      if (req.url === '/api/input/volume' && req.method === 'GET') return sendJson(res, 200, { volume: await helper.volume() });
      if (req.url !== '/api/input' || req.method !== 'POST') return next();
      const { cmds } = JSON.parse(await readBody(req, 8000)) as { cmds?: unknown };
      const lines = toLines(cmds);
      if (!lines) return sendJson(res, 400, { message: 'Comando inválido' });
      helper.send(lines);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      if (e instanceof BodyTooLargeError) return sendJson(res, 413, { message: 'Pedido grande demais' });
      return sendJson(res, 502, { message: e instanceof Error ? e.message : 'Falhou' });
    }
  };
  return {
    name: 'jarvis-input',
    configureServer: (server) => {
      server.middlewares.use(handler);
      server.httpServer?.once('close', () => helper.stop());
    },
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

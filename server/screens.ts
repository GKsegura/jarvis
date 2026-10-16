import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { encoded, POWERSHELL } from './actions';
import { isLocalRequest, readBody, sendJson } from './http';

export interface Screen {
  x: number;
  y: number;
  w: number;
  h: number;
  primary: boolean;
}

/** Título das janelas extras: é por ele que o servidor as acha para posicionar e fechar. */
export const SCREEN_TITLE = 'J.A.R.V.I.S. · TELA';

const LIST_SCREENS_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
$out = [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { [pscustomobject]@{ x = $_.Bounds.X; y = $_.Bounds.Y; w = $_.Bounds.Width; h = $_.Bounds.Height; primary = $_.Primary } }
ConvertTo-Json -InputObject @($out) -Compress
`;

export function parseScreens(out: string): Screen[] {
  try {
    const list = JSON.parse(out.trim()) as Screen[];
    return list.filter((s) => [s.x, s.y, s.w, s.h].every(Number.isFinite) && s.w > 0 && s.h > 0);
  } catch {
    return [];
  }
}

/**
 * Monitores que o painel deve ocupar: todos menos o que tem a janela principal do JARVIS
 * (o ponto `main` é o centro dela). Sem saber onde ela está, deixa o monitor principal livre.
 */
export function otherScreens(screens: Screen[], main: { x: number; y: number } | null): Screen[] {
  const contains = (s: Screen, p: { x: number; y: number }) => p.x >= s.x && p.x < s.x + s.w && p.y >= s.y && p.y < s.y + s.h;
  const host = main ? screens.find((s) => contains(s, main)) : undefined;
  return screens.filter((s) => (host ? s !== host : !s.primary));
}

const WIN32 = `
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class JarvisScreens {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int hh, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
  public static List<IntPtr> Find(string prefix) {
    var found = new List<IntPtr>();
    EnumWindows((h, l) => {
      if (!IsWindowVisible(h)) return true;
      var t = new StringBuilder(256); GetWindowText(h, t, 256);
      if (t.ToString().StartsWith(prefix)) found.Add(h);
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static void Focus(IntPtr h) {
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    SetForegroundWindow(h);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
  }
}
"@
`;

/** PowerShell que espera a janela da tela N aparecer, leva para o monitor dela e põe em tela cheia (F11). */
export function placeScript(index: number, s: Screen): string {
  const title = `${SCREEN_TITLE} ${index}`.replace(/'/g, "''");
  return `${WIN32}
$h = [IntPtr]::Zero
for ($i = 0; $i -lt 50 -and $h -eq [IntPtr]::Zero; $i++) {
  Start-Sleep -Milliseconds 200
  $list = [JarvisScreens]::Find('${title}')
  if ($list.Count -gt 0) { $h = $list[0] }
}
if ($h -eq [IntPtr]::Zero) { exit 2 }
[JarvisScreens]::ShowWindow($h, 9) | Out-Null
[JarvisScreens]::SetWindowPos($h, [IntPtr]::Zero, ${Math.round(s.x)}, ${Math.round(s.y)}, ${Math.round(s.w)}, ${Math.round(s.h)}, 0x0040) | Out-Null
Start-Sleep -Milliseconds 300
[JarvisScreens]::ShowWindow($h, 3) | Out-Null
[JarvisScreens]::Focus($h)
Start-Sleep -Milliseconds 300
# F11: tela cheia, sem a barra de título
[JarvisScreens]::keybd_event(0x7A, 0, 0, [UIntPtr]::Zero)
[JarvisScreens]::keybd_event(0x7A, 0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 300
# Devolve o foco para a janela principal do JARVIS
$main = [JarvisScreens]::Find('J.A.R.V.I.S.') | Where-Object { -not ([JarvisScreens]::Find('${SCREEN_TITLE}') -contains $_) } | Select-Object -First 1
if ($main) { [JarvisScreens]::Focus($main) }
exit 0
`;
}

/** PowerShell que fecha (WM_CLOSE) todas as janelas extras do JARVIS. Sai com o número de janelas fechadas. */
export const RELEASE_SCRIPT = `${WIN32}
$list = [JarvisScreens]::Find('${SCREEN_TITLE}')
foreach ($h in $list) { [JarvisScreens]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null }
exit $list.Count
`;

const CHROME_PATHS = [
  join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
];

function runPowerShell(script: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [...POWERSHELL, encoded(script)], { windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

const LOCAL_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/;

/**
 * "Jarvis, assume as telas": abre o painel de controle em tela cheia em cada monitor que não
 * tem a janela principal. Usa o mesmo perfil do Chrome do JARVIS.bat (permissões e flags iguais).
 */
export function screens(root: string): Plugin {
  const profile = join(root, '.chrome-profile');

  async function take(origin: string, main: { x: number; y: number } | null): Promise<number> {
    const chrome = CHROME_PATHS.find((p) => existsSync(p));
    if (!chrome) throw new Error('Google Chrome não encontrado');
    const all = parseScreens((await runPowerShell(LIST_SCREENS_SCRIPT)).out);
    const targets = otherScreens(all, main);
    if (targets.length === 0) return 0;
    // Já abertas: fecha antes, para não duplicar
    await runPowerShell(RELEASE_SCRIPT);
    mkdirSync(profile, { recursive: true });
    // Uma de cada vez: cada janela precisa do foco por um instante para entrar em tela cheia
    for (const [i, s] of targets.entries()) {
      const n = i + 2;
      spawn(
        chrome,
        [
          `--app=${origin}/?view=dashboard&screen=${n}`,
          `--user-data-dir=${profile}`,
          `--window-position=${s.x},${s.y}`,
          `--window-size=${s.w},${s.h}`,
          '--autoplay-policy=no-user-gesture-required',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-background-timer-throttling',
          '--no-first-run',
          '--no-default-browser-check',
        ],
        { detached: true, stdio: 'ignore' },
      ).unref();
      const placed = await runPowerShell(placeScript(n, s));
      if (placed.code !== 0) console.warn(`[telas] não achei a janela da tela ${n}`);
    }
    return targets.length;
  }

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/screens')) return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
    if (req.method !== 'POST') return next();
    if (process.platform !== 'win32') return sendJson(res, 501, { message: 'Só funciona no Windows' });
    try {
      if (req.url === '/api/screens/take') {
        const body = JSON.parse((await readBody(req)) || '{}') as { origin?: unknown; x?: unknown; y?: unknown };
        const origin = typeof body.origin === 'string' && LOCAL_ORIGIN.test(body.origin) ? body.origin : 'http://127.0.0.1:5173';
        const main = Number.isFinite(body.x) && Number.isFinite(body.y) ? { x: body.x as number, y: body.y as number } : null;
        return sendJson(res, 200, { screens: await take(origin, main) });
      }
      if (req.url === '/api/screens/release') {
        const { code } = await runPowerShell(RELEASE_SCRIPT);
        return sendJson(res, 200, { closed: code });
      }
      return next();
    } catch (e) {
      return sendJson(res, 500, { message: e instanceof Error ? e.message : 'Falhou' });
    }
  };

  return {
    name: 'jarvis-screens',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

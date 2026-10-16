import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { connect } from 'node:net';
import { resolve, win32 } from 'node:path';
import type { Plugin } from 'vite';
import { parseShortcuts, type Shortcut, type ShortcutPose } from '../src/handactions';
import type { ProjectStatus } from '../src/info';
import { hasFaceToken } from './face-store';
import { readConfigText } from './config-file';
import { isLocalRequest, readBody, sendJson } from './http';

export interface WindowMatch {
  /** Nome do processo, sem ".exe" (como no Gerenciador de Tarefas). */
  process: string;
  titleIncludes?: string;
  titleExcludes?: string;
}

export interface AppEntry {
  id: string;
  name: string;
  aliases: string[];
  open?: { uri: string } | { exe: string; args?: string[] };
  window?: WindowMatch;
}

export interface ProjectEntry {
  id: string;
  name: string;
  aliases: string[];
  /** Relativo à pasta do jarvis-hud. */
  cwd: string;
  command: string[];
  /** Como saber se o projeto está no ar: uma porta aberta ou um processo com janela. */
  check?: ProjectCheck;
}

export type ProjectCheck = { port: number } | { process: string; titleIncludes?: string };

const isCheck = (c: unknown): c is ProjectCheck => {
  const x = c as { port?: unknown; process?: unknown; titleIncludes?: unknown };
  if (Number.isInteger(x?.port)) return (x.port as number) > 0 && (x.port as number) < 65536;
  return typeof x?.process === 'string' && /^[\w.-]+$/.test(x.process) && (x.titleIncludes === undefined || typeof x.titleIncludes === 'string');
};

export interface ActionsConfig {
  apps: AppEntry[];
  projects: ProjectEntry[];
  /** Atalhos do menu na mão (palma parada). */
  handMenu: Shortcut[];
  /** Atalhos das poses (🤘, 🤙). */
  poses: Partial<Record<ShortcutPose, Shortcut>>;
}

export type ActionKind = 'open' | 'focus' | 'project';

const ID = /^[a-z0-9-]+$/;
const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s.length > 0);

/** Lê e valida o jarvis.config.json. Entradas malformadas são descartadas (com aviso). */
export function parseConfig(raw: unknown): ActionsConfig {
  const data = (raw ?? {}) as { apps?: unknown[]; projects?: unknown[]; handMenu?: unknown; poses?: unknown };
  const apps = (data.apps ?? []).filter((a): a is AppEntry => {
    const app = a as AppEntry;
    const ok = ID.test(app?.id ?? '') && typeof app.name === 'string' && isStrings(app.aliases) && (app.open !== undefined || app.window !== undefined);
    if (!ok) console.warn('[ações] app ignorado no jarvis.config.json:', a);
    return ok;
  });
  const projects = (data.projects ?? []).filter((p): p is ProjectEntry => {
    const project = p as ProjectEntry;
    const ok = ID.test(project?.id ?? '') && typeof project.name === 'string' && isStrings(project.aliases) && typeof project.cwd === 'string' && isStrings(project.command) && (project.check === undefined || isCheck(project.check));
    if (!ok) console.warn('[ações] projeto ignorado no jarvis.config.json:', p);
    return ok;
  });
  return { apps, projects, ...parseShortcuts(data) };
}

const expandEnv = (path: string) => path.replace(/%([A-Z_]+)%/gi, (_, name: string) => process.env[name] ?? '');

/** Texto literal seguro para PowerShell (aspas simples, com ' duplicado). */
const psString = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** O que fazer com a janela: trazer para a frente, mandar para o monitor ao lado, maximizar ou minimizar. */
export type WindowOp = 'focus' | 'left' | 'right' | 'maximize' | 'minimize';
export const WINDOW_OPS: readonly WindowOp[] = ['focus', 'left', 'right', 'maximize', 'minimize'];

// Teclas virtuais do Windows
const VK = { win: '0x5B', shift: '0x10', left: '0x25', right: '0x27' };

const AFTER_FOCUS: Record<WindowOp, string> = {
  focus: '',
  // Win+Shift+seta: o atalho do próprio Windows para mandar a janela ao monitor ao lado (dá a volta no último)
  left: pressKeys([VK.win, VK.shift, VK.left]),
  right: pressKeys([VK.win, VK.shift, VK.right]),
  maximize: '[JarvisWin]::ShowWindow($h, 3) | Out-Null',
  minimize: '[JarvisWin]::ShowWindow($h, 6) | Out-Null',
};

function pressKeys(keys: string[]): string {
  const down = keys.map((k) => `[JarvisWin]::keybd_event(${k}, 0, 0, [UIntPtr]::Zero)`);
  const up = [...keys].reverse().map((k) => `[JarvisWin]::keybd_event(${k}, 0, 2, [UIntPtr]::Zero)`);
  return ['Start-Sleep -Milliseconds 150', ...down, ...up].join('\n');
}

/** Script que traz a janela para a frente (restaura se estiver minimizada). Sai com 2 se não achar. */
export function focusScript(w: WindowMatch): string {
  return windowScript(w, 'focus');
}

/** Qual janela: a de um app da lista, uma janela aberta qualquer (pelo identificador) ou a que está em foco. */
export type WindowTarget = WindowMatch | { hwnd: number } | 'foreground';

function locate(target: WindowTarget): string {
  if (target === 'foreground') {
    return '$h = [JarvisWin]::GetForegroundWindow()\nif ($h -eq [IntPtr]::Zero) { exit 2 }';
  }
  if ('hwnd' in target) {
    if (!Number.isSafeInteger(target.hwnd) || target.hwnd <= 0) throw new Error('Janela inválida');
    return `$h = [IntPtr]${target.hwnd}\nif (-not [JarvisWin]::IsWindow($h)) { exit 2 }`;
  }
  const filters = ['$_.MainWindowHandle -ne 0'];
  if (target.titleIncludes) filters.push(`$_.MainWindowTitle -like ${psString(`*${target.titleIncludes}*`)}`);
  if (target.titleExcludes) filters.push(`$_.MainWindowTitle -notlike ${psString(`*${target.titleExcludes}*`)}`);
  return `$p = Get-Process -Name ${psString(target.process)} -ErrorAction SilentlyContinue | Where-Object { ${filters.join(' -and ')} } | Select-Object -First 1
if (-not $p) { exit 2 }
$h = $p.MainWindowHandle`;
}

/** Script que acha a janela e aplica a operação. Sai com 2 se não achar. */
export function windowScript(target: WindowTarget, op: WindowOp): string {
  return `
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class JarvisWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
}
"@
${locate(target)}
if ([JarvisWin]::IsIconic($h)) { [JarvisWin]::ShowWindow($h, 9) | Out-Null }
# O Windows só deixa trocar a janela da frente depois de uma tecla: um Alt "solto" libera
[JarvisWin]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
[JarvisWin]::SetForegroundWindow($h) | Out-Null
[JarvisWin]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
${AFTER_FOCUS[op]}
exit 0
`;
}

/** Comando para rodar o projeto numa janela de terminal própria, visível, na pasta dele. */
export function projectSpawn(project: ProjectEntry, root: string): { file: string; args: string[] } {
  const cwd = win32.resolve(root, project.cwd); // cmd.exe é só Windows; independe do SO que roda os testes
  return { file: 'cmd.exe', args: ['/d', '/c', 'start', `JARVIS - ${project.name}`, '/d', cwd, 'cmd', '/k', ...project.command] };
}

function run(file: string, args: string[], opts: { detached?: boolean } = {}): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(file, args, { windowsHide: true, detached: opts.detached, stdio: 'ignore' });
    child.on('error', reject);
    if (opts.detached) {
      child.unref();
      resolvePromise(0);
    } else child.on('close', (code) => resolvePromise(code ?? 1));
  });
}

export const encoded = (script: string) => Buffer.from(script, 'utf16le').toString('base64');
export const POWERSHELL = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand'];

/** Lista as janelas visíveis (com título) de todos os programas, incluindo várias do mesmo app. */
const LIST_WINDOWS_SCRIPT = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Add-Type @"
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class JarvisEnum {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int value, int size);
  public static List<string> List() {
    var result = new List<string>();
    EnumWindows((h, l) => {
      // Janelas "dono" (pop-ups) e apps da Store suspensos (cloaked) não contam
      if (!IsWindowVisible(h) || GetWindow(h, 4) != IntPtr.Zero) return true;
      int cloaked; if (DwmGetWindowAttribute(h, 14, out cloaked, 4) == 0 && cloaked != 0) return true;
      var title = new StringBuilder(512); GetWindowText(h, title, 512);
      if (title.Length == 0) return true;
      uint pid; GetWindowThreadProcessId(h, out pid);
      result.Add(h.ToInt64() + "|" + pid + "|" + title.ToString());
      return true;
    }, IntPtr.Zero);
    return result;
  }
}
"@
$out = foreach ($line in [JarvisEnum]::List()) {
  $p = $line.Split('|', 3)
  $proc = Get-Process -Id $p[1] -ErrorAction SilentlyContinue
  if ($p[2] -ne 'Program Manager') { [pscustomobject]@{ hwnd = [int64]$p[0]; process = $proc.ProcessName; title = $p[2] } }
}
ConvertTo-Json -InputObject @($out) -Compress
`;

export interface OpenWindow {
  hwnd: number;
  process: string;
  title: string;
}

/** Janelas abertas agora (para "mover o Discord para o outro monitor" etc.). */
export function listWindows(): Promise<OpenWindow[]> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('powershell.exe', [...POWERSHELL, encoded(LIST_WINDOWS_SCRIPT)], { windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', () => {
      try {
        const list = JSON.parse(out.trim() || '[]') as OpenWindow[];
        resolvePromise(list.filter((w) => w && Number.isSafeInteger(w.hwnd) && w.title));
      } catch {
        reject(new Error('Não consegui listar as janelas'));
      }
    });
  });
}

async function focusWindow(w: WindowTarget, op: WindowOp = 'focus'): Promise<boolean> {
  const code = await run('powershell.exe', [...POWERSHELL, encoded(windowScript(w, op))]);
  return code === 0;
}

const OP_DONE: Record<Exclude<WindowOp, 'focus'>, string> = {
  left: 'movido para o monitor da esquerda',
  right: 'movido para o monitor ao lado',
  maximize: 'maximizado',
  minimize: 'minimizado',
};

/** Move, maximiza ou minimiza a janela de um app da lista. */
export async function windowAction(config: ActionsConfig, id: string, op: WindowOp): Promise<string> {
  const app = config.apps.find((a) => a.id === id);
  if (!app) throw new Error(`Aplicativo desconhecido: ${id}`);
  if (!app.window) throw new Error(`${app.name} não tem janela configurada`);
  if (!(await focusWindow(app.window, op))) throw new Error(`${app.name} não está aberto`);
  return op === 'focus' ? `${app.name} na frente` : `${app.name} ${OP_DONE[op]}`;
}

async function openApp(app: AppEntry): Promise<void> {
  if (!app.open) throw new Error(`${app.name} não tem como ser aberto`);
  if ('uri' in app.open) await run('explorer.exe', [app.open.uri], { detached: true });
  else {
    const exe = expandEnv(app.open.exe);
    if (exe.includes('/') || exe.includes('\\')) {
      if (!existsSync(exe)) throw new Error(`${app.name} não encontrado em ${exe}`);
    }
    await run(exe, app.open.args ?? [], { detached: true });
  }
}

/** Executa uma ação da lista. Lança erro com mensagem amigável se não der. */
export async function runAction(config: ActionsConfig, root: string, kind: ActionKind, id: string): Promise<string> {
  if (kind === 'project') {
    const project = config.projects.find((p) => p.id === id);
    if (!project) throw new Error(`Projeto desconhecido: ${id}`);
    const cwd = resolve(root, project.cwd);
    if (!existsSync(cwd)) throw new Error(`Pasta do ${project.name} não encontrada: ${cwd}`);
    const { file, args } = projectSpawn(project, root);
    await run(file, args, { detached: true });
    return `${project.name} iniciado numa janela de terminal`;
  }

  const app = config.apps.find((a) => a.id === id);
  if (!app) throw new Error(`Aplicativo desconhecido: ${id}`);
  if (kind === 'focus' && app.window) {
    if (await focusWindow(app.window)) return `${app.name} na frente`;
    // Não está aberto: abre e tenta trazer para a frente quando a janela aparecer
    if (!app.open) throw new Error(`${app.name} não está aberto`);
    await openApp(app);
    setTimeout(() => void focusWindow(app.window!), 2500);
    return `${app.name} aberto`;
  }
  await openApp(app);
  if (app.window) setTimeout(() => void focusWindow(app.window!), 2000);
  return `${app.name} aberto`;
}

/** A porta está aceitando conexões em 127.0.0.1? */
export function portOpen(port: number, timeoutMs = 500): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = connect({ host: '127.0.0.1', port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolvePromise(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

/** Títulos das janelas de um processo, pelo tasklist (bem mais rápido que subir um PowerShell). */
export function parseTasklist(out: string): string[] {
  return out
    .split(/\r?\n/)
    .filter((line) => line.startsWith('"'))
    .map((line) => line.slice(1, -1).split('","').pop() ?? '')
    .filter((title) => title && title !== 'N/A');
}

function processTitles(name: string): Promise<string[] | null> {
  return new Promise((resolvePromise) => {
    const exe = name.toLowerCase().endsWith('.exe') ? name : `${name}.exe`;
    const child = spawn('tasklist', ['/FI', `IMAGENAME eq ${exe}`, '/V', '/FO', 'CSV', '/NH'], { windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', () => resolvePromise(null));
    child.on('close', () => resolvePromise(parseTasklist(out)));
  });
}

async function isRunning(check: ProjectCheck): Promise<boolean> {
  if ('port' in check) return portOpen(check.port);
  const titles = await processTitles(check.process);
  if (!titles) return false;
  const want = check.titleIncludes?.toLowerCase();
  return want ? titles.some((t) => t.toLowerCase().includes(want)) : titles.length > 0;
}

/** Quais projetos estão no ar agora (os sem "check" voltam como running: null). */
export async function projectsStatus(config: ActionsConfig): Promise<ProjectStatus[]> {
  return Promise.all(
    config.projects.map(async (p) => ({ id: p.id, name: p.name, running: p.check ? await isRunning(p.check) : null })),
  );
}

/** Lê o jarvis.config.json (relido a cada vez: dá para editar sem reiniciar). */
export function loadConfig(root: string): ActionsConfig {
  try {
    return parseConfig(JSON.parse(readConfigText(root)));
  } catch (e) {
    console.warn('[ações] não consegui ler o jarvis.config.json:', e);
    return { apps: [], projects: [], handMenu: [], poses: {} };
  }
}

/** Ações no PC a partir de uma lista fixa (jarvis.config.json). Nunca roda comando livre. */
export function actions(root: string): Plugin {

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/actions')) return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
    // Relido a cada pedido: dá para editar o jarvis.config.json sem reiniciar o servidor
    const config = loadConfig(root);
    if (req.url === '/api/actions/list') {
      const pick = ({ id, name, aliases }: { id: string; name: string; aliases: string[] }) => ({ id, name, aliases });
      return sendJson(res, 200, { apps: config.apps.map(pick), projects: config.projects.map(pick), handMenu: config.handMenu, poses: config.poses });
    }
    if (req.url === '/api/actions/status') return sendJson(res, 200, { projects: await projectsStatus(config) });
    if (req.url === '/api/actions/windows') {
      if (!hasFaceToken(req)) return sendJson(res, 403, { message: 'Rosto não verificado', code: 'face' });
      try {
        return sendJson(res, 200, { windows: await listWindows() });
      } catch (e) {
        return sendJson(res, 502, { message: e instanceof Error ? e.message : 'Falhou' });
      }
    }
    if (req.url !== '/api/actions/run' || req.method !== 'POST') return next();
    if (!hasFaceToken(req)) return sendJson(res, 403, { message: 'Rosto não verificado', code: 'face' });
    try {
      const body = JSON.parse(await readBody(req)) as { kind?: unknown; id?: unknown; op?: unknown; hwnd?: unknown; target?: unknown };
      const { kind, id, op } = body;
      if (kind === 'window') {
        if (!WINDOW_OPS.includes(op as WindowOp)) return sendJson(res, 400, { message: 'Ação de janela inválida' });
        // Qualquer janela aberta (pelo identificador) ou a que está em foco: só move/foca, nunca executa nada
        if (body.target === 'foreground' || typeof body.hwnd === 'number') {
          const target: WindowTarget = body.target === 'foreground' ? 'foreground' : { hwnd: body.hwnd as number };
          if (!(await focusWindow(target, op as WindowOp))) return sendJson(res, 422, { message: 'Janela não encontrada' });
          return sendJson(res, 200, { ok: true, message: `janela: ${op}` });
        }
        if (typeof id !== 'string' || !ID.test(id)) return sendJson(res, 400, { message: 'Ação de janela inválida' });
        return sendJson(res, 200, { ok: true, message: await windowAction(config, id, op as WindowOp) });
      }
      if (kind !== 'open' && kind !== 'focus' && kind !== 'project') return sendJson(res, 400, { message: 'Ação inválida' });
      if (typeof id !== 'string' || !ID.test(id)) return sendJson(res, 400, { message: 'Id inválido' });
      return sendJson(res, 200, { ok: true, message: await runAction(config, root, kind, id) });
    } catch (e) {
      return sendJson(res, 422, { message: e instanceof Error ? e.message : 'Falhou' });
    }
  };

  return {
    name: 'jarvis-actions',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

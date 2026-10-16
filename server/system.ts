import { spawn } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { cpus, freemem, totalmem, uptime } from 'node:os';
import type { Plugin } from 'vite';
import type { SystemInfo } from '../src/info';
import { encoded, POWERSHELL } from './actions';
import { isLocalRequest, sendJson } from './http';

interface CpuTimes {
  idle: number;
  total: number;
}

const cpuTimes = (): CpuTimes =>
  cpus().reduce(
    (acc, c) => {
      const t = c.times;
      return { idle: acc.idle + t.idle, total: acc.total + t.user + t.nice + t.sys + t.idle + t.irq };
    },
    { idle: 0, total: 0 },
  );

/** Uso da CPU (0..100) entre duas leituras de os.cpus(). */
export function cpuPercent(prev: CpuTimes, next: CpuTimes): number {
  const total = next.total - prev.total;
  if (total <= 0) return 0;
  return Math.round(Math.min(100, Math.max(0, (1 - (next.idle - prev.idle) / total) * 100)));
}

/** Bateria e rede pelo Windows (um PowerShell só, porque cada um leva alguns segundos para subir). */
const EXTRAS_SCRIPT = `
$b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue | Select-Object -First 1
$n = Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface -ErrorAction SilentlyContinue
$online = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue | Where-Object { $_.IPv4Connectivity -eq 'Internet' -or $_.IPv6Connectivity -eq 'Internet' }).Count -gt 0
[pscustomobject]@{
  battery = if ($b) { [int]$b.EstimatedChargeRemaining } else { $null }
  charging = if ($b) { $b.BatteryStatus -eq 2 } else { $null }
  down = [int64](($n | Measure-Object BytesReceivedPersec -Sum).Sum)
  up = [int64](($n | Measure-Object BytesSentPersec -Sum).Sum)
  online = $online
} | ConvertTo-Json -Compress
`;

interface Extras {
  battery: number | null;
  charging: boolean | null;
  down: number;
  up: number;
  online: boolean;
}

export function parseExtras(out: string): Extras | null {
  try {
    const d = JSON.parse(out.trim()) as Partial<Extras>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    return {
      battery: typeof d.battery === 'number' ? d.battery : null,
      charging: typeof d.charging === 'boolean' ? d.charging : null,
      down: num(d.down),
      up: num(d.up),
      online: d.online === true,
    };
  } catch {
    return null;
  }
}

const EXTRAS_EVERY_MS = 15_000;
let extras: Extras | null = null;
let extrasAt = 0;
let extrasBusy = false;

function refreshExtras(): void {
  if (process.platform !== 'win32' || extrasBusy || Date.now() - extrasAt < EXTRAS_EVERY_MS) return;
  extrasBusy = true;
  const child = spawn('powershell.exe', [...POWERSHELL, encoded(EXTRAS_SCRIPT)], { windowsHide: true });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.on('error', () => (extrasBusy = false));
  child.on('close', () => {
    extrasBusy = false;
    extrasAt = Date.now();
    extras = parseExtras(out) ?? extras;
  });
}

let lastCpu = cpuTimes();
let lastCpuPercent = 0;

/** Estado do PC agora. A CPU é medida desde a leitura anterior (o cliente pede a cada poucos segundos). */
export async function systemSnapshot(): Promise<SystemInfo> {
  const now = cpuTimes();
  // Intervalo curto demais (dois pedidos seguidos) dá um número sem sentido: mantém o anterior
  if (now.total - lastCpu.total >= 500) {
    lastCpuPercent = cpuPercent(lastCpu, now);
    lastCpu = now;
  }
  refreshExtras();
  let disk: SystemInfo['disk'] = null;
  try {
    const s = await statfs(process.platform === 'win32' ? 'C:\\' : '/');
    disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    /* sem disco: painel mostra "—" */
  }
  return {
    cpu: lastCpuPercent,
    cores: cpus().length,
    memTotal: totalmem(),
    memFree: freemem(),
    disk,
    uptimeSec: Math.round(uptime()),
    battery: extras?.battery ?? null,
    charging: extras?.charging ?? null,
    online: extras ? extras.online : null,
    netDown: extras?.down ?? null,
    netUp: extras?.up ?? null,
  };
}

/** Estado real do PC (CPU, memória, disco, bateria, rede) para o painel SISTEMA. */
export function system(): Plugin {
  refreshExtras();
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url !== '/api/system') return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
    return sendJson(res, 200, await systemSnapshot());
  };
  return {
    name: 'jarvis-system',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

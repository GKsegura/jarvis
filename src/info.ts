import type { VoiceStyle } from './lines';

/** GET /api/system (server/system.ts). */
export interface SystemInfo {
  /** Uso da CPU, 0..100. */
  cpu: number;
  cores: number;
  memTotal: number;
  memFree: number;
  /** Disco principal (C:), em bytes. */
  disk: { total: number; free: number } | null;
  uptimeSec: number;
  /** Carga da bateria (0..100) ou null quando o PC não tem bateria. */
  battery: number | null;
  charging: boolean | null;
  /** null enquanto o Windows ainda não respondeu. */
  online: boolean | null;
  /** Bytes por segundo. */
  netDown: number | null;
  netUp: number | null;
}

/** GET /api/weather (server/weather.ts). */
export interface WeatherInfo {
  place: string;
  temp: number;
  feels: number;
  humidity: number;
  wind: number;
  code: number;
  isDay: boolean;
  max: number;
  min: number;
  /** Maior chance de chuva do resto do dia, 0..100. */
  rainChance: number;
  /** Próximas horas. */
  hours: Array<{ hour: number; temp: number; rain: number; code: number }>;
}

/** GET /api/actions/status (server/actions.ts). `running: null` = projeto sem verificação configurada. */
export interface ProjectStatus {
  id: string;
  name: string;
  running: boolean | null;
}

/** Lembretes e timers (server/reminders.ts). */
export interface Reminder {
  id: string;
  text: string;
  /** Data/hora em ms (Date.now()). */
  dueAt: number;
  kind: 'timer' | 'reminder';
  done: boolean;
  createdAt: number;
}

/** Códigos de tempo da OMM usados pelo Open-Meteo. */
const WEATHER_CODES: Array<[number[], string, string]> = [
  [[0], 'céu limpo', 'clear skies'],
  [[1], 'quase sem nuvens', 'mainly clear'],
  [[2], 'parcialmente nublado', 'partly cloudy'],
  [[3], 'nublado', 'overcast'],
  [[45, 48], 'neblina', 'fog'],
  [[51, 53, 55, 56, 57], 'garoa', 'drizzle'],
  [[61, 63, 66], 'chuva', 'rain'],
  [[65, 67], 'chuva forte', 'heavy rain'],
  [[71, 73, 75, 77], 'neve', 'snow'],
  [[80, 81], 'pancadas de chuva', 'rain showers'],
  [[82], 'pancadas fortes de chuva', 'violent rain showers'],
  [[85, 86], 'pancadas de neve', 'snow showers'],
  [[95], 'tempestade', 'thunderstorm'],
  [[96, 99], 'tempestade com granizo', 'thunderstorm with hail'],
];

export function weatherLabel(code: number, style: VoiceStyle = 'br'): string {
  const entry = WEATHER_CODES.find(([codes]) => codes.includes(code));
  return entry ? entry[style === 'uk' ? 2 : 1] : style === 'uk' ? 'unknown' : 'tempo indefinido';
}

const GB = 1024 ** 3;
export const formatGb = (bytes: number) => `${(bytes / GB).toFixed(bytes >= 100 * GB ? 0 : 1)} GB`;

/** "1,2 MB/s", "340 KB/s". */
export function formatRate(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 ** 2) return `${(bytesPerSec / 1024 ** 2).toFixed(1)} MB/s`;
  return `${Math.round(bytesPerSec / 1024)} KB/s`;
}

/** "2d 4h", "3h 12m", "8m". */
export function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/** Quanto falta, para o painel: "24:59", "1h 05m", "amanhã 08:00". */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export const memPercent = (s: SystemInfo) => Math.round(((s.memTotal - s.memFree) / s.memTotal) * 100);
export const diskPercent = (s: SystemInfo) => (s.disk ? Math.round(((s.disk.total - s.disk.free) / s.disk.total) * 100) : null);

const joinList = (items: string[], and: string) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;

/** "Status": o estado real do PC e dos projetos, para falar. */
export function systemSpeech(s: SystemInfo, projects: ProjectStatus[], style: VoiceStyle = 'br'): string {
  const uk = style === 'uk';
  const parts = [
    uk ? `CPU at ${s.cpu} percent, memory at ${memPercent(s)} percent.` : `CPU em ${s.cpu} por cento, memória em ${memPercent(s)} por cento.`,
  ];
  const disk = diskPercent(s);
  if (disk !== null && disk >= 85) parts.push(uk ? `The main disk is ${disk} percent full, sir.` : `O disco principal está ${disk} por cento cheio, senhor.`);
  if (s.battery !== null) {
    parts.push(
      uk
        ? `Battery at ${s.battery} percent${s.charging ? ', charging' : ''}.`
        : `Bateria em ${s.battery} por cento${s.charging ? ', carregando' : ''}.`,
    );
  }
  if (s.online === false) parts.push(uk ? 'No internet connection.' : 'Sem conexão com a internet.');
  parts.push(projectsSpeech(projects, style));
  return parts.join(' ');
}

export function projectsSpeech(projects: ProjectStatus[], style: VoiceStyle = 'br'): string {
  const uk = style === 'uk';
  const checked = projects.filter((p) => p.running !== null);
  const running = checked.filter((p) => p.running).map((p) => p.name);
  if (checked.length === 0) return uk ? 'No projects are being monitored.' : 'Nenhum projeto está sendo monitorado.';
  if (running.length === 0) return uk ? 'None of your projects are running.' : 'Nenhum dos seus projetos está rodando.';
  if (running.length === checked.length) return uk ? 'All of your projects are running.' : 'Todos os seus projetos estão rodando.';
  return uk
    ? `Running: ${joinList(running, 'and')}.`
    : `${joinList(running, 'e')} ${running.length > 1 ? 'estão' : 'está'} no ar.`;
}

export function weatherSpeech(w: WeatherInfo, style: VoiceStyle = 'br'): string {
  const t = (v: number) => Math.round(v);
  if (style === 'uk') {
    const rain = w.rainChance >= 30 ? ` There is a ${w.rainChance} percent chance of rain later.` : ' No rain expected.';
    return `${t(w.temp)} degrees in ${w.place}, ${weatherLabel(w.code, 'uk')}. Today's high is ${t(w.max)}, low ${t(w.min)}.${rain}`;
  }
  const feels = Math.abs(w.feels - w.temp) >= 2 ? `, sensação de ${t(w.feels)}` : '';
  const rain =
    w.rainChance >= 60
      ? ` Leve o guarda-chuva, senhor: ${w.rainChance} por cento de chance de chuva.`
      : w.rainChance >= 30
        ? ` Há ${w.rainChance} por cento de chance de chuva.`
        : ' Sem previsão de chuva.';
  return `${t(w.temp)} graus em ${w.place}${feels}, ${weatherLabel(w.code)}. Máxima de ${t(w.max)} e mínima de ${t(w.min)}.${rain}`;
}

/** "às 19:30", "amanhã às 8:00", "dia 15 às 9:00". */
export function whenSpeech(dueAt: number, now = Date.now(), style: VoiceStyle = 'br'): string {
  const due = new Date(dueAt);
  const today = new Date(now);
  const time = due.toLocaleTimeString(style === 'uk' ? 'en-GB' : 'pt-BR', { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date(due).setHours(0, 0, 0, 0) - new Date(today).setHours(0, 0, 0, 0)) / 86_400_000);
  if (style === 'uk') return days === 0 ? `at ${time}` : days === 1 ? `tomorrow at ${time}` : `on the ${due.getDate()} at ${time}`;
  return days === 0 ? `às ${time}` : days === 1 ? `amanhã às ${time}` : `dia ${due.getDate()} às ${time}`;
}

/** "25 minutos", "1 hora e 30 minutos", "30 segundos". */
export function durationSpeech(ms: number, style: VoiceStyle = 'br'): string {
  const uk = style === 'uk';
  if (ms < 60_000) {
    const s = Math.max(1, Math.round(ms / 1000));
    return uk ? `${s} second${s > 1 ? 's' : ''}` : `${s} ${s > 1 ? 'segundos' : 'segundo'}`;
  }
  const min = Math.round(ms / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (uk) return [h && `${h} hour${h > 1 ? 's' : ''}`, m && `${m} minute${m > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
  return [h && `${h} ${h > 1 ? 'horas' : 'hora'}`, m && `${m} ${m > 1 ? 'minutos' : 'minuto'}`].filter(Boolean).join(' e ');
}

/** "daqui a 3 minutos", "in 3 minutes". */
export function inSpeech(ms: number, style: VoiceStyle = 'br'): string {
  return `${style === 'uk' ? 'in' : 'daqui a'} ${durationSpeech(Math.max(60_000, ms), style)}`;
}

export function remindersSpeech(list: Reminder[], now = Date.now(), style: VoiceStyle = 'br'): string {
  const pending = list.filter((r) => !r.done).sort((a, b) => a.dueAt - b.dueAt);
  const uk = style === 'uk';
  if (pending.length === 0) return uk ? 'You have no pending reminders, sir.' : 'O senhor não tem lembretes pendentes.';
  const items = pending.slice(0, 4).map((r) =>
    r.kind === 'timer' ? `${uk ? 'a timer that ends' : 'um timer que termina'} ${inSpeech(r.dueAt - now, style)}` : `${r.text} ${whenSpeech(r.dueAt, now, style)}`,
  );
  const extra = pending.length > 4 ? (uk ? `, and ${pending.length - 4} more` : `, e mais ${pending.length - 4}`) : '';
  return `${uk ? 'You have' : 'O senhor tem'}: ${joinList(items, uk ? 'and' : 'e')}${extra}.`;
}

export function timeSpeech(date = new Date(), style: VoiceStyle = 'br'): string {
  const h = date.getHours();
  const m = date.getMinutes();
  if (style === 'uk') return `It's ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}, sir.`;
  const hours = h === 0 ? 'meia-noite' : h === 12 ? 'meio-dia' : h === 1 ? 'uma hora' : `${h} horas`;
  const verb = h === 0 || h === 1 || h === 12 ? 'É' : 'São';
  return m === 0 ? `${verb} ${hours} em ponto, senhor.` : `${verb} ${hours} e ${m} ${m === 1 ? 'minuto' : 'minutos'}, senhor.`;
}

export function dateSpeech(date = new Date(), style: VoiceStyle = 'br'): string {
  if (style === 'uk') return `Today is ${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`;
  return `Hoje é ${date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`;
}

/** Resumo do dia (polegar no peito ou "Jarvis, resumo do dia"): hora, clima, lembretes de hoje e projetos no ar. */
export function daySummarySpeech(
  d: { now: Date; greeting: string; weather: WeatherInfo | null; reminders: Reminder[] | null; projects: ProjectStatus[] | null; personal: boolean },
  style: VoiceStyle = 'br',
): string {
  const uk = style === 'uk';
  const time = d.now.toLocaleTimeString(uk ? 'en-GB' : 'pt-BR', { hour: '2-digit', minute: '2-digit' });
  const parts = [uk ? `${d.greeting}, sir. It's ${time}.` : `${d.greeting}, senhor. São ${time}.`];
  if (d.weather) {
    const w = d.weather;
    const rain = w.rainChance >= 30 ? (uk ? `, ${w.rainChance} percent chance of rain` : `, com ${w.rainChance} por cento de chance de chuva`) : '';
    parts.push(
      uk
        ? `${Math.round(w.temp)} degrees and ${weatherLabel(w.code, 'uk')} in ${w.place}, high of ${Math.round(w.max)}${rain}.`
        : `Em ${w.place}, ${Math.round(w.temp)} graus e ${weatherLabel(w.code)}, máxima de ${Math.round(w.max)}${rain}.`,
    );
  }
  if (d.personal && d.reminders) {
    const end = new Date(d.now);
    end.setHours(23, 59, 59, 999);
    const today = d.reminders.filter((r) => !r.done && r.dueAt >= d.now.getTime() && r.dueAt <= end.getTime()).sort((a, b) => a.dueAt - b.dueAt);
    if (today.length === 0) parts.push(uk ? 'Nothing else on your schedule today.' : 'Não há mais lembretes para hoje.');
    else {
      const items = today.slice(0, 3).map((r) => (r.kind === 'timer' ? (uk ? 'a timer' : 'um timer') : `${r.text} ${whenSpeech(r.dueAt, d.now.getTime(), style)}`));
      parts.push(`${uk ? 'Still today' : 'Ainda hoje'}: ${joinList(items, uk ? 'and' : 'e')}.`);
    }
  }
  if (d.projects?.length) parts.push(projectsSpeech(d.projects, style));
  return parts.join(' ');
}

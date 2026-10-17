/**
 * Rotinas aprendidas: o JARVIS anota o que o senhor faz (abrir um app, tocar uma música, pedir o
 * resumo do dia) e, quando percebe que se repete no mesmo horário em vários dias, PERGUNTA se deve
 * fazer isso sozinho. Nada vira rotina sem o "sim". Tudo aqui é puro, para poder testar.
 */

export type UsageKind = 'app' | 'music' | 'command';

export interface UsageEvent {
  ts: number;
  kind: UsageKind;
  /** Id do app, trecho da música ou nome do comando. Nunca texto livre da conversa. */
  key: string;
}

export type RoutineState = 'accepted' | 'declined';

export interface Routine {
  id: string;
  kind: UsageKind;
  key: string;
  /** Minutos desde a meia-noite. */
  minute: number;
  state: RoutineState;
  /** Dia (toDateString) em que rodou pela última vez. */
  lastRunDay?: string;
}

export interface Candidate {
  kind: UsageKind;
  key: string;
  /** Horário típico, em minutos desde a meia-noite. */
  minute: number;
  /** Em quantos dias diferentes aconteceu por volta desse horário. */
  days: number;
}

/** Dias distintos mínimos para sugerir. */
export const MIN_DAYS = 3;
/** Janela de observação. */
export const WINDOW_DAYS = 14;
/** Diferença máxima de horário entre as ocorrências para contar como "mesmo horário". */
export const SPREAD_MIN = 60;
/** A sugestão aparece a partir de tanto antes do horário típico... */
export const SUGGEST_BEFORE_MIN = 15;
/** ...e até tanto depois. */
export const SUGGEST_AFTER_MIN = 45;
/** Uma rotina aceita roda até tanto depois do horário (se o JARVIS estava desligado, não executa tarde demais). */
export const RUN_AFTER_MIN = 30;

const DAY_MS = 86_400_000;

export const minuteOfDay = (ts: number): number => {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
};

export const routineId = (kind: UsageKind, key: string): string => `${kind}:${key}`;

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

/** Padrões: algo feito em pelo menos MIN_DAYS dias diferentes, sempre por volta da mesma hora. */
export function detectCandidates(events: UsageEvent[], now: number): Candidate[] {
  const since = now - WINDOW_DAYS * DAY_MS;
  const groups = new Map<string, UsageEvent[]>();
  for (const e of events) {
    if (e.ts < since || e.ts > now) continue;
    const id = routineId(e.kind, e.key);
    groups.set(id, [...(groups.get(id) ?? []), e]);
  }
  const out: Candidate[] = [];
  for (const list of groups.values()) {
    // Um evento por dia (o primeiro), para repetir no mesmo dia não contar como hábito
    const byDay = new Map<string, number>();
    for (const e of [...list].sort((a, b) => a.ts - b.ts)) {
      const day = new Date(e.ts).toDateString();
      if (!byDay.has(day)) byDay.set(day, minuteOfDay(e.ts));
    }
    const minutes = [...byDay.values()];
    if (minutes.length < MIN_DAYS) continue;
    const center = median(minutes);
    const near = minutes.filter((m) => Math.abs(m - center) <= SPREAD_MIN);
    if (near.length >= MIN_DAYS) out.push({ kind: list[0].kind, key: list[0].key, minute: median(near), days: near.length });
  }
  return out.sort((a, b) => b.days - a.days);
}

/** A primeira sugestão que vale perguntar agora: não conhecida, e já perto do horário típico. */
export function nextSuggestion(candidates: Candidate[], routines: Routine[], now: number): Candidate | null {
  const known = new Set(routines.map((r) => r.id));
  const minute = minuteOfDay(now);
  return (
    candidates.find((c) => {
      if (known.has(routineId(c.kind, c.key))) return false;
      const diff = minute - c.minute;
      return diff >= -SUGGEST_BEFORE_MIN && diff <= SUGGEST_AFTER_MIN;
    }) ?? null
  );
}

/** Rotinas aceitas cuja hora chegou e que ainda não rodaram hoje. */
export function dueRoutines(routines: Routine[], now: number): Routine[] {
  const minute = minuteOfDay(now);
  const today = new Date(now).toDateString();
  return routines.filter((r) => r.state === 'accepted' && r.lastRunDay !== today && minute >= r.minute && minute - r.minute <= RUN_AFTER_MIN);
}

export const clock = (minute: number): string => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** Fala natural do que a rotina faz: "abrir o vscode", "tocar Legião Urbana", "pedir o resumo do dia". */
export function routineLabel(kind: UsageKind, key: string, appName?: string): string {
  if (kind === 'app') return `abrir o ${appName ?? key}`;
  if (kind === 'music') return `tocar ${key}`;
  return COMMAND_LABELS[key] ?? `pedir "${key}"`;
}

const COMMAND_LABELS: Record<string, string> = {
  daySummary: 'pedir o resumo do dia',
  weather: 'ver o clima',
  status: 'ver o status do PC',
  reminders: 'ver os lembretes',
  projects: 'ver os projetos',
};

/** Comandos que uma rotina aceita pode executar sozinha (só leitura e informação, nada que mexa no PC). */
export const AUTO_COMMANDS = new Set(['daySummary', 'weather', 'status', 'reminders', 'projects']);

/** Garante que uma rotina vinda do arquivo faz sentido (o arquivo pode ter sido editado à mão). */
export function isRoutine(x: unknown): x is Routine {
  const r = x as Routine;
  return (
    typeof r?.id === 'string' &&
    ['app', 'music', 'command'].includes(r.kind) &&
    typeof r.key === 'string' &&
    Number.isInteger(r.minute) &&
    r.minute >= 0 &&
    r.minute < 1440 &&
    (r.state === 'accepted' || r.state === 'declined')
  );
}

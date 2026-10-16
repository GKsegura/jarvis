import { normalize } from './intents';

/** O que o senhor pediu: um timer ("timer de 25 minutos") ou um lembrete com texto e hora. */
export type TimeRequest =
  | { kind: 'timer'; ms: number }
  | { kind: 'reminder'; text: string; dueAt: number };

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30, quarenta: 40,
};

const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUMBER_WORDS[s] ?? NaN);
const NUM = '(\\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta|quarenta)';
const UNIT = '(segundos?|minutos?|min|horas?|h)';

const unitMs = (unit: string) => (unit.startsWith('s') ? 1000 : unit.startsWith('h') ? 3_600_000 : 60_000);

/** "25 minutos", "1 hora e 30 minutos", "meia hora", "uma hora e meia" → ms. */
export function parseDuration(text: string): number | null {
  const t = normalize(text);
  if (/\bmeia hora\b/.test(t)) return 30 * 60_000;
  const re = new RegExp(`\\b${NUM}\\s*${UNIT}\\b`, 'g');
  let total = 0;
  for (const m of t.matchAll(re)) {
    const n = num(m[1]);
    if (Number.isFinite(n)) total += n * unitMs(m[2]);
  }
  if (/\bhoras? e meia\b/.test(t) && total > 0) total += 30 * 60_000;
  return total > 0 ? total : null;
}

/** "às 19h", "às 19:30", "às 7 da noite", "amanhã às 8", "ao meio-dia" → data/hora (ms). */
export function parseClock(text: string, now = new Date()): number | null {
  const t = normalize(text);
  let hour: number | null = null;
  let minute = 0;
  // "as 19h", "as 19h30", "as 19 30" (o ":" some na normalização), "as 7 e meia", "as 7 da noite".
  // O (?!\d) e o (?!...minutos) evitam ler "daqui a 10 minutos" como "às 10"
  const m = t.match(
    /\b(?:as|a|para as|pras|pra)\s+(\d{1,2})(?!\d)(?:\s*h(?:oras?)?\s*(\d{2})?|\s+(\d{2})(?!\d)|\s+e\s+(meia|\d{1,2}))?(?!\s*(?:minutos?|min|segundos?)\b)(?:\s+(?:da|de)\s+(manha|tarde|noite))?/,
  );
  if (m) {
    hour = Number(m[1]);
    minute = m[4] === 'meia' ? 30 : Number(m[2] ?? m[3] ?? m[4] ?? 0);
    const period = m[5];
    if ((period === 'tarde' || period === 'noite') && hour < 12) hour += 12;
  } else if (/\bmeio dia\b/.test(t)) hour = 12;
  else if (/\bmeia noite\b/.test(t)) hour = 0;
  if (hour === null || hour > 23 || minute > 59) return null;

  const due = new Date(now);
  due.setHours(hour, minute, 0, 0);
  if (/\bamanha\b/.test(t)) due.setDate(due.getDate() + 1);
  // Hora que já passou hoje: é a de amanhã
  else if (due.getTime() <= now.getTime()) due.setDate(due.getDate() + 1);
  return due.getTime();
}

/** O assunto do lembrete: "me lembra de beber água daqui a 10 minutos" → "beber água". */
export function reminderText(original: string): string {
  return original
    .replace(/^\s*(?:ei\s+|ok\s+)?jarvis[,\s]*/i, '')
    .replace(/^.*?\b(?:me\s+)?(?:lembr[a-z]*|avis[a-z]*)\s+(?:(?:de|que|para|pra)\s+)?/i, '')
    .replace(/\b(?:daqui a|daqui|em|dentro de)\s+\S+\s+(?:segundos?|minutos?|min|horas?|h)(?:\s+e\s+(?:meia|\S+\s+(?:minutos?|min)))?/gi, '')
    .replace(/\b(?:daqui a|em|dentro de)\s+meia hora\b/gi, '')
    // Sem \b perto de letras acentuadas: no JavaScript o \b só conhece letras sem acento
    .replace(/(?:^|\s)(?:amanhã|amanha|hoje)(?![\wà-ú])/gi, ' ')
    .replace(/(?:^|\s)(?:às|as|a|para as|pras|pra)\s+\d{1,2}(?:\s*(?:h|horas?|:)\s*(?:\d{2})?|\s+e\s+(?:meia|\d{1,2}))?(?:\s+(?:da|de)\s+(?:manhã|manha|tarde|noite))?(?![\wà-ú])/gi, ' ')
    .replace(/\bao meio[- ]dia\b|(?:^|\s)à meia[- ]noite\b/gi, ' ')
    .replace(/[.!?,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:de|que|para|pra)\s+/i, '');
}

/** "cancela o timer", "para o alarme", "apaga os lembretes". */
export const CANCEL = /^(?:(?:ei|ok)\s+)?(?:jarvis\s+)?(cancel\w*|par[ae]r?|apag\w*|deslig\w*|tir[ae]r?|remov\w*)\b/;

/**
 * "timer de 25 minutos", "me lembra de estudar às 19h", "me avisa daqui a 10 minutos para tirar o bolo",
 * "lembrete amanhã às 8 de pagar a conta".
 */
export function parseTimeRequest(text: string, now = new Date()): TimeRequest | null {
  const t = normalize(text);
  if (CANCEL.test(t)) return null;
  if (/\b(timer|temporizador|cronometro|alarme)\b/.test(t)) {
    const ms = parseDuration(t);
    if (ms) return { kind: 'timer', ms };
    const at = parseClock(t, now);
    if (at) return { kind: 'reminder', text: 'Alarme', dueAt: at };
    return null;
  }
  if (!/\b(lembr\w*|lembrete|avis\w*)\b/.test(t) || /\b(quais|meus|minhas|lista)\b/.test(t)) return null;
  const relative = /\b(daqui|em|dentro de)\b/.test(t) ? parseDuration(t) : null;
  const dueAt = relative ? now.getTime() + relative : parseClock(t, now);
  if (!dueAt) return null;
  const subject = reminderText(text);
  return { kind: 'reminder', text: subject ? subject[0].toUpperCase() + subject.slice(1) : 'Lembrete', dueAt };
}

import type { VoiceStyle } from './lines';

/** Mesmo formato de FinanceSummary em server/janus.ts. */
export interface FinanceSummary {
  month: string;
  ganho: number;
  fixo: number;
  variavel: number;
  restante: number;
  pago: number;
  pendente: number;
  dividasAbertas: number;
  devendo: Array<{ person: string; pendente: number }>;
}

const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Valor em reais do jeito que se fala: "1.234 reais e 56 centavos". */
export function falarReais(value: number, style: VoiceStyle = 'br'): string {
  const negative = value < 0;
  const cents = Math.round(Math.abs(value) * 100);
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const locale = style === 'uk' ? 'en-GB' : 'pt-BR';
  const and = style === 'uk' ? 'and' : 'e';
  const parts: string[] = [];
  if (reais > 0 || centavos === 0) parts.push(`${reais.toLocaleString(locale)} ${reais === 1 ? 'real' : 'reais'}`);
  if (centavos > 0) parts.push(`${centavos} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  const text = parts.join(` ${and} `);
  return negative ? `${style === 'uk' ? 'minus' : 'menos'} ${text}` : text;
}

const joinNames = (names: string[], and: string) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;

/** Resumo do mês para o JARVIS falar. */
export function financeSpeech(s: FinanceSummary, style: VoiceStyle = 'br'): string {
  const R = (v: number) => falarReais(v, style);
  const monthIndex = Number(s.month.slice(5, 7)) - 1;
  const saidas = s.fixo + s.variavel;
  const devendoTotal = s.devendo.reduce((sum, p) => sum + p.pendente, 0);
  const names = s.devendo.map((p) => p.person);

  if (style === 'uk') {
    const parts = [
      `In ${MONTHS_EN[monthIndex]}, ${R(s.ganho)} came in and ${R(saidas)} went out, ${
        s.restante >= 0 ? `leaving ${R(s.restante)}` : `putting you ${R(-s.restante)} in the red`
      }.`,
    ];
    if (s.pendente > 0) parts.push(`${R(s.pendente)} is still pending.`);
    if (s.dividasAbertas > 0) parts.push(`Open debts add up to ${R(s.dividasAbertas)}.`);
    if (names.length) parts.push(`${joinNames(names, 'and')} still ${names.length > 1 ? 'owe' : 'owes'} ${R(devendoTotal)}.`);
    return parts.join(' ');
  }

  const parts = [
    `Em ${MONTHS_PT[monthIndex]}, entraram ${R(s.ganho)} e saíram ${R(saidas)}, ${
      s.restante >= 0 ? `sobrando ${R(s.restante)}` : `ficando ${R(-s.restante)} no vermelho`
    }.`,
  ];
  if (s.pendente > 0) parts.push(`Ainda há ${R(s.pendente)} pendentes de pagamento.`);
  if (s.dividasAbertas > 0) parts.push(`As dívidas em aberto somam ${R(s.dividasAbertas)}.`);
  if (names.length) parts.push(`${joinNames(names, 'e')} ainda ${names.length > 1 ? 'devem' : 'deve'} ${R(devendoTotal)}.`);
  return parts.join(' ');
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { hasFaceToken } from './face-store';
import { isLocalRequest, sendJson } from './http';

/** API do janus em Docker (dados reais). A versão nativa (start.bat, porta 8080) usa um banco de desenvolvimento. */
export const DEFAULT_JANUS_URL = 'http://127.0.0.1:8082/api';
const TIMEOUT_MS = 4000;

export interface FinanceSummary {
  month: string;
  ganho: number;
  fixo: number;
  variavel: number;
  restante: number;
  pago: number;
  pendente: number;
  /** Soma das dívidas com status "Aberto" (último registro de cada conta). */
  dividasAbertas: number;
  /** Quem ainda tem gasto pendente neste mês. */
  devendo: Array<{ person: string; pendente: number }>;
}

export class JanusOfflineError extends Error {}

/** Mês atual no formato da API do janus ("2026-10"), no fuso de São Paulo. */
export function currentMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(date);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}

/** Junta as respostas da API do janus no resumo que o JARVIS fala. */
export function buildSummary(
  summary: Omit<FinanceSummary, 'dividasAbertas' | 'devendo'>,
  debts: Array<{ amount: number; status: string }>,
  people: Array<{ person: string; pendente: number }>,
): FinanceSummary {
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    ...summary,
    dividasAbertas: round(debts.filter((d) => d.status === 'Aberto').reduce((s, d) => s + d.amount, 0)),
    devendo: people.filter((p) => p.pendente > 0).map(({ person, pendente }) => ({ person, pendente })),
  };
}

/** Lê o resumo do mês no janus. Só faz GET: o JARVIS nunca altera nada lá. */
export async function fetchJanusSummary(baseUrl: string, month = currentMonth()): Promise<FinanceSummary> {
  const get = async <T>(path: string): Promise<T> => {
    let r: Response;
    try {
      r = await fetch(baseUrl + path, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      throw new JanusOfflineError(`janus não respondeu em ${baseUrl}`);
    }
    if (!r.ok) throw new Error(`janus ${r.status} em ${path}`);
    return (await r.json()) as T;
  };
  const [summary, debts, people] = await Promise.all([
    get<Omit<FinanceSummary, 'dividasAbertas' | 'devendo'>>(`/finance/summary?month=${month}`),
    get<Array<{ amount: number; status: string }>>('/debts/current'),
    get<Array<{ person: string; pendente: number }>>(`/finance/people?month=${month}`),
  ]);
  return buildSummary(summary, debts, people);
}

export const janusUrl = (env: Record<string, string>) => env.JANUS_API_URL?.trim().replace(/\/$/, '') || DEFAULT_JANUS_URL;

export function janus(env: Record<string, string>): Plugin {
  const baseUrl = janusUrl(env);

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url !== '/api/janus/summary') return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
    if (!hasFaceToken(req)) return sendJson(res, 403, { message: 'Rosto não verificado', code: 'face' });
    try {
      return sendJson(res, 200, await fetchJanusSummary(baseUrl));
    } catch (e) {
      const offline = e instanceof JanusOfflineError;
      return sendJson(res, offline ? 503 : 502, { code: offline ? 'offline' : 'error', message: e instanceof Error ? e.message : 'Falhou' });
    }
  };

  return {
    name: 'jarvis-janus',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

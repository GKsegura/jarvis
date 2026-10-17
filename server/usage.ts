import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import {
  detectCandidates,
  dueRoutines,
  isRoutine,
  nextSuggestion,
  routineId,
  type Candidate,
  type Routine,
  type UsageEvent,
  type UsageKind,
} from '../src/routines';
import { hasFaceToken } from './face-store';
import { isLocalRequest, readBody, sendJson } from './http';

const MAX_EVENTS = 3000;
const KEEP_MS = 30 * 86_400_000;
const MAX_KEY = 60;
const MAX_ROUTINES = 50;
/** Repetir a mesma coisa em menos que isso conta uma vez só. */
const DEDUPE_MS = 60_000;

const KINDS: UsageKind[] = ['app', 'music', 'command'];
const isEvent = (e: unknown): e is UsageEvent => {
  const x = e as UsageEvent;
  return Number.isFinite(x?.ts) && KINDS.includes(x.kind) && typeof x.key === 'string' && x.key.length > 0;
};

/**
 * O que o JARVIS aprendeu sobre a rotina do senhor, num arquivo local (.jarvis-usage.json, fora do git).
 * Guarda só tipo e nome (app, música, comando) com a hora, nunca o que foi dito. Dá para ver e apagar tudo.
 */
export class UsageStore {
  private events: UsageEvent[] = [];
  private routines: Routine[] = [];

  constructor(private readonly file: string | null) {
    if (file && existsSync(file)) {
      try {
        const data = JSON.parse(readFileSync(file, 'utf8')) as { events?: unknown; routines?: unknown };
        this.events = Array.isArray(data.events) ? data.events.filter(isEvent) : [];
        this.routines = Array.isArray(data.routines) ? data.routines.filter(isRoutine) : [];
      } catch {
        /* arquivo ilegível: recomeça vazio */
      }
    }
  }

  private save(): void {
    if (this.file) writeFileSync(this.file, JSON.stringify({ events: this.events, routines: this.routines }));
  }

  record(kind: unknown, key: unknown, now = Date.now()): boolean {
    if (!KINDS.includes(kind as UsageKind) || typeof key !== 'string') return false;
    const clean = key.replace(/\s+/g, ' ').trim().slice(0, MAX_KEY);
    if (!clean) return false;
    const last = [...this.events].reverse().find((e) => e.kind === kind && e.key === clean);
    if (last && now - last.ts < DEDUPE_MS) return false;
    this.events.push({ ts: now, kind: kind as UsageKind, key: clean });
    this.events = this.events.filter((e) => now - e.ts < KEEP_MS).slice(-MAX_EVENTS);
    this.save();
    return true;
  }

  candidates(now = Date.now()): Candidate[] {
    return detectCandidates(this.events, now);
  }

  list(): Routine[] {
    return [...this.routines];
  }

  /** O que perguntar agora e o que rodar agora. */
  tick(now = Date.now()): { suggest: Candidate | null; run: Routine[] } {
    return { suggest: nextSuggestion(this.candidates(now), this.routines, now), run: dueRoutines(this.routines, now) };
  }

  answer(kind: unknown, key: unknown, minute: unknown, accepted: boolean): Routine | null {
    if (!KINDS.includes(kind as UsageKind) || typeof key !== 'string' || !Number.isInteger(minute)) return null;
    const id = routineId(kind as UsageKind, key);
    const routine: Routine = { id, kind: kind as UsageKind, key, minute: minute as number, state: accepted ? 'accepted' : 'declined' };
    if (!isRoutine(routine)) return null;
    this.routines = [...this.routines.filter((r) => r.id !== id), routine].slice(-MAX_ROUTINES);
    this.save();
    return routine;
  }

  markRan(id: string, now = Date.now()): boolean {
    const r = this.routines.find((x) => x.id === id);
    if (!r) return false;
    r.lastRunDay = new Date(now).toDateString();
    this.save();
    return true;
  }

  /** Esquece uma rotina (ela pode voltar a ser sugerida) ou tudo: rotinas e histórico. */
  forget(id?: string): number {
    if (id) {
      const before = this.routines.length;
      this.routines = this.routines.filter((r) => r.id !== id);
      this.save();
      return before - this.routines.length;
    }
    const n = this.routines.filter((r) => r.state === 'accepted').length;
    this.routines = [];
    this.events = [];
    this.save();
    return n;
  }
}

let shared: UsageStore | null = null;
export const usageStore = (root: string): UsageStore => (shared ??= new UsageStore(join(root, '.jarvis-usage.json')));

const FACE = { code: 'face', message: 'Rosto não verificado' };

export function usage(root: string): Plugin {
  const store = usageStore(root);
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? '';
    if (url !== '/api/usage' && !url.startsWith('/api/routines')) return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
    // Aprender e rodar rotinas é coisa do dono: sem rosto verificado, não registra nem executa nada
    if (!hasFaceToken(req)) return sendJson(res, 403, FACE);
    try {
      if (url === '/api/usage' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { kind?: unknown; key?: unknown };
        return sendJson(res, 200, { recorded: store.record(body.kind, body.key) });
      }
      if (url === '/api/routines/tick' && req.method === 'GET') return sendJson(res, 200, store.tick());
      if (url === '/api/routines' && req.method === 'GET') return sendJson(res, 200, { routines: store.list(), candidates: store.candidates() });
      if (req.method !== 'POST') return next();
      const body = JSON.parse(await readBody(req)) as { kind?: unknown; key?: unknown; minute?: unknown; answer?: unknown; id?: unknown };
      if (url === '/api/routines/answer') {
        const routine = store.answer(body.kind, body.key, body.minute, body.answer === 'yes');
        return routine ? sendJson(res, 200, { routine }) : sendJson(res, 400, { message: 'Pedido inválido' });
      }
      if (url === '/api/routines/ran' && typeof body.id === 'string') return sendJson(res, 200, { ok: store.markRan(body.id) });
      if (url === '/api/routines/forget') return sendJson(res, 200, { forgotten: store.forget(typeof body.id === 'string' ? body.id : undefined) });
      return sendJson(res, 400, { message: 'Pedido inválido' });
    } catch (e) {
      return sendJson(res, 400, { message: e instanceof Error ? e.message : 'Pedido inválido' });
    }
  };
  return {
    name: 'jarvis-usage',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

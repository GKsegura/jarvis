import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import type { Reminder } from '../src/info';
import { isLocalRequest, readBody, sendJson } from './http';

const MAX_TEXT = 200;
const MAX_ITEMS = 100;
/** Lembretes concluídos ficam no arquivo só por um dia. */
const KEEP_DONE_MS = 24 * 3_600_000;
/** Até um ano no futuro. */
const MAX_AHEAD_MS = 366 * 86_400_000;

const isReminder = (r: unknown): r is Reminder => {
  const x = r as Reminder;
  return (
    typeof x?.id === 'string' &&
    typeof x.text === 'string' &&
    Number.isFinite(x.dueAt) &&
    (x.kind === 'timer' || x.kind === 'reminder') &&
    typeof x.done === 'boolean'
  );
};

/** Lembretes e timers num arquivo local (.jarvis-reminders.json, fora do git): sobrevivem a reiniciar o JARVIS. */
export class ReminderStore {
  private items: Reminder[];

  constructor(private readonly file: string | null) {
    this.items = [];
    if (file && existsSync(file)) {
      try {
        const data = JSON.parse(readFileSync(file, 'utf8')) as unknown;
        this.items = Array.isArray(data) ? data.filter(isReminder) : [];
      } catch {
        this.items = [];
      }
    }
  }

  list(now = Date.now()): Reminder[] {
    const before = this.items.length;
    this.items = this.items.filter((r) => !r.done || now - r.dueAt < KEEP_DONE_MS);
    if (this.items.length !== before) this.save();
    return [...this.items].sort((a, b) => a.dueAt - b.dueAt);
  }

  pending(now = Date.now()): Reminder[] {
    return this.list(now).filter((r) => !r.done);
  }

  add(input: { text: unknown; dueAt: unknown; kind: unknown }, now = Date.now()): Reminder {
    const text = typeof input.text === 'string' ? input.text.trim().slice(0, MAX_TEXT) : '';
    const dueAt = Number(input.dueAt);
    const kind = input.kind === 'timer' ? 'timer' : 'reminder';
    if (!text) throw new Error('Lembrete sem texto');
    if (!Number.isFinite(dueAt) || dueAt < now - 60_000 || dueAt > now + MAX_AHEAD_MS) throw new Error('Horário inválido');
    if (this.pending(now).length >= MAX_ITEMS) throw new Error('Lembretes demais');
    const reminder: Reminder = { id: randomBytes(6).toString('hex'), text, dueAt: Math.round(dueAt), kind, done: false, createdAt: now };
    this.items.push(reminder);
    this.save();
    return reminder;
  }

  /** Marca como concluído ("done") ou apaga ("cancel"). Devolve false se o id não existe. */
  update(id: string, op: 'done' | 'cancel'): boolean {
    const i = this.items.findIndex((r) => r.id === id);
    if (i < 0) return false;
    if (op === 'cancel') this.items.splice(i, 1);
    else this.items[i] = { ...this.items[i], done: true };
    this.save();
    return true;
  }

  private save(): void {
    if (this.file) writeFileSync(this.file, JSON.stringify(this.items, null, 2));
  }
}

let shared: ReminderStore | null = null;
export const reminderStore = (root: string) => (shared ??= new ReminderStore(join(root, '.jarvis-reminders.json')));

export function reminders(root: string): Plugin {
  const store = reminderStore(root);
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url !== '/api/reminders') return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
    if (req.method === 'GET') return sendJson(res, 200, { reminders: store.list() });
    if (req.method !== 'POST') return next();
    try {
      const body = JSON.parse(await readBody(req)) as { op?: unknown; id?: unknown; text?: unknown; dueAt?: unknown; kind?: unknown };
      if (body.op === 'add') return sendJson(res, 200, { reminder: store.add(body), reminders: store.list() });
      if ((body.op === 'done' || body.op === 'cancel') && typeof body.id === 'string') {
        if (!store.update(body.id, body.op)) return sendJson(res, 404, { message: 'Lembrete não encontrado' });
        return sendJson(res, 200, { reminders: store.list() });
      }
      return sendJson(res, 400, { message: 'Pedido inválido' });
    } catch (e) {
      return sendJson(res, 400, { message: e instanceof Error ? e.message : 'Pedido inválido' });
    }
  };
  return {
    name: 'jarvis-reminders',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

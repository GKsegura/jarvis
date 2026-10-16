import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { FEATURE_COUNT, type LearnedGesture } from '../src/poses';
import { hasFaceToken } from './face-store';
import { BodyTooLargeError, isLocalRequest, readBody, sendJson } from './http';

const MAX_GESTURES = 30;
const MAX_PHRASE = 200;

const isFeatures = (f: unknown): f is number[] =>
  Array.isArray(f) && f.length === FEATURE_COUNT && f.every((v) => typeof v === 'number' && Number.isFinite(v));

const isGesture = (g: unknown): g is LearnedGesture => {
  const x = g as LearnedGesture;
  return typeof x?.id === 'string' && typeof x.phrase === 'string' && isFeatures(x.features) && Number.isFinite(x.createdAt);
};

/** Gestos que o JARVIS aprendeu, num arquivo local (.jarvis-gestures.json, fora do git). */
export class GestureStore {
  private items: LearnedGesture[] = [];

  constructor(private readonly file: string | null) {
    if (file && existsSync(file)) {
      try {
        const data = JSON.parse(readFileSync(file, 'utf8')) as unknown;
        this.items = Array.isArray(data) ? data.filter(isGesture) : [];
      } catch {
        this.items = [];
      }
    }
  }

  list(): LearnedGesture[] {
    return [...this.items];
  }

  add(phrase: unknown, features: unknown, now = Date.now()): LearnedGesture {
    const text = typeof phrase === 'string' ? phrase.trim().slice(0, MAX_PHRASE) : '';
    if (!text) throw new Error('Gesto sem ação');
    if (!isFeatures(features)) throw new Error('Pose inválida');
    if (this.items.length >= MAX_GESTURES) throw new Error('Gestos demais');
    const g: LearnedGesture = { id: randomBytes(6).toString('hex'), phrase: text, features, createdAt: now };
    this.items.push(g);
    this.save();
    return g;
  }

  remove(id: string): boolean {
    const before = this.items.length;
    this.items = this.items.filter((g) => g.id !== id);
    if (this.items.length === before) return false;
    this.save();
    return true;
  }

  private save(): void {
    if (this.file) writeFileSync(this.file, JSON.stringify(this.items, null, 2));
  }
}

export function gestures(root: string): Plugin {
  const store = new GestureStore(join(root, '.jarvis-gestures.json'));
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url !== '/api/gestures') return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
    if (req.method === 'GET') return sendJson(res, 200, { gestures: store.list() });
    if (req.method !== 'POST') return next();
    // Ensinar e apagar gestos é coisa do dono
    if (!hasFaceToken(req)) return sendJson(res, 403, { message: 'Rosto não verificado', code: 'face' });
    try {
      const body = JSON.parse(await readBody(req)) as { op?: unknown; id?: unknown; phrase?: unknown; features?: unknown };
      if (body.op === 'add') return sendJson(res, 200, { gesture: store.add(body.phrase, body.features), gestures: store.list() });
      if (body.op === 'remove' && typeof body.id === 'string') {
        if (!store.remove(body.id)) return sendJson(res, 404, { message: 'Gesto não encontrado' });
        return sendJson(res, 200, { gestures: store.list() });
      }
      return sendJson(res, 400, { message: 'Pedido inválido' });
    } catch (e) {
      if (e instanceof BodyTooLargeError) return sendJson(res, 413, { message: 'Pedido grande demais' });
      return sendJson(res, 400, { message: e instanceof Error ? e.message : 'Pedido inválido' });
    }
  };
  return {
    name: 'jarvis-gestures',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

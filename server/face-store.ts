import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { BodyTooLargeError, isLocalRequest, readBody, sendJson } from './http';

/** Distância euclidiana máxima entre descritores (128 dimensões) para considerar o mesmo rosto. */
export const MATCH_THRESHOLD = 0.5;
/** Quanto tempo o rosto verificado continua liberando os recursos sem ser visto de novo. */
export const TOKEN_TTL_MS = 120_000;
const DESCRIPTOR_SIZE = 128;

export const euclidean = (a: number[], b: number[]): number =>
  Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));

/** Menor distância entre um descritor e os descritores cadastrados. */
export function bestDistance(descriptor: number[], profile: number[][]): number {
  return Math.min(...profile.map((p) => euclidean(descriptor, p)));
}

const isDescriptor = (d: unknown): d is number[] =>
  Array.isArray(d) && d.length === DESCRIPTOR_SIZE && d.every((v) => typeof v === 'number' && Number.isFinite(v));

/** Tokens de sessão emitidos quando o rosto do dono é verificado. */
class TokenStore {
  private tokens = new Map<string, number>();

  issue(now = Date.now()): string {
    const token = randomBytes(24).toString('hex');
    this.tokens.set(token, now + TOKEN_TTL_MS);
    return token;
  }

  /** Renova o token (ou emite outro se ele já expirou). */
  refresh(token: string | undefined, now = Date.now()): string {
    if (token && this.valid(token, now)) {
      this.tokens.set(token, now + TOKEN_TTL_MS);
      return token;
    }
    return this.issue(now);
  }

  valid(token: string | undefined, now = Date.now()): boolean {
    if (!token) return false;
    const expires = this.tokens.get(token);
    if (expires === undefined) return false;
    if (expires < now) {
      this.tokens.delete(token);
      return false;
    }
    return true;
  }

  clear(): void {
    this.tokens.clear();
  }
}

export const faceTokens = new TokenStore();

const tokenOf = (req: IncomingMessage) => {
  const header = req.headers['x-jarvis-token'];
  return Array.isArray(header) ? header[0] : header;
};

/** Para as outras rotas: o pedido vem de quem teve o rosto verificado há pouco? */
export const hasFaceToken = (req: IncomingMessage): boolean => faceTokens.valid(tokenOf(req));

/**
 * Guarda o perfil facial do dono num arquivo local (.face-profile.json, fora do git) e verifica
 * os rostos que o navegador envia. O perfil nunca sai do servidor.
 */
export function faceStore(root: string): Plugin {
  const file = join(root, '.face-profile.json');
  const load = (): number[][] | null => {
    if (!existsSync(file)) return null;
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as { descriptors?: unknown };
      return Array.isArray(data.descriptors) && data.descriptors.every(isDescriptor) ? data.descriptors : null;
    } catch {
      return null;
    }
  };
  let profile = load();

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/face')) return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
    if (req.url === '/api/face/status') return sendJson(res, 200, { enrolled: profile !== null });
    if (req.method !== 'POST') return next();

    try {
      const body = JSON.parse((await readBody(req)) || '{}') as { descriptor?: unknown; descriptors?: unknown };

      if (req.url === '/api/face/verify') {
        if (!profile) return sendJson(res, 409, { message: 'Nenhum rosto cadastrado' });
        if (!isDescriptor(body.descriptor)) return sendJson(res, 400, { message: 'Descritor inválido' });
        const distance = bestDistance(body.descriptor, profile);
        const match = distance < MATCH_THRESHOLD;
        return sendJson(res, 200, {
          match,
          distance,
          token: match ? faceTokens.refresh(tokenOf(req)) : undefined,
          ttlMs: TOKEN_TTL_MS,
        });
      }

      if (req.url === '/api/face/enroll') {
        // Só o dono (rosto verificado) pode trocar um perfil existente
        if (profile && !hasFaceToken(req)) return sendJson(res, 403, { message: 'Rosto não verificado' });
        const list = body.descriptors;
        if (!Array.isArray(list) || list.length < 3 || list.length > 20 || !list.every(isDescriptor)) {
          return sendJson(res, 400, { message: 'Descritores inválidos' });
        }
        profile = list;
        writeFileSync(file, JSON.stringify({ descriptors: profile, createdAt: new Date().toISOString() }));
        faceTokens.clear();
        return sendJson(res, 200, { ok: true, token: faceTokens.issue(), ttlMs: TOKEN_TTL_MS });
      }

      if (req.url === '/api/face/forget') {
        if (!hasFaceToken(req)) return sendJson(res, 403, { message: 'Rosto não verificado' });
        profile = null;
        rmSync(file, { force: true });
        faceTokens.clear();
        return sendJson(res, 200, { ok: true });
      }
      return next();
    } catch (e) {
      if (e instanceof BodyTooLargeError) return sendJson(res, 413, { message: 'Cadastro grande demais' });
      return sendJson(res, 400, { message: 'Pedido inválido' });
    }
  };

  return {
    name: 'jarvis-face-store',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

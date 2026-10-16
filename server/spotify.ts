import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { hasFaceToken } from './face-store';
import { isLocalRequest, readBody, sendJson } from './http';

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
export const REDIRECT_URI = 'http://127.0.0.1:5173/api/spotify/callback';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';

interface Tokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface Track {
  name: string;
  artist: string;
}

export type SpotifyCommand =
  | { action: 'play'; query: string; volume?: number }
  | { action: 'pause' | 'resume' | 'next' | 'previous' | 'current' }
  | { action: 'volume'; volume: number };

/** Erro com código, para o navegador escolher a fala certa. */
export class SpotifyError extends Error {
  constructor(
    readonly code: 'not_configured' | 'not_connected' | 'not_found' | 'no_device' | 'premium' | 'api',
    message: string,
  ) {
    super(message);
  }
}

/** PKCE: o login não precisa de segredo, só do Client ID. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/** Resposta de GET /me/player (só os campos usados). */
export interface PlayerState {
  is_playing: boolean;
  progress_ms: number | null;
  device?: { name: string; volume_percent: number | null };
  item?: {
    name: string;
    duration_ms: number;
    artists: Array<{ name: string }>;
    album?: { name: string; images?: Array<{ url: string; width: number | null }> };
  } | null;
}

export interface NowPlaying {
  playing: boolean;
  track: { name: string; artist: string; album: string; image: string | null; durationMs: number; progressMs: number } | null;
  device: { name: string; volume: number | null } | null;
}

/** Resume o estado do player para o visor do HUD (capa menor que dê boa leitura, ~300px). */
export function nowPlaying(state: PlayerState | null): NowPlaying {
  if (!state?.item) return { playing: false, track: null, device: state?.device ? { name: state.device.name, volume: state.device.volume_percent } : null };
  const images = [...(state.item.album?.images ?? [])].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  const image = images.find((i) => (i.width ?? 0) >= 250) ?? images[images.length - 1];
  return {
    playing: state.is_playing,
    track: {
      name: state.item.name,
      artist: artistsOf(state.item),
      album: state.item.album?.name ?? '',
      image: image?.url ?? null,
      durationMs: state.item.duration_ms,
      progressMs: state.progress_ms ?? 0,
    },
    device: state.device ? { name: state.device.name, volume: state.device.volume_percent } : null,
  };
}

/**
 * Corpo de uma resposta de sucesso da API. Comandos como "próxima" às vezes respondem 200 com um
 * texto solto (um id) em vez de 204 vazio: isso é sucesso, não JSON.
 */
export function parseApiBody<T>(text: string, contentType: string | null): T | null {
  if (!text || !contentType?.includes('json')) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export const clampVolume = (v: number) => Math.round(Math.min(100, Math.max(0, v)));

export const artistsOf = (item: { artists?: Array<{ name: string }> }) => (item.artists ?? []).map((a) => a.name).join(', ');

/** Integração com a API oficial do Spotify (precisa de conta Premium para controlar a reprodução). */
export function spotify(root: string, env: Record<string, string>): Plugin {
  const clientId = env.SPOTIFY_CLIENT_ID?.trim();
  // País da busca. "from_token" exigiria a permissão user-read-private (dava 403 "Insufficient client scope")
  const market = /^[A-Z]{2}$/.test(env.SPOTIFY_MARKET?.trim() ?? '') ? env.SPOTIFY_MARKET.trim() : 'BR';
  const file = join(root, '.spotify-token.json');
  let tokens: Tokens | null = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Tokens) : null;
  const pending = new Map<string, string>(); // state → verifier

  const save = (t: Tokens) => {
    tokens = t;
    writeFileSync(file, JSON.stringify(t));
  };

  async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
    const r = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId!, ...params }),
    });
    const data = (await r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!r.ok || !data.access_token) throw new SpotifyError('not_connected', `Login do Spotify falhou: ${data.error ?? r.status}`);
    return {
      access_token: data.access_token,
      // O Spotify às vezes não manda um refresh_token novo: aí o antigo continua valendo
      refresh_token: data.refresh_token ?? tokens?.refresh_token ?? '',
      expires_at: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
    };
  }

  async function accessToken(): Promise<string> {
    if (!clientId) throw new SpotifyError('not_configured', 'SPOTIFY_CLIENT_ID não está no .env');
    if (!tokens) throw new SpotifyError('not_connected', 'Spotify ainda não conectado');
    if (Date.now() >= tokens.expires_at) save(await tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token }));
    return tokens.access_token;
  }

  async function api<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const r = await fetch(API + path, {
      method,
      headers: { Authorization: `Bearer ${await accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 204 || r.status === 202) return null;
    const text = await r.text();
    if (r.status === 403 && text.includes('PREMIUM')) throw new SpotifyError('premium', 'Precisa de Spotify Premium');
    if (r.status === 404 && text.includes('NO_ACTIVE_DEVICE')) throw new SpotifyError('no_device', 'Nenhum dispositivo do Spotify ativo');
    if (!r.ok) throw new SpotifyError('api', `Spotify ${r.status}: ${text.slice(0, 200)}`);
    return parseApiBody<T>(text, r.headers.get('content-type'));
  }

  type Device = { id: string; is_active: boolean; type: string; name: string };

  /** Garante um aparelho para tocar; se não houver nenhum, abre o app do Spotify e espera ele aparecer. */
  async function ensureDevice(): Promise<string> {
    const list = async () => (await api<{ devices: Device[] }>('GET', '/me/player/devices'))?.devices ?? [];
    let devices = await list();
    if (devices.length === 0) {
      spawn('explorer.exe', ['spotify:'], { detached: true, stdio: 'ignore' }).unref();
      for (let i = 0; i < 12 && devices.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        devices = await list();
      }
    }
    const device = devices.find((d) => d.is_active) ?? devices.find((d) => d.type === 'Computer') ?? devices[0];
    if (!device) throw new SpotifyError('no_device', 'Abri o Spotify, mas ele não apareceu como dispositivo');
    return device.id;
  }

  async function command(cmd: SpotifyCommand): Promise<{ track?: Track; nothing?: boolean; volume?: number }> {
    switch (cmd.action) {
      case 'play': {
        const q = encodeURIComponent(cmd.query);
        const found = await api<{ tracks: { items: Array<{ uri: string; name: string; artists: Array<{ name: string }> }> } }>(
          'GET',
          `/search?q=${q}&type=track&limit=1&market=${market}`,
        );
        const item = found?.tracks.items[0];
        if (!item) throw new SpotifyError('not_found', `Nada encontrado para "${cmd.query}"`);
        const device = await ensureDevice();
        // Volume primeiro, para a música já começar no volume pedido
        if (cmd.volume !== undefined) await api('PUT', `/me/player/volume?volume_percent=${clampVolume(cmd.volume)}&device_id=${device}`);
        await api('PUT', `/me/player/play?device_id=${device}`, { uris: [item.uri] });
        return { track: { name: item.name, artist: artistsOf(item) }, volume: cmd.volume === undefined ? undefined : clampVolume(cmd.volume) };
      }
      case 'pause':
        await api('PUT', `/me/player/pause?device_id=${await ensureDevice()}`);
        return {};
      case 'resume': {
        const device = await ensureDevice();
        await api('PUT', `/me/player/play?device_id=${device}`);
        return {};
      }
      // Com device_id explícito funciona mesmo se o Spotify estiver aberto mas parado (sem aparelho "ativo")
      case 'next':
        await api('POST', `/me/player/next?device_id=${await ensureDevice()}`);
        return {};
      case 'previous':
        await api('POST', `/me/player/previous?device_id=${await ensureDevice()}`);
        return {};
      case 'volume': {
        const volume = clampVolume(cmd.volume);
        await api('PUT', `/me/player/volume?volume_percent=${volume}&device_id=${await ensureDevice()}`);
        return { volume };
      }
      case 'current': {
        const now = await api<{ is_playing: boolean; item?: { name: string; artists: Array<{ name: string }> } }>(
          'GET',
          '/me/player/currently-playing',
        );
        if (!now?.item || !now.is_playing) return { nothing: true };
        return { track: { name: now.item.name, artist: artistsOf(now.item) } };
      }
    }
  }

  const html = (res: ServerResponse, status: number, message: string) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      `<!doctype html><meta charset="utf-8"><title>J.A.R.V.I.S. - Spotify</title><body style="background:#02070c;color:#4dd8ff;font:18px monospace;display:grid;place-items:center;height:100vh;margin:0"><p>${message}</p></body>`,
    );
  };

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/spotify')) return next();
    const url = new URL(req.url, 'http://127.0.0.1:5173');

    if (url.pathname === '/api/spotify/status') {
      return sendJson(res, 200, { configured: Boolean(clientId), connected: tokens !== null, redirectUri: REDIRECT_URI });
    }

    // Início do login: aberto numa aba nova pelo botão SPOTIFY
    if (url.pathname === '/api/spotify/login') {
      if (!clientId) return html(res, 503, 'Coloque o SPOTIFY_CLIENT_ID no .env e reinicie o JARVIS.');
      const state = randomBytes(16).toString('hex');
      const { verifier, challenge } = pkcePair();
      pending.set(state, verifier);
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: SCOPES,
        redirect_uri: REDIRECT_URI,
        code_challenge_method: 'S256',
        code_challenge: challenge,
        state,
      });
      res.statusCode = 302;
      res.setHeader('Location', `${AUTH_URL}?${params}`);
      return res.end();
    }

    if (url.pathname === '/api/spotify/callback') {
      const state = url.searchParams.get('state') ?? '';
      const verifier = pending.get(state);
      pending.delete(state);
      const code = url.searchParams.get('code');
      if (!verifier || !code) return html(res, 400, `Login cancelado ou expirado (${url.searchParams.get('error') ?? 'estado inválido'}). Tente de novo.`);
      try {
        save(await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier }));
        return html(res, 200, 'Spotify conectado ao J.A.R.V.I.S. Pode fechar esta aba.');
      } catch (e) {
        return html(res, 502, e instanceof Error ? e.message : 'Falha no login');
      }
    }

    // "Tocando agora", para o visor de música do HUD
    if (url.pathname === '/api/spotify/now') {
      if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
      if (!hasFaceToken(req)) return sendJson(res, 403, { message: 'Rosto não verificado', code: 'face' });
      try {
        return sendJson(res, 200, nowPlaying(await api<PlayerState>('GET', '/me/player')));
      } catch (e) {
        const code = e instanceof SpotifyError ? e.code : 'api';
        return sendJson(res, code === 'not_connected' || code === 'not_configured' ? 409 : 502, { code });
      }
    }

    if (url.pathname !== '/api/spotify/command' || req.method !== 'POST') return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
    if (!hasFaceToken(req)) return sendJson(res, 403, { message: 'Rosto não verificado', code: 'face' });
    try {
      const body = JSON.parse(await readBody(req)) as Partial<{ action: string; query: string; volume: number }>;
      let cmd: SpotifyCommand;
      if (body.action === 'play' && typeof body.query === 'string' && body.query.trim() && body.query.length <= 200) {
        cmd = { action: 'play', query: body.query.trim(), volume: typeof body.volume === 'number' ? body.volume : undefined };
      } else if (body.action === 'volume' && typeof body.volume === 'number') {
        cmd = { action: 'volume', volume: body.volume };
      } else if (['pause', 'resume', 'next', 'previous', 'current'].includes(body.action ?? '')) {
        cmd = { action: body.action as 'pause' };
      } else return sendJson(res, 400, { message: 'Comando inválido' });
      return sendJson(res, 200, { ok: true, ...(await command(cmd)) });
    } catch (e) {
      const code = e instanceof SpotifyError ? e.code : 'api';
      console.warn('[spotify]', e);
      return sendJson(res, 422, { code, message: e instanceof Error ? e.message : 'Falhou' });
    }
  };

  return {
    name: 'jarvis-spotify',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

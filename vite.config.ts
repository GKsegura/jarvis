import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { actions } from './server/actions';
import { claudeBridge } from './server/claude-bridge';
import { faceStore } from './server/face-store';
import { gestures } from './server/gestures';
import { input } from './server/input';
import { janus } from './server/janus';
import { reminders } from './server/reminders';
import { screens } from './server/screens';
import { spotify } from './server/spotify';
import { isLocalRequest, readBody, sendJson } from './server/http';
import { system } from './server/system';
import { weather } from './server/weather';

const FISH_TTS_URL = 'https://api.fish.audio/v1/tts';
/** Motor que funciona sem crédito de API; o padrão da API (s2.1-pro) exige crédito pago. */
const DEFAULT_MODEL = 's2.1-pro-free';
const MAX_TEXT = 1000;

/**
 * Proxy local para o TTS do fish.audio. A chave fica só aqui no servidor (arquivo .env),
 * nunca no código que vai para o navegador.
 */
function fishAudioTts(env: Record<string, string>): Plugin {
  const key = env.FISH_AUDIO_API_KEY?.trim();
  const voiceId = env.FISH_AUDIO_VOICE_ID?.trim();
  /** Sem chave ou sem voz escolhida, o JARVIS usa a voz do navegador. */
  const enabled = Boolean(key && voiceId);
  const model = env.FISH_AUDIO_MODEL?.trim() || DEFAULT_MODEL;

  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/tts')) return next();
    if (!isLocalRequest(req)) return sendJson(res, 403, { message: 'Só aceito pedidos do próprio JARVIS' });
    if (req.url === '/api/tts/status') return sendJson(res, 200, { enabled });
    if (req.url !== '/api/tts' || req.method !== 'POST') return next();
    if (!key || !voiceId) {
      return sendJson(res, 503, { message: 'FISH_AUDIO_API_KEY e FISH_AUDIO_VOICE_ID não configurados no .env' });
    }

    try {
      const { text } = JSON.parse(await readBody(req)) as { text?: unknown };
      if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) {
        return sendJson(res, 400, { message: 'Texto inválido' });
      }
      const upstream = await fetch(FISH_TTS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          model,
        },
        body: JSON.stringify({ text, reference_id: voiceId, format: 'mp3', latency: 'balanced' }),
      });
      if (!upstream.ok) {
        console.warn(`[fish.audio] ${upstream.status}: ${await upstream.text()}`);
        return sendJson(res, upstream.status, { message: 'fish.audio recusou o pedido' });
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (e) {
      console.warn('[fish.audio]', e);
      sendJson(res, 502, { message: 'Falha ao falar com o fish.audio' });
    }
  };

  return {
    name: 'fish-audio-tts',
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // 127.0.0.1 explícito: no Windows o "localhost" do Vite escuta só em IPv6 (::1),
    // e o login do Spotify exige voltar para http://127.0.0.1
    server: { host: '127.0.0.1', port: 5173 },
    preview: { host: '127.0.0.1' },
    plugins: [
      faceStore(process.cwd()),
      actions(process.cwd()),
      spotify(process.cwd(), env),
      janus(env),
      system(),
      weather(process.cwd()),
      reminders(process.cwd()),
      screens(process.cwd()),
      input(),
      gestures(process.cwd()),
      fishAudioTts(env),
      claudeBridge(env, process.cwd()),
    ],
  };
});

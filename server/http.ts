import type { IncomingMessage, ServerResponse } from 'node:http';

/** Maior corpo aceito (o cadastro do rosto manda alguns descritores de 128 números). */
export const MAX_BODY_BYTES = 64_000;

export class BodyTooLargeError extends Error {}

export function readBody(req: IncomingMessage, maxBytes = MAX_BODY_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return;
      data += chunk;
      // Continua lendo (e descartando) até o fim, para poder responder com um erro claro
      // em vez de derrubar a conexão
      if (data.length > maxBytes) {
        tooLarge = true;
        data = '';
      }
    });
    req.on('end', () => (tooLarge ? reject(new BodyTooLargeError(`Pedido maior que ${maxBytes} bytes`)) : resolve(data)));
    req.on('error', reject);
  });
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Bloqueia pedidos vindos de outros sites abertos no navegador: sem isso, qualquer página
 * poderia mandar um POST para o localhost e gastar a cota do Claude ou os créditos do fish.audio.
 */
export function isLocalRequest(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin && !LOCAL_ORIGIN.test(origin)) return false;
  if (req.method === 'POST' && !String(req.headers['content-type'] ?? '').startsWith('application/json')) return false;
  return true;
}

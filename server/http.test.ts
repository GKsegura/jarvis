import type { IncomingMessage } from 'node:http';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { BodyTooLargeError, readBody } from './http';

const request = (body: string) => {
  const stream = new PassThrough();
  stream.end(body);
  return stream as unknown as IncomingMessage;
};

describe('readBody', () => {
  it('aceita o cadastro do rosto (6 descritores com precisão total, ~16 KB)', async () => {
    const descriptors = Array.from({ length: 6 }, () => Array.from({ length: 128 }, () => Math.random() * 0.2 - 0.1));
    const body = JSON.stringify({ descriptors });
    expect(body.length).toBeGreaterThan(10_000);
    await expect(readBody(request(body))).resolves.toBe(body);
  });

  it('recusa com erro claro (sem derrubar a conexão) um corpo grande demais', async () => {
    await expect(readBody(request('x'.repeat(100)), 50)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});

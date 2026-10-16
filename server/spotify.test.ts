import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { artistsOf, nowPlaying, parseApiBody, pkcePair, REDIRECT_URI } from './spotify';

describe('pkcePair', () => {
  it('gera o challenge como SHA-256 em base64url do verifier', () => {
    const { verifier, challenge } = pkcePair();
    expect(verifier).toMatch(/^[\w-]{43,128}$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(pkcePair().verifier).not.toBe(verifier);
  });
});

describe('nowPlaying', () => {
  it('resume a música atual e escolhe a capa de ~300px', () => {
    const now = nowPlaying({
      is_playing: true,
      progress_ms: 42_000,
      device: { name: 'PC-SEGURA', volume_percent: 10 },
      item: {
        name: 'Amor e Sexo',
        duration_ms: 180_000,
        artists: [{ name: 'Hungria' }, { name: 'Reset' }],
        album: { name: 'Álbum', images: [{ url: 'g', width: 640 }, { url: 'm', width: 300 }, { url: 'p', width: 64 }] },
      },
    });
    expect(now).toEqual({
      playing: true,
      track: { name: 'Amor e Sexo', artist: 'Hungria, Reset', album: 'Álbum', image: 'm', durationMs: 180_000, progressMs: 42_000 },
      device: { name: 'PC-SEGURA', volume: 10 },
    });
  });

  it('sem nada tocando (204 do Spotify)', () => {
    expect(nowPlaying(null)).toEqual({ playing: false, track: null, device: null });
  });
});

describe('parseApiBody', () => {
  it('aceita sucesso com texto solto (o "próxima" responde um id, não JSON)', () => {
    expect(parseApiBody('YT9FM8R2RQ', 'text/plain')).toBeNull();
    expect(parseApiBody('YT9FM8R2RQ', null)).toBeNull();
    expect(parseApiBody('', 'application/json')).toBeNull();
  });

  it('lê JSON quando é JSON', () => {
    expect(parseApiBody('{"a":1}', 'application/json; charset=utf-8')).toEqual({ a: 1 });
  });
});

describe('spotify', () => {
  it('usa 127.0.0.1 no redirect (o Spotify não aceita "localhost")', () => {
    expect(REDIRECT_URI).toBe('http://127.0.0.1:5173/api/spotify/callback');
  });

  it('junta os nomes dos artistas', () => {
    expect(artistsOf({ artists: [{ name: 'Queen' }, { name: 'David Bowie' }] })).toBe('Queen, David Bowie');
    expect(artistsOf({})).toBe('');
  });
});

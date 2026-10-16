import { describe, expect, it } from 'vitest';
import { bestDistance, euclidean, faceTokens, MATCH_THRESHOLD, TOKEN_TTL_MS } from './face-store';

const vec = (seed: number) => Array.from({ length: 128 }, (_, i) => Math.sin(i * 0.37 + seed) * 0.1);

describe('reconhecimento por distância', () => {
  it('o mesmo rosto com pouca variação fica abaixo do limiar; outro rosto fica acima', () => {
    const owner = [vec(1), vec(1.02), vec(0.98)];
    const sameWithNoise = vec(1).map((v, i) => v + (i % 2 ? 0.01 : -0.01));
    expect(bestDistance(sameWithNoise, owner)).toBeLessThan(MATCH_THRESHOLD);
    expect(bestDistance(vec(4), owner)).toBeGreaterThan(MATCH_THRESHOLD);
  });

  it('euclidean é zero para vetores iguais', () => {
    expect(euclidean(vec(2), vec(2))).toBe(0);
  });
});

describe('tokens de sessão', () => {
  it('valem por TOKEN_TTL_MS e podem ser renovados', () => {
    const t = faceTokens.issue(0);
    expect(faceTokens.valid(t, TOKEN_TTL_MS - 1)).toBe(true);
    expect(faceTokens.refresh(t, TOKEN_TTL_MS - 1)).toBe(t);
    expect(faceTokens.valid(t, 2 * TOKEN_TTL_MS - 2)).toBe(true);
    expect(faceTokens.valid(t, 2 * TOKEN_TTL_MS + 1)).toBe(false);
    expect(faceTokens.valid(undefined)).toBe(false);
    expect(faceTokens.valid('inventado')).toBe(false);
  });
});

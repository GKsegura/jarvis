import { describe, expect, it } from 'vitest';
import { OneEuroFilter } from './filters';
import type { TrackedHand } from './hands';
import { HandStabilizer, LOST_GRACE_MS } from './tracking';

/** Mão sintética: 21 pontos espalhados em volta de (cx, cy). */
const hand = (key: string, cx: number, cy: number): TrackedHand => {
  const landmarks = Array.from({ length: 21 }, (_, i) => ({ x: cx + Math.cos(i) * 0.05, y: cy + Math.sin(i) * 0.05, z: 0 }));
  return { key, landmarks, world: landmarks };
};

describe('HandStabilizer', () => {
  it('mantém a identidade quando o MediaPipe troca o handedness', () => {
    const s = new HandStabilizer();
    const [first] = s.update([hand('Left', 0.3, 0.5)], 0);
    const [second] = s.update([hand('Right', 0.31, 0.5)], 33);
    expect(second.id).toBe(first.id);
  });

  it('não troca as duas mãos de lugar quando elas se movem', () => {
    const s = new HandStabilizer();
    const ids0 = s.update([hand('Left', 0.3, 0.5), hand('Right', 0.7, 0.5)], 0).map((h) => h.id);
    // Mesma cena, mas o detector devolve as mãos em outra ordem e com rótulos trocados
    const out = s.update([hand('Left', 0.68, 0.5), hand('Right', 0.32, 0.5)], 33);
    const byX = (x: number) => out.find((h) => Math.abs(h.landmarks[0].x - x) < 0.1)!.id;
    expect(byX(0.35)).toBe(ids0[0]);
    expect(byX(0.73)).toBe(ids0[1]);
  });

  it(`segura a mão perdida por até ${LOST_GRACE_MS} ms e depois a esquece`, () => {
    const s = new HandStabilizer();
    const [h] = s.update([hand('Left', 0.5, 0.5)], 0);
    const during = s.update([], 150);
    expect(during).toHaveLength(1);
    expect(during[0]).toMatchObject({ id: h.id, stale: true });
    const back = s.update([hand('Left', 0.5, 0.5)], 200);
    expect(back[0]).toMatchObject({ id: h.id, stale: false });
    expect(s.update([], 200 + LOST_GRACE_MS + 1)).toHaveLength(0);
  });

  it('dá um id novo a uma mão que aparece longe da anterior', () => {
    const s = new HandStabilizer();
    const [a] = s.update([hand('Left', 0.1, 0.5)], 0);
    const [b] = s.update([hand('Left', 0.9, 0.5)], 400);
    expect(b.id).not.toBe(a.id);
  });
});

describe('OneEuroFilter', () => {
  it('reduz o tremor de um ponto parado', () => {
    const f = new OneEuroFilter(1.2, 20);
    const noisy = Array.from({ length: 60 }, (_, i) => 0.5 + (i % 2 ? 0.01 : -0.01));
    const out = noisy.map((v, i) => f.filter(v, i * 33));
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    expect(spread(out.slice(30))).toBeLessThan(spread(noisy) / 3);
  });

  it('acompanha um movimento rápido sem ficar muito para trás', () => {
    const f = new OneEuroFilter(1.2, 20);
    let out = 0;
    for (let i = 0; i <= 10; i++) out = f.filter(i * 0.05, i * 33);
    expect(out).toBeGreaterThan(0.4);
  });
});

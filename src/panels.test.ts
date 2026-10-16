import { describe, expect, it } from 'vitest';
import { Panels, scaleRect, type PanelsData } from './panels';

/** Contexto 2D falso: aceita qualquer chamada de desenho e mede texto pelo número de letras. */
function fakeCtx(): CanvasRenderingContext2D {
  const target: Record<string | symbol, unknown> = {
    measureText: (t: string) => ({ width: t.length * 7 }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : () => {}),
    set: (t, k, v) => ((t[k] = v), true),
  }) as unknown as CanvasRenderingContext2D;
}

const data: PanelsData = {
  now: Date.now(),
  system: null,
  projects: null,
  weather: null,
  reminders: [{ id: 'r1', text: 'Estudar', dueAt: Date.now() + 60 * 60_000, kind: 'reminder', done: false, createdAt: 0 }],
  music: null,
  finance: null,
  privacy: false,
  focus: null,
  grabbed: null,
};

describe('Panels com a interface ampliada', () => {
  it('as áreas de clique e os retângulos acompanham a escala', () => {
    const normal = new Panels();
    normal.resize(1920, 1080);
    const t1 = normal.draw(fakeCtx(), data, 1);
    const big = new Panels();
    big.resize(1920, 1080);
    const t15 = big.draw(fakeCtx(), data, 1.5);

    const cancel1 = t1.find((t) => t.id === 'reminder:r1')!;
    const cancel15 = t15.find((t) => t.id === 'reminder:r1')!;
    // Coluna da esquerda: a posição cresce junto com a escala
    expect(big.rects.system).toEqual(scaleRect(normal.rects.system, 1.5));
    // O "×" do lembrete fica maior e continua dentro do painel ampliado
    expect(cancel15.rect.w).toBeCloseTo(cancel1.rect.w * 1.5);
    const r = big.rects.reminders;
    expect(cancel15.rect.x).toBeGreaterThanOrEqual(r.x);
    expect(cancel15.rect.x + cancel15.rect.w).toBeLessThanOrEqual(r.x + r.w + 1);
    // Coluna da direita continua encostada na borda da tela
    expect(r.x + r.w).toBeCloseTo(1920 - 24 * 1.5);
  });
});

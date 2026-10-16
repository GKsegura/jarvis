import { describe, expect, it } from 'vitest';
import type { Pt } from './geometry';
import { averageFeatures, FEATURE_COUNT, featureDistance, matchPose, poseFeatures, type LearnedGesture } from './poses';

const FINGER_X = [0.45, 0.5, 0.55, 0.6];

/** Mesma mão sintética de gestures.test.ts: pulso embaixo, dedos para cima. */
function hand(curled: number[] = [], thumbTip: Pt = { x: 0.33, y: 0.6 }): Pt[] {
  const lm: Pt[] = new Array(21);
  lm[0] = { x: 0.5, y: 0.8 };
  lm[1] = { x: 0.42, y: 0.75 };
  lm[2] = { x: 0.38, y: 0.7 };
  lm[3] = { x: 0.35, y: 0.65 };
  lm[4] = thumbTip;
  FINGER_X.forEach((x, f) => {
    const b = 5 + f * 4;
    lm[b] = { x, y: 0.6 };
    const c = curled.includes(f);
    lm[b + 1] = { x, y: c ? 0.52 : 0.5 };
    lm[b + 2] = { x, y: c ? 0.58 : 0.45 };
    lm[b + 3] = { x, y: c ? 0.65 : 0.4 };
  });
  return lm;
}

/** Gira em torno de Z e afasta da câmera (escala): o vetor da pose não pode mudar. */
const transform = (lm: Pt[], angle: number, scale: number) =>
  lm.map(({ x, y }) => ({ x: (x * Math.cos(angle) - y * Math.sin(angle)) * scale, y: (x * Math.sin(angle) + y * Math.cos(angle)) * scale }));

// Uma pose "inventada": médio e mindinho dobrados, indicador e anelar esticados
const CUSTOM = hand([1, 3]);
const library: LearnedGesture[] = [
  { id: 'a', phrase: 'abrir o Spotify', features: poseFeatures(CUSTOM), createdAt: 0 },
  { id: 'b', phrase: 'que horas são', features: poseFeatures(hand([0, 1, 2, 3])), createdAt: 0 },
];

describe('poseFeatures', () => {
  it('tem o tamanho que o servidor espera', () => {
    expect(poseFeatures(CUSTOM)).toHaveLength(FEATURE_COUNT);
  });

  it('não muda com a mão girada nem mais longe da câmera', () => {
    expect(featureDistance(poseFeatures(CUSTOM), poseFeatures(transform(CUSTOM, 1.2, 0.6)))).toBeLessThan(1e-6);
  });

  it('separa poses diferentes', () => {
    expect(featureDistance(poseFeatures(CUSTOM), poseFeatures(hand()))).toBeGreaterThan(0.45);
  });
});

describe('matchPose', () => {
  it('reconhece o gesto aprendido, mesmo girado', () => {
    expect(matchPose(poseFeatures(transform(CUSTOM, -0.7, 1.3)), library)?.phrase).toBe('abrir o Spotify');
  });

  it('não reconhece poses que não foram aprendidas', () => {
    expect(matchPose(poseFeatures(hand()), library)).toBeNull();
  });
});

describe('averageFeatures', () => {
  it('faz a média de vários frames', () => {
    expect(averageFeatures([[0, 2], [2, 4]])).toEqual([1, 3]);
    expect(averageFeatures([])).toEqual([]);
  });
});

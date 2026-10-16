import { describe, expect, it } from 'vitest';
import type { Pt } from './geometry';
import { classify, fingerCurl, GestureTracker, PINCH_RELEASE_MS, pinchRatio } from './gestures';

const FINGER_X = [0.45, 0.5, 0.55, 0.6];

/** Mão sintética apontando para cima, pulso em (0.5, 0.8) e palma com 0.15 de largura. */
function hand({ curled = [] as number[], thumbTip = { x: 0.33, y: 0.6 } as Pt, indexTip }: { curled?: number[]; thumbTip?: Pt; indexTip?: Pt } = {}): Pt[] {
  const lm: Pt[] = new Array(21);
  lm[0] = { x: 0.5, y: 0.8 };
  lm[1] = { x: 0.42, y: 0.75 };
  lm[2] = { x: 0.38, y: 0.7 };
  lm[3] = { x: 0.35, y: 0.65 };
  lm[4] = thumbTip;
  FINGER_X.forEach((x, f) => {
    const b = 5 + f * 4;
    lm[b] = { x, y: 0.6 };
    if (curled.includes(f)) {
      lm[b + 1] = { x, y: 0.52 };
      lm[b + 2] = { x, y: 0.58 };
      lm[b + 3] = { x, y: 0.65 };
    } else {
      lm[b + 1] = { x, y: 0.5 };
      lm[b + 2] = { x, y: 0.45 };
      lm[b + 3] = { x, y: 0.4 };
    }
  });
  if (indexTip) lm[8] = indexTip;
  return lm;
}

const OPEN = hand();
const FIST = hand({ curled: [0, 1, 2, 3], thumbTip: { x: 0.47, y: 0.63 } });
const PINCH = hand({ indexTip: { x: 0.4, y: 0.45 }, thumbTip: { x: 0.405, y: 0.455 } });
const POINTING = hand({ curled: [1, 2, 3] });
/** Quatro dedos fechados e o polegar esticado para cima, longe do indicador. */
function thumbsUp(): Pt[] {
  const lm = hand({ curled: [0, 1, 2, 3] });
  lm[2] = { x: 0.38, y: 0.7 };
  lm[3] = { x: 0.37, y: 0.58 };
  lm[4] = { x: 0.36, y: 0.46 };
  return lm;
}
const THUMBS_UP = thumbsUp();
// Polegar a 0.45 da largura da palma: entre o limiar de entrada (0.35) e o de saída (0.55)
const ALMOST_PINCH = hand({ thumbTip: { x: 0.5175, y: 0.4 } });

/** Gira a mão em 3D (em torno de Y e depois de Z), como quando ela vira para o lado ou inclina. */
function rotate(lm: Pt[], yaw: number, roll: number): Pt[] {
  return lm.map(({ x, y, z = 0 }) => {
    const x1 = x * Math.cos(yaw) + z * Math.sin(yaw);
    const z1 = -x * Math.sin(yaw) + z * Math.cos(yaw);
    return { x: x1 * Math.cos(roll) - y * Math.sin(roll), y: x1 * Math.sin(roll) + y * Math.cos(roll), z: z1 };
  });
}

describe('classify', () => {
  it('reconhece mão aberta, punho, pinça e apontar', () => {
    expect(classify(OPEN)).toBe('open');
    expect(classify(FIST)).toBe('fist');
    expect(classify(PINCH)).toBe('pinch');
    expect(classify(POINTING)).toBe('point');
    expect(classify(hand({ curled: [1] }))).toBe('none');
  });

  it('reconhece joinha e polegar para baixo (mão de cabeça para baixo)', () => {
    expect(classify(THUMBS_UP)).toBe('thumbsUp');
    expect(classify(rotate(THUMBS_UP, 0, Math.PI))).toBe('thumbsDown');
    // Polegar para o lado não é joinha: é o "polegar de lado" (apontando para o peito)
    expect(classify(rotate(THUMBS_UP, 0, Math.PI / 2))).toBe('thumbSide');
    // Meio inclinado (nem vertical nem de lado): punho, para não disparar nada por engano
    expect(classify(rotate(THUMBS_UP, 0, 1.1))).toBe('fist');
  });

  it('reconhece ✌, três dedos, 🤘 e 🤙', () => {
    expect(classify(hand({ curled: [2, 3] }))).toBe('victory');
    expect(classify(hand({ curled: [3] }))).toBe('three');
    expect(classify(hand({ curled: [1, 2] }))).toBe('rock');
    expect(classify(hand({ curled: [0, 1, 2] }))).toBe('call');
    // 🤙 sem o polegar para fora é só uma mão meio fechada
    expect(classify(hand({ curled: [0, 1, 2], thumbTip: { x: 0.47, y: 0.63 } }))).not.toBe('call');
    for (const [yaw, roll] of [[0.8, 0], [0, 1.6], [-1.1, 2.4]]) {
      expect(classify(rotate(hand({ curled: [2, 3] }), yaw, roll))).toBe('victory');
      expect(classify(rotate(hand({ curled: [1, 2] }), yaw, roll))).toBe('rock');
    }
  });

  it('punho com o polegar sobre o indicador não vira pinça', () => {
    expect(pinchRatio(FIST)).toBeLessThan(0.35);
    expect(classify(FIST)).toBe('fist');
  });

  it('usa histerese: a pinça só solta acima do limiar de saída', () => {
    expect(pinchRatio(ALMOST_PINCH)).toBeCloseTo(0.45, 5);
    expect(classify(ALMOST_PINCH, false)).toBe('open');
    expect(classify(ALMOST_PINCH, true)).toBe('pinch');
  });

  it('mede a dobra dos dedos pelo ângulo: dedo reto ≈ 0°, dobrado ≈ 180°', () => {
    expect(fingerCurl(OPEN, [5, 6, 7, 8])).toBeCloseTo(0, 5);
    expect(fingerCurl(FIST, [5, 6, 7, 8])).toBeCloseTo(180, 5);
  });

  it('reconhece os gestos mesmo com a mão girada ou inclinada', () => {
    for (const [yaw, roll] of [[0.8, 0], [0, 1.6], [-1.1, 2.4], [1.3, -0.7]]) {
      expect(classify(rotate(OPEN, yaw, roll))).toBe('open');
      expect(classify(rotate(FIST, yaw, roll))).toBe('fist');
      expect(classify(rotate(PINCH, yaw, roll))).toBe('pinch');
      expect(classify(rotate(POINTING, yaw, roll))).toBe('point');
    }
  });

  it('ignora mãos incompletas', () => {
    expect(classify(OPEN.slice(0, 10))).toBe('none');
  });
});

describe('GestureTracker', () => {
  it('só aceita mão aberta e punho depois de 3 frames iguais', () => {
    const t = new GestureTracker();
    expect(t.update(OPEN, 0)).toBe('none');
    expect(t.update(OPEN, 33)).toBe('none');
    expect(t.update(OPEN, 66)).toBe('open');
    expect(t.update(FIST, 99)).toBe('open');
  });

  it('entra na pinça na hora e segura um frame ruim antes de soltar', () => {
    const t = new GestureTracker();
    expect(t.update(PINCH, 0)).toBe('pinch');
    expect(t.update(ALMOST_PINCH, 33)).toBe('pinch');
    // Um frame ruim (mão aberta) dentro da tolerância não solta o objeto
    expect(t.update(OPEN, 66)).toBe('pinch');
    expect(t.update(PINCH, 99)).toBe('pinch');
  });

  it('solta a pinça depois da tolerância, sem disparar mão aberta de cara', () => {
    const t = new GestureTracker();
    t.update(PINCH, 0);
    expect(t.update(OPEN, 33)).toBe('pinch');
    expect(t.update(OPEN, 33 + PINCH_RELEASE_MS)).toBe('none');
    expect(t.update(OPEN, 200)).toBe('none');
    expect(t.update(OPEN, 233)).toBe('open');
  });
});

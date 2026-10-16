import { dist, type Pt } from './geometry';

export type Gesture =
  | 'pinch'
  | 'open'
  | 'fist'
  | 'point'
  | 'thumbsUp'
  | 'thumbsDown'
  | 'thumbSide'
  | 'victory'
  | 'three'
  | 'rock'
  | 'call'
  | 'none';

export const GESTURE_LABEL: Record<Gesture, string> = {
  pinch: 'PINÇA',
  open: 'MÃO ABERTA',
  fist: 'PUNHO',
  point: 'APONTANDO',
  thumbsUp: 'JOINHA',
  thumbsDown: 'POLEGAR P/ BAIXO',
  thumbSide: 'POLEGAR DE LADO',
  victory: '✌ DOIS DEDOS',
  three: 'TRÊS DEDOS',
  rock: '🤘 ROCK',
  call: '🤙 TELEFONE',
  none: '—',
};

// Índices dos 21 pontos do MediaPipe Hands
const THUMB_MCP = 2;
const THUMB_IP = 3;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const PINKY_MCP = 17;
/** [mcp, pip, dip, ponta] de indicador, médio, anelar e mínimo */
const FINGERS: ReadonlyArray<readonly [number, number, number, number]> = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

/** Distância polegar–indicador, relativa à largura da palma, para começar a pinça... */
export const PINCH_ENTER = 0.35;
/** ...e para soltar. A diferença (histerese) evita que a pinça fique piscando. */
export const PINCH_EXIT = 0.55;
/** Soma das dobras das articulações PIP e DIP (graus) abaixo da qual o dedo conta como esticado. */
export const EXTENDED_MAX_DEG = 65;
/** Acima disto o dedo conta como fechado. */
export const CURLED_MIN_DEG = 120;
/** A pinça só solta depois de tanto tempo sem pinça, para não largar o objeto num frame ruim. */
export const PINCH_RELEASE_MS = 120;
/** No apontar, os outros três dedos só precisam estar meio dobrados. */
export const POINT_OTHERS_MIN_DEG = 90;
/** Ponta do polegar longe da base do indicador (relativo à largura da palma): polegar para fora do punho. */
export const THUMB_OUT_MIN = 0.7;
/** Dobra máxima da articulação do polegar para ele contar como esticado. */
export const THUMB_STRAIGHT_MAX_DEG = 50;
/** O polegar tem que apontar mais para cima/baixo do que para o lado (componente vertical / comprimento). */
export const THUMB_VERTICAL_MIN = 0.6;
/** Polegar "de lado" (para o peito): componente vertical bem pequena. Entre isto e o vertical, é punho. */
export const THUMB_SIDE_MAX = 0.45;
/** Nas poses com alguns dedos esticados (✌, 3 dedos, 🤘, 🤙), os outros só precisam estar bem dobrados. */
export const FOLDED_MIN_DEG = 90;
const STABLE_FRAMES = 3;

const sub = (a: Pt, b: Pt) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) });

/** Quanto a articulação em `b` está dobrada, em graus (0 = reta). */
function bendDeg(a: Pt, b: Pt, c: Pt): number {
  const u = sub(a, b);
  const v = sub(c, b);
  const nu = Math.hypot(u.x, u.y, u.z);
  const nv = Math.hypot(v.x, v.y, v.z);
  if (nu < 1e-9 || nv < 1e-9) return 0;
  const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / (nu * nv);
  const angle = Math.acos(Math.min(1, Math.max(-1, cos)));
  return 180 - (angle * 180) / Math.PI;
}

/** Dobra total do dedo (PIP + DIP), em graus. Não depende de como a mão está girada. */
export function fingerCurl(lm: Pt[], [mcp, pip, dip, tip]: readonly [number, number, number, number]): number {
  return bendDeg(lm[mcp], lm[pip], lm[dip]) + bendDeg(lm[pip], lm[dip], lm[tip]);
}

export const pinchRatio = (lm: Pt[]): number =>
  dist(lm[THUMB_TIP], lm[INDEX_TIP]) / Math.max(dist(lm[INDEX_MCP], lm[PINKY_MCP]), 1e-6);

export interface GestureMetrics {
  pinch: number;
  /** Dobra de indicador, médio, anelar e mínimo, em graus. */
  curls: number[];
  /** Distância da ponta do polegar à base do indicador, relativa à largura da palma. */
  thumbOut: number;
  /** Dobra da articulação do polegar, em graus. */
  thumbBend: number;
  /** Direção vertical do polegar, de -1 (para cima) a 1 (para baixo). Na imagem e nos worldLandmarks, y cresce para baixo. */
  thumbDir: number;
}

/** Os números por trás do gesto, para o modo de depuração (tecla D). */
export function gestureMetrics(lm: Pt[]): GestureMetrics {
  const palm = Math.max(dist(lm[INDEX_MCP], lm[PINKY_MCP]), 1e-6);
  const thumbLen = Math.max(dist(lm[THUMB_MCP], lm[THUMB_TIP]), 1e-6);
  return {
    pinch: pinchRatio(lm),
    curls: FINGERS.map((f) => fingerCurl(lm, f)),
    thumbOut: dist(lm[THUMB_TIP], lm[INDEX_MCP]) / palm,
    thumbBend: bendDeg(lm[THUMB_MCP], lm[THUMB_IP], lm[THUMB_TIP]),
    thumbDir: (lm[THUMB_TIP].y - lm[THUMB_MCP].y) / thumbLen,
  };
}

/** Classifica um único frame. Use de preferência os `worldLandmarks` (em metros, sem distorção). */
export function classify(lm: Pt[], wasPinching = false): Gesture {
  if (lm.length < 21) return 'none';
  const { pinch, curls, thumbOut, thumbBend, thumbDir } = gestureMetrics(lm);
  if (curls.every((c) => c > CURLED_MIN_DEG)) {
    // Quatro dedos fechados: punho, a não ser que o polegar esteja esticado (para cima, para baixo ou de lado)
    if (thumbOut > THUMB_OUT_MIN && thumbBend < THUMB_STRAIGHT_MAX_DEG) {
      if (Math.abs(thumbDir) > THUMB_VERTICAL_MIN) return thumbDir < 0 ? 'thumbsUp' : 'thumbsDown';
      if (Math.abs(thumbDir) < THUMB_SIDE_MAX) return 'thumbSide';
    }
    return 'fist';
  }
  const threshold = wasPinching ? PINCH_EXIT : PINCH_ENTER;
  if (pinch < threshold && curls[0] <= CURLED_MIN_DEG) return 'pinch';
  if (curls[0] < EXTENDED_MAX_DEG && curls.slice(1).every((c) => c > POINT_OTHERS_MIN_DEG)) return 'point';
  // Quais dedos estão esticados (E) e quais estão dobrados (D): indicador, médio, anelar, mínimo
  const shape = curls.map((c) => (c < EXTENDED_MAX_DEG ? 'E' : c > FOLDED_MIN_DEG ? 'D' : '?')).join('');
  if (shape === 'EEDD') return 'victory';
  if (shape === 'EEED') return 'three';
  if (shape === 'EDDE') return 'rock';
  if (shape === 'DDDE' && thumbOut > THUMB_OUT_MIN) return 'call';
  if (curls.every((c) => c < EXTENDED_MAX_DEG)) return 'open';
  return 'none';
}

/**
 * Estabiliza o gesto de uma mão ao longo dos frames: a pinça entra na hora (para agarrar sem
 * atraso) e só sai depois de PINCH_RELEASE_MS; os outros gestos valem depois de alguns frames iguais.
 */
export class GestureTracker {
  current: Gesture = 'none';
  private candidate: Gesture = 'none';
  private count = 0;
  private pinchLostAt: number | null = null;

  /** `now` em milissegundos. */
  update(lm: Pt[], now: number): Gesture {
    const raw = classify(lm, this.current === 'pinch');
    if (raw === 'pinch') {
      this.current = this.candidate = 'pinch';
      this.count = 0;
      this.pinchLostAt = null;
      return this.current;
    }
    if (this.current === 'pinch') {
      this.pinchLostAt ??= now;
      if (now - this.pinchLostAt < PINCH_RELEASE_MS) return this.current;
      this.current = 'none';
      this.pinchLostAt = null;
    }

    if (raw === this.candidate) this.count++;
    else {
      this.candidate = raw;
      this.count = 1;
    }
    if (this.count >= STABLE_FRAMES) this.current = raw;
    return this.current;
  }
}

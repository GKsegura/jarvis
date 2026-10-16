import { dist, type Pt } from './geometry';
import { fingerCurl, gestureMetrics } from './gestures';

/**
 * Gestos que o JARVIS aprende ("Jarvis, aprende este gesto para abrir o Spotify"). A pose vira um
 * vetor de números que não muda com a mão girada nem com a distância da câmera: a dobra de cada
 * dedo e as distâncias entre as pontas dos dedos, divididas pela largura da palma.
 */

const TIPS = [4, 8, 12, 16, 20];
const WRIST = 0;
const INDEX_MCP = 5;
const PINKY_MCP = 17;
const FINGERS: ReadonlyArray<readonly [number, number, number, number]> = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

/** Tamanho do vetor da pose (o servidor confere ao salvar). */
export const FEATURE_COUNT = 21;

/** Distância máxima entre vetores para dizer que é o mesmo gesto. */
export const MATCH_MAX = 0.45;

/** Vetor da pose, a partir dos pontos 3D da mão (`worldLandmarks`). */
export function poseFeatures(lm: Pt[]): number[] {
  const palm = Math.max(dist(lm[INDEX_MCP], lm[PINKY_MCP]), 1e-6);
  const m = gestureMetrics(lm);
  const features = [
    ...FINGERS.map((f) => fingerCurl(lm, f) / 180),
    Math.min(m.thumbOut, 2) / 2,
    m.thumbBend / 180,
  ];
  // Distância entre cada par de pontas de dedo
  for (let i = 0; i < TIPS.length; i++) {
    for (let j = i + 1; j < TIPS.length; j++) features.push(Math.min(dist(lm[TIPS[i]], lm[TIPS[j]]) / palm, 3) / 3);
  }
  // Distância de cada ponta até o pulso
  for (const t of TIPS) features.push(Math.min(dist(lm[t], lm[WRIST]) / palm, 3) / 3);
  return features;
}

/** Média de vários frames (a gravação dura uns 2 segundos). */
export function averageFeatures(samples: number[][]): number[] {
  if (samples.length === 0) return [];
  return samples[0].map((_, i) => samples.reduce((s, f) => s + f[i], 0) / samples.length);
}

export const featureDistance = (a: number[], b: number[]): number =>
  a.length !== b.length ? Infinity : Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));

export interface LearnedGesture {
  id: string;
  /** O que fazer: a frase, executada como se tivesse sido falada ("abrir o Spotify"). */
  phrase: string;
  features: number[];
  createdAt: number;
}

/** O gesto aprendido mais parecido com a pose, se estiver perto o bastante. */
export function matchPose(features: number[], library: LearnedGesture[], max = MATCH_MAX): LearnedGesture | null {
  let best: { g: LearnedGesture; d: number } | null = null;
  for (const g of library) {
    const d = featureDistance(features, g.features);
    if (d < max && (!best || d < best.d)) best = { g, d };
  }
  return best?.g ?? null;
}

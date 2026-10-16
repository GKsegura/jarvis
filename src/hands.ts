import { FilesetResolver, HandLandmarker, type HandLandmarkerOptions } from '@mediapipe/tasks-vision';
import type { Pt } from './geometry';

// Manter igual à versão de @mediapipe/tasks-vision no package.json
const MEDIAPIPE_VERSION = '0.10.35';
export const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export interface TrackedHand {
  /** "Left"/"Right" segundo o MediaPipe. Troca com frequência: a identidade estável vem do HandStabilizer. */
  key: string;
  /** Pontos normalizados (0..1) na imagem do vídeo. */
  landmarks: Pt[];
  /** Pontos em metros, centrados na mão; melhores para medir gestos. */
  world: Pt[];
}

export class HandTracker {
  private lastVideoTime = -1;
  /** Quanto tempo levou a última detecção, em ms (aparece no painel de diagnóstico). */
  lastDetectMs = 0;
  private lastDetectAt = -Infinity;

  private constructor(private readonly landmarker: HandLandmarker) {}

  static async create(): Promise<HandTracker> {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const options = (delegate: 'GPU' | 'CPU'): HandLandmarkerOptions => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      // Mais permissivo que antes (0.6): perde menos a mão com pouca luz ou movimento rápido;
      // o HandStabilizer cuida do tremor que isso traz
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.4,
    });
    try {
      return new HandTracker(await HandLandmarker.createFromOptions(vision, options('GPU')));
    } catch {
      return new HandTracker(await HandLandmarker.createFromOptions(vision, options('CPU')));
    }
  }

  /** Detecta as mãos no frame atual do vídeo; `null` quando ainda não chegou um frame novo ou o orçamento (`minIntervalMs`) não deixa. */
  detect(video: HTMLVideoElement, now: number, minIntervalMs = 0): TrackedHand[] | null {
    if (video.readyState < 2 || video.currentTime === this.lastVideoTime) return null;
    if (now - this.lastDetectAt < minIntervalMs) return null;
    this.lastVideoTime = video.currentTime;
    this.lastDetectAt = now;

    const start = performance.now();
    const result = this.landmarker.detectForVideo(video, now);
    this.lastDetectMs = performance.now() - start;
    return result.landmarks.map((landmarks, i) => ({
      key: result.handedness[i]?.[0]?.categoryName ?? 'Hand',
      landmarks,
      world: result.worldLandmarks[i] ?? landmarks,
    }));
  }
}

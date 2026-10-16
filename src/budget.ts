/**
 * Orçamento de CPU/GPU: decide com que frequência o JARVIS detecta mãos, lê o rosto e redesenha,
 * conforme o que está acontecendo. Puro, para poder testar sem navegador.
 */

export interface Activity {
  /** Há mãos na câmera agora. */
  hands: boolean;
  /** Milissegundos desde a última vez que viu uma mão. */
  sinceHandsMs: number;
  /** Mouse no ar, menu na mão, zoom ou arraste: precisa de resposta rápida. */
  interacting: boolean;
  /** Modo espera. */
  standby: boolean;
  /** O dono saiu da frente do PC. */
  away: boolean;
  /** A janela está oculta (aba em segundo plano). */
  hidden: boolean;
}

/** Depois de tanto tempo sem mão, a detecção de mãos desacelera. */
const HANDS_IDLE_AFTER_MS = 3000;

/** Intervalo mínimo entre detecções de mão, em ms. */
export function handInterval(a: Activity): number {
  if (a.interacting || a.hands) return 33; // ~30 por segundo
  if (a.away || a.hidden) return 500; // só para acordar com um aceno
  if (a.standby) return 250;
  return a.sinceHandsMs > HANDS_IDLE_AFTER_MS ? 100 : 33;
}

/** Intervalo mínimo entre frames do HUD, em ms (0 = a cada quadro do navegador). */
export function frameInterval(a: Activity): number {
  if (a.interacting || a.hands) return 0;
  if (a.away || a.hidden) return 100; // ~10 fps
  if (a.standby) return 66; // ~15 fps
  return 33; // ~30 fps
}

/** Ausente ou em espera: o rosto só precisa ser conferido de vez em quando. */
export const FACE_IDLE_EVERY_MS = 5000;

/** Escala de pixels do canvas: telas de alta densidade não precisam de mais que isso. */
export function canvasScale(devicePixelRatio: number): number {
  return Math.min(Math.max(devicePixelRatio, 1), 1.5);
}

export interface Pt {
  x: number;
  y: number;
  z?: number;
}

export interface Size {
  w: number;
  h: number;
}

export const dist = (a: Pt, b: Pt): number =>
  Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

export const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * Converte um ponto normalizado (0..1) do vídeo para pixels da tela, considerando
 * o recorte do `object-fit: cover` e o espelhamento do vídeo.
 */
export function toScreen(p: Pt, video: Size, view: Size, mirror = true): Pt {
  const s = Math.max(view.w / video.w, view.h / video.h);
  const dw = video.w * s;
  const dh = video.h * s;
  const ox = (view.w - dw) / 2;
  const oy = (view.h - dh) / 2;
  const nx = mirror ? 1 - p.x : p.x;
  return { x: ox + nx * dw, y: oy + p.y * dh };
}

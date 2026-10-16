import { describe, expect, it } from 'vitest';
import { toScreen } from './geometry';

describe('toScreen', () => {
  it('espelha o vídeo quando a tela tem o mesmo formato', () => {
    expect(toScreen({ x: 0.25, y: 0.5 }, { w: 1280, h: 720 }, { w: 1280, h: 720 })).toEqual({ x: 960, y: 360 });
  });

  it('considera o recorte do object-fit: cover', () => {
    const video = { w: 1280, h: 720 };
    const square = { w: 720, h: 720 };
    expect(toScreen({ x: 0.5, y: 0.5 }, video, square)).toEqual({ x: 360, y: 360 });
    expect(toScreen({ x: 1, y: 0 }, video, square)).toEqual({ x: -280, y: 0 });
    expect(toScreen({ x: 1, y: 0 }, video, square, false)).toEqual({ x: 1000, y: 0 });
  });
});

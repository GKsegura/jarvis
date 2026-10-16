import { describe, expect, it } from 'vitest';
import { mergeDetections, objectLabel, OBJECT_LABEL_PT, pickShown, type SeenObject } from './objects';

const obj = (label: string, score: number, x = 0.4, y = 0.4): SeenObject => ({
  label,
  name: objectLabel(label),
  score,
  box: { x, y, w: 0.2, h: 0.2 },
});

describe('OBJECT_LABEL_PT', () => {
  it('traduz as 80 classes do COCO', () => {
    expect(Object.keys(OBJECT_LABEL_PT)).toHaveLength(80);
    expect(objectLabel('cell phone')).toBe('um celular');
    expect(objectLabel('desconhecido')).toBe('desconhecido');
  });
});

describe('mergeDetections', () => {
  it('fica com a melhor detecção de cada classe e enfraquece as que aparecem em poucos frames', () => {
    const frames = [[obj('bottle', 0.6), obj('cup', 0.9)], [obj('bottle', 0.8)], [obj('bottle', 0.7)], [obj('bottle', 0.5)]];
    const merged = mergeDetections(frames);
    expect(merged[0].label).toBe('bottle');
    expect(merged[0].score).toBeCloseTo(0.8);
    // Caneca só em 1 de 4 frames: 0.9 × 1/2
    expect(merged[1]).toMatchObject({ label: 'cup' });
    expect(merged[1].score).toBeCloseTo(0.45);
  });
});

describe('pickShown', () => {
  it('prefere um objeto a uma pessoa', () => {
    expect(pickShown([obj('person', 0.95), obj('bottle', 0.5)], null)?.label).toBe('bottle');
    expect(pickShown([obj('person', 0.95)], null)?.label).toBe('person');
    expect(pickShown([], null)).toBeNull();
  });

  it('prefere o objeto perto da mão', () => {
    const far = obj('laptop', 0.8, 0.0, 0.0);
    const near = obj('cell phone', 0.6, 0.6, 0.6);
    expect(pickShown([far, near], { x: 0.7, y: 0.7 })?.label).toBe('cell phone');
  });
});

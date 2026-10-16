import { describe, expect, it } from 'vitest';
import { GestureStore } from './gestures';

const features = Array.from({ length: 21 }, (_, i) => i / 21);

describe('GestureStore', () => {
  it('aprende, lista e esquece', () => {
    const store = new GestureStore(null);
    const g = store.add('abrir o Spotify', features, 1000);
    expect(store.list()).toEqual([{ id: g.id, phrase: 'abrir o Spotify', features, createdAt: 1000 }]);
    expect(store.remove(g.id)).toBe(true);
    expect(store.remove(g.id)).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it('recusa gesto sem ação ou com pose inválida', () => {
    const store = new GestureStore(null);
    expect(() => store.add('  ', features)).toThrow();
    expect(() => store.add('x', [1, 2, 3])).toThrow();
    expect(() => store.add('x', features.map(() => Number.NaN))).toThrow();
  });
});

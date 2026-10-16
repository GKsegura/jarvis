import { describe, expect, it } from 'vitest';
import { moodOf, moodSpeech, MoodTracker, type ExpressionScores } from './mood';

const scores = (partial: Partial<ExpressionScores>): ExpressionScores => ({
  neutral: 0,
  happy: 0,
  sad: 0,
  angry: 0,
  fearful: 0,
  disgusted: 0,
  surprised: 0,
  ...partial,
});

describe('moodOf', () => {
  it('rosto em repouso é neutro', () => {
    expect(moodOf([scores({ neutral: 0.9, sad: 0.05 }), scores({ neutral: 0.85, happy: 0.1 })])).toMatchObject({
      expression: 'neutral',
      strong: true,
    });
  });

  it('um sorriso no meio da frase conta, mesmo com o resto neutro', () => {
    const frames = [scores({ neutral: 0.9 }), scores({ happy: 0.95 }), scores({ neutral: 0.6, happy: 0.35 }), scores({ neutral: 0.9 })];
    expect(moodOf(frames)?.expression).toBe('happy');
  });

  it('emoção clara vira "forte"; fraca vira "um pouco"', () => {
    const sad = moodOf([scores({ sad: 0.9 }), scores({ sad: 0.8 })])!;
    expect(sad).toMatchObject({ expression: 'sad', strong: true });
    expect(moodSpeech(sad)).toBe('triste');
    const bitSad = moodOf([scores({ neutral: 0.55, sad: 0.45 }), scores({ neutral: 0.6, sad: 0.4 })])!;
    expect(bitSad).toMatchObject({ expression: 'sad', strong: false });
    expect(moodSpeech(bitSad)).toBe('um pouco triste');
    expect(moodSpeech(bitSad, 'uk')).toBe('a little sad');
  });

  it('sem amostras não há humor', () => {
    expect(moodOf([])).toBeNull();
  });
});

describe('MoodTracker', () => {
  it('lê só o período pedido e esquece amostras velhas', () => {
    const t = new MoodTracker();
    t.add(scores({ angry: 0.9 }), 1000);
    t.add(scores({ happy: 0.9 }), 5000);
    t.add(scores({ happy: 0.8 }), 6000);
    expect(t.between(4000, 7000)?.expression).toBe('happy');
    expect(t.recent(500, 1200)?.expression).toBe('angry');
    t.add(scores({ neutral: 1 }), 100_000);
    expect(t.between(0, 7000)).toBeNull();
  });
});

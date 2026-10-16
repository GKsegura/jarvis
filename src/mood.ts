import type { VoiceStyle } from './lines';

/** As 7 expressões que o modelo do face-api reconhece. */
export const EXPRESSIONS = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'] as const;
export type Expression = (typeof EXPRESSIONS)[number];
export type ExpressionScores = Record<Expression, number>;

export const MOOD_LABEL: Record<Expression, string> = {
  neutral: 'NEUTRO',
  happy: 'FELIZ',
  sad: 'TRISTE',
  angry: 'IRRITADO',
  fearful: 'APREENSIVO',
  disgusted: 'INCOMODADO',
  surprised: 'SURPRESO',
};

/** Como se fala: "o senhor parece feliz". */
const MOOD_SPEECH: Record<VoiceStyle, Record<Expression, string>> = {
  br: {
    neutral: 'tranquilo',
    happy: 'feliz',
    sad: 'triste',
    angry: 'irritado',
    fearful: 'apreensivo',
    disgusted: 'incomodado',
    surprised: 'surpreso',
  },
  uk: {
    neutral: 'calm',
    happy: 'happy',
    sad: 'sad',
    angry: 'annoyed',
    fearful: 'worried',
    disgusted: 'bothered',
    surprised: 'surprised',
  },
};

export interface Mood {
  expression: Expression;
  /** Média da probabilidade da expressão no período (0..1). */
  confidence: number;
  /** Clara (> 0,6) ou leve. */
  strong: boolean;
}

interface Sample {
  at: number;
  scores: ExpressionScores;
}

/** Abaixo disto, uma emoção não-neutra não conta (o modelo dá um pouco de tudo em qualquer rosto). */
const MIN_CONFIDENCE = 0.35;
/** Amostras mais velhas que isto são descartadas. */
const KEEP_MS = 60_000;

/**
 * Junta as expressões lidas em vários frames num humor só. Uma emoção não-neutra ganha do
 * "neutro" se aparecer com força suficiente: quase todo rosto em repouso é lido como neutro,
 * e um sorriso rápido no meio da frase é justamente o que interessa.
 */
export function moodOf(samples: ExpressionScores[]): Mood | null {
  if (samples.length === 0) return null;
  const avg = Object.fromEntries(EXPRESSIONS.map((e) => [e, samples.reduce((s, x) => s + (x[e] ?? 0), 0) / samples.length])) as ExpressionScores;
  // Pico de cada emoção: um sorriso de 1 s numa frase de 5 s ainda conta
  const peak = Object.fromEntries(EXPRESSIONS.map((e) => [e, Math.max(...samples.map((x) => x[e] ?? 0))])) as ExpressionScores;
  const emotions = EXPRESSIONS.filter((e) => e !== 'neutral');
  const best = emotions.reduce((a, b) => (avg[b] + peak[b] * 0.5 > avg[a] + peak[a] * 0.5 ? b : a));
  const score = Math.min(1, avg[best] * 0.6 + peak[best] * 0.4);
  if (score >= MIN_CONFIDENCE) return { expression: best, confidence: score, strong: score > 0.6 };
  return { expression: 'neutral', confidence: avg.neutral, strong: avg.neutral > 0.6 };
}

export function moodSpeech(mood: Mood, style: VoiceStyle = 'br'): string {
  const word = MOOD_SPEECH[style][mood.expression];
  if (style === 'uk') return mood.strong || mood.expression === 'neutral' ? word : `a little ${word}`;
  return mood.strong || mood.expression === 'neutral' ? word : `um pouco ${word}`;
}

/** Guarda as expressões lidas da câmera e responde "como o senhor estava" num período. */
export class MoodTracker {
  private samples: Sample[] = [];

  add(scores: ExpressionScores, at = performance.now()): void {
    this.samples.push({ at, scores });
    this.samples = this.samples.filter((s) => at - s.at < KEEP_MS);
  }

  /** Humor entre `from` e `to` (ms de performance.now). */
  between(from: number, to = performance.now()): Mood | null {
    return moodOf(this.samples.filter((s) => s.at >= from && s.at <= to).map((s) => s.scores));
  }

  /** Humor nos últimos `ms`. */
  recent(ms: number, now = performance.now()): Mood | null {
    return this.between(now - ms, now);
  }

  clear(): void {
    this.samples = [];
  }
}

import { describe, expect, it } from 'vitest';
import { stripWake } from './wake';

describe('stripWake', () => {
  it.each([
    ['Jarvis, que horas são?', 'que horas são?'],
    ['jarvis toca Back in Black', 'toca Back in Black'],
    ['Ei Jarvis, abre o Spotify', 'abre o Spotify'],
    ['ok jarbas pausa', 'pausa'],
    ['Javis status', 'status'],
    ['o Jarvis qual é a capital da França', 'qual é a capital da França'],
    ['Jarvis', ''],
    ['Jarvis.', ''],
  ])('"%s" → "%s"', (text, expected) => {
    expect(stripWake(text)).toBe(expected);
  });

  it('ignora frases que não começam com Jarvis', () => {
    expect(stripWake('que horas são')).toBeNull();
    expect(stripWake('eu falei com o Jarvis ontem')).toBeNull();
    expect(stripWake('jarvisinho')).toBeNull();
  });
});

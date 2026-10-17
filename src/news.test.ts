import { describe, expect, it } from 'vitest';
import { ago, headlinesSpeech, spokenTitle, type NewsItem } from './news';

const item = (title: string, source = 'G1'): NewsItem => ({ title, link: 'https://x.com', source, topics: [], publishedAt: 0 });

describe('spokenTitle', () => {
  it('tira o nome do portal colado no fim e limita o tamanho', () => {
    expect(spokenTitle('Governo anuncia plano - G1')).toBe('Governo anuncia plano');
    expect(spokenTitle('A'.repeat(200)).length).toBeLessThanOrEqual(140);
  });
});

describe('headlinesSpeech', () => {
  const items = ['Um', 'Dois', 'Três', 'Quatro'].map((t) => item(t));

  it('lê as três primeiras e avança o ponto de leitura', () => {
    const first = headlinesSpeech(items, 0)!;
    expect(first.text).toBe('Um, segundo o G1. Em seguida: Dois, segundo o G1. Em seguida: Três, segundo o G1.');
    expect(first.next).toBe(3);
    const second = headlinesSpeech(items, first.next)!;
    expect(second.text).toBe('Quatro, segundo o G1.');
    expect(second.next).toBe(4);
  });

  it('volta ao começo quando acabam e não fala nada sem notícias', () => {
    expect(headlinesSpeech(items, 4)!.next).toBe(3);
    expect(headlinesSpeech([], 0)).toBeNull();
  });
});

describe('ago', () => {
  const now = Date.UTC(2026, 9, 12, 12, 0);
  it('resume há quanto tempo saiu', () => {
    expect(ago(now - 20_000, now)).toBe('agora');
    expect(ago(now - 5 * 60_000, now)).toBe('5 min');
    expect(ago(now - 3 * 3_600_000, now)).toBe('3 h');
    expect(ago(now - 2 * 86_400_000, now)).toBe('2 d');
    expect(ago(0, now)).toBe('');
  });
});

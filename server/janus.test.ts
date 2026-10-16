import { describe, expect, it } from 'vitest';
import { buildSummary, currentMonth } from './janus';

describe('janus', () => {
  it('soma só as dívidas em aberto e lista só quem tem pendência', () => {
    const s = buildSummary(
      { month: '2026-10', ganho: 1, fixo: 0, variavel: 0, restante: 1, pago: 0, pendente: 0 },
      [
        { amount: 1000.1, status: 'Aberto' },
        { amount: 500, status: 'Pago' },
        { amount: 200.2, status: 'Aberto' },
      ],
      [
        { person: 'Ana', pendente: 50 },
        { person: 'Bia', pendente: 0 },
      ],
    );
    expect(s.dividasAbertas).toBe(1200.3);
    expect(s.devendo).toEqual([{ person: 'Ana', pendente: 50 }]);
  });

  it('calcula o mês atual no fuso de São Paulo', () => {
    // 1º de novembro, 01:00 UTC = ainda 31 de outubro em São Paulo
    expect(currentMonth(new Date('2026-11-01T01:00:00Z'))).toBe('2026-10');
  });
});

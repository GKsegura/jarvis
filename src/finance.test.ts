import { describe, expect, it } from 'vitest';
import { falarReais, financeSpeech, type FinanceSummary } from './finance';

describe('falarReais', () => {
  it.each([
    [1234.56, '1.234 reais e 56 centavos'],
    [1, '1 real'],
    [0, '0 reais'],
    [0.5, '50 centavos'],
    [2500, '2.500 reais'],
    [-300.01, 'menos 300 reais e 1 centavo'],
  ])('%s → "%s"', (value, expected) => {
    expect(falarReais(value)).toBe(expected);
  });

  it('em inglês usa separador e conjunção do inglês', () => {
    expect(falarReais(1234.56, 'uk')).toBe('1,234 reais and 56 centavos');
  });
});

const base: FinanceSummary = {
  month: '2026-10',
  ganho: 4200,
  fixo: 2000,
  variavel: 1100,
  restante: 1100,
  pago: 2800,
  pendente: 300,
  dividasAbertas: 2500,
  devendo: [{ person: 'Ana', pendente: 50 }],
};

describe('financeSpeech', () => {
  it('monta o resumo falado do mês', () => {
    expect(financeSpeech(base)).toBe(
      'Em outubro, entraram 4.200 reais e saíram 3.100 reais, sobrando 1.100 reais. ' +
        'Ainda há 300 reais pendentes de pagamento. As dívidas em aberto somam 2.500 reais. Ana ainda deve 50 reais.',
    );
  });

  it('fala "no vermelho" quando o restante é negativo e omite o que é zero', () => {
    const s = { ...base, restante: -200, pendente: 0, dividasAbertas: 0, devendo: [] };
    expect(financeSpeech(s)).toBe('Em outubro, entraram 4.200 reais e saíram 3.100 reais, ficando 200 reais no vermelho.');
  });
});

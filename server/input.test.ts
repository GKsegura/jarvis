import { describe, expect, it } from 'vitest';
import { INPUT_SCRIPT, KEYS, toLines } from './input';

describe('toLines', () => {
  it('converte os comandos dos gestos', () => {
    expect(
      toLines([{ move: [0.5, 0.25] }, { button: 'down' }, { button: 'up' }, { scroll: -3 }, { keys: ['alt', 'tab'] }, { volume: 0.4 }]),
    ).toEqual(['move 0.50000 0.25000', 'down', 'up', 'scroll -3', 'keys 0x12,0x9', 'setvol 0.400']);
  });

  it.each([
    [[{ move: [1.5, 0] }]],
    [[{ keys: ['alt', 'f4'] }]],
    [[{ keys: ['a b'] }]],
    [[{ scroll: 1.5 }]],
    [[{ scroll: 0 }]],
    [[{ volume: 2 }]],
    [[{ type: 'texto qualquer' }]],
    [[]],
    ['não é lista'],
    [Array.from({ length: 21 }, () => ({ button: 'up' }))],
  ])('recusa %j', (cmds) => {
    expect(toLines(cmds)).toBeNull();
  });

  it('só atalhos: nenhuma tecla de letra além do D (Win+D)', () => {
    expect(Object.keys(KEYS).filter((k) => k.length === 1)).toEqual(['d']);
  });
});

describe('INPUT_SCRIPT', () => {
  it('lê números com ponto mesmo no Windows em português e é DPI-aware', () => {
    expect(INPUT_SCRIPT).toContain('InvariantCulture');
    expect(INPUT_SCRIPT).toContain('SetProcessDPIAware');
  });
});

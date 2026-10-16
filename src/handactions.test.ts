import { describe, expect, it } from 'vitest';
import { parseHandAction, parseShortcuts } from './handactions';

describe('parseHandAction', () => {
  it.each([
    ['play:Back in Black', { kind: 'play', query: 'Back in Black' }],
    ['pause', { kind: 'music', action: 'pause' }],
    ['next', { kind: 'music', action: 'next' }],
    ['open:spotify', { kind: 'open', id: 'spotify' }],
    ['focus:vscode', { kind: 'focus', id: 'vscode' }],
    ['run:janus', { kind: 'run', id: 'janus' }],
    ['timer:25', { kind: 'timer', minutes: 25 }],
    ['timer:1,5', { kind: 'timer', minutes: 1.5 }],
    ['command:weather', { kind: 'command', command: 'weather' }],
    ['mouse', { kind: 'mouse' }],
    ['say:que horas são', { kind: 'say', text: 'que horas são' }],
  ])('"%s"', (raw, expected) => {
    expect(parseHandAction(raw)).toEqual(expected);
  });

  it.each(['', 'play:', 'pause:agora', 'open:Spotify App', 'open:../x', 'timer:0', 'timer:abc', 'command:rm -rf', 'formatar', 'mouse:1'])('recusa "%s"', (raw) => {
    expect(parseHandAction(raw)).toBeNull();
  });
});

describe('parseShortcuts', () => {
  it('lê o menu e as poses, descartando o que estiver malformado', () => {
    const { handMenu, poses } = parseShortcuts({
      handMenu: [
        { label: 'Spotify', action: 'open:spotify' },
        { label: '', action: 'pause' },
        { label: 'Ruim', action: 'formatar:c' },
        'texto solto',
      ],
      poses: { rock: { label: 'AC/DC', action: 'play:Back in Black' }, victory: { label: 'x', action: 'pause' }, call: { label: 'x', action: 'nada' } },
    });
    expect(handMenu).toEqual([{ label: 'Spotify', action: 'open:spotify' }]);
    expect(poses).toEqual({ rock: { label: 'AC/DC', action: 'play:Back in Black' } });
  });

  it('config sem atalhos', () => {
    expect(parseShortcuts({})).toEqual({ handMenu: [], poses: {} });
  });
});

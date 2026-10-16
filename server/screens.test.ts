import { describe, expect, it } from 'vitest';
import { otherScreens, parseScreens, placeScript, RELEASE_SCRIPT, SCREEN_TITLE } from './screens';

// Os dois monitores deste PC: o principal em cima e o segundo embaixo
const SCREENS = parseScreens('[{"x":0,"y":0,"w":1920,"h":1080,"primary":true},{"x":0,"y":1080,"w":1920,"h":1080,"primary":false}]');

describe('parseScreens', () => {
  it('lê a lista do PowerShell e descarta lixo', () => {
    expect(SCREENS).toHaveLength(2);
    expect(parseScreens('erro')).toEqual([]);
    expect(parseScreens('[{"x":0,"y":0,"w":0,"h":0,"primary":true}]')).toEqual([]);
  });
});

describe('otherScreens', () => {
  it('ocupa os monitores onde a janela principal não está', () => {
    expect(otherScreens(SCREENS, { x: 960, y: 540 })).toEqual([SCREENS[1]]);
    // JARVIS aberto no monitor de baixo: o painel vai para o de cima
    expect(otherScreens(SCREENS, { x: 960, y: 1600 })).toEqual([SCREENS[0]]);
  });

  it('sem saber onde está a janela, deixa o principal livre', () => {
    expect(otherScreens(SCREENS, null)).toEqual([SCREENS[1]]);
    expect(otherScreens([SCREENS[0]], null)).toEqual([]);
  });
});

describe('scripts', () => {
  it('posiciona a janela da tela certa no monitor certo e põe em tela cheia', () => {
    const script = placeScript(2, SCREENS[1]);
    expect(script).toContain(`Find('${SCREEN_TITLE} 2')`);
    expect(script).toContain('SetWindowPos($h, [IntPtr]::Zero, 0, 1080, 1920, 1080');
    expect(script).toContain('keybd_event(0x7A');
  });

  it('fecha só as janelas extras', () => {
    expect(RELEASE_SCRIPT).toContain(`Find('${SCREEN_TITLE}')`);
    expect(RELEASE_SCRIPT).toContain('0x0010');
  });
});

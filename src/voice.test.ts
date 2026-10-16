import { describe, expect, it } from 'vitest';
import { greeting } from './lines';
import { parseCommand, parseForgetGesture, parseLearnGesture, recognitionErrorMessage, scoreVoice } from './voice';

describe('parseCommand', () => {
  it.each([
    ['status', 'status'],
    ['relatório', 'status'],
    ['como está o meu PC?', 'status'],
    ['quais projetos estão rodando', 'projects'],
    ['que horas são?', 'time'],
    ['que dia é hoje', 'date'],
    ['como está o tempo hoje?', 'weather'],
    ['vai chover?', 'weather'],
    ['preciso de guarda-chuva?', 'weather'],
    ['quais são meus lembretes', 'reminders'],
    ['quanto tempo falta no timer?', 'reminders'],
    ['cancela o timer', 'cancelTimer'],
    ['para o alarme', 'cancelTimer'],
    ['o que é isso?', 'look'],
    ['o que eu estou segurando', 'look'],
    ['o que você está vendo', 'look'],
    ['como eu estou?', 'mood'],
    ['qual é o meu humor', 'mood'],
    ['eu pareço cansado?', 'mood'],
    ['assume as telas', 'takeScreens'],
    ['mouse no ar', 'mouseOn'],
    ['liga o mouse', 'mouseOn'],
    ['desliga o mouse no ar', 'mouseOff'],
    ['pode falar', 'speakAgain'],
    ['resumo do dia', 'daySummary'],
    ['como está meu dia?', 'daySummary'],
    ['aumenta a interface', 'uiBigger'],
    ['diminui o hud', 'uiSmaller'],
    ['quais gestos você conhece?', 'gestures'],
    ['modo espera', 'standby'],
    ['domina todas as telas', 'takeScreens'],
    ['abre o painel no outro monitor', 'takeScreens'],
    ['libera as telas', 'releaseScreens'],
    ['fecha as outras telas', 'releaseScreens'],
    ['quem é você', 'who'],
    ['o que eu deveria estar fazendo', 'study'],
    ['olá Jarvis', 'hello'],
    ['silêncio', 'mute'],
    ['voz do filme', 'voiceUk'],
    ['fala em português', 'voiceBr'],
    ['desligar o Claude', 'claudeOff'],
    ['bloquear Claude', 'claudeOff'],
    ['desbloquear o Claude', 'claudeOn'],
    ['ligar o cloud', 'claudeOn'],
    ['ativar inteligência artificial', 'claudeOn'],
    ['cadastrar meu rosto', 'enrollFace'],
    ['Jarvis, aprende o meu rosto', 'enrollFace'],
    ['apagar o meu rosto', 'forgetFace'],
    ['esquece meu rosto', 'forgetFace'],
  ])('"%s" → %s', (text, expected) => {
    expect(parseCommand(text)).toBe(expected);
  });

  it('devolve null para frases sem comando (inclusive as antigas do reator)', () => {
    expect(parseCommand('qual é a capital da França')).toBeNull();
    expect(parseCommand('modo energia')).toBeNull();
    expect(parseCommand('explodir')).toBeNull();
    // Conversa com "como estou" no meio não é pergunta de humor
    expect(parseCommand('como estou indo nos estudos de matemática')).not.toBe('mood');
  });
});

describe('gestos aprendidos por voz', () => {
  it.each([
    ['aprende este gesto para abrir o Spotify', 'abrir o Spotify'],
    ['Jarvis, grava um gesto novo pra tocar Back in Black.', 'tocar Back in Black'],
    ['ensina esse gesto como que horas são', 'que horas são'],
  ])('"%s" → "%s"', (text, phrase) => {
    expect(parseLearnGesture(text)).toBe(phrase);
  });

  it('esquecer', () => {
    expect(parseForgetGesture('esquece o gesto do Spotify')).toBe('spotify');
    expect(parseForgetGesture('apaga todos os gestos')).toBe('*');
    expect(parseForgetGesture('esquece meu rosto')).toBeNull();
    expect(parseLearnGesture('abre o Spotify')).toBeNull();
  });
});

describe('greeting', () => {
  it('cumprimenta conforme a hora', () => {
    expect(greeting(new Date(2026, 9, 11, 8))).toBe('Bom dia');
    expect(greeting(new Date(2026, 9, 11, 14))).toBe('Boa tarde');
    expect(greeting(new Date(2026, 9, 11, 21))).toBe('Boa noite');
    expect(greeting(new Date(2026, 9, 11, 2))).toBe('Boa noite');
    expect(greeting(new Date(2026, 9, 11, 21), 'uk')).toBe('Good evening');
  });
});

describe('scoreVoice', () => {
  it('prefere voz masculina e natural no idioma certo', () => {
    const antonio = { lang: 'pt-BR', name: 'Microsoft Antonio Online (Natural) - Portuguese (Brazil)' };
    const maria = { lang: 'pt-BR', name: 'Microsoft Maria - Portuguese (Brazil)' };
    const ryan = { lang: 'en-GB', name: 'Microsoft Ryan Online (Natural) - English (United Kingdom)' };
    expect(scoreVoice(antonio, 'br')).toBeGreaterThan(scoreVoice(maria, 'br'));
    expect(scoreVoice(ryan, 'br')).toBeLessThan(0);
    expect(scoreVoice(ryan, 'uk')).toBeGreaterThan(scoreVoice(antonio, 'uk'));
  });
});

describe('recognitionErrorMessage', () => {
  it('explica os erros que exigem ação do usuário e ignora os passageiros', () => {
    expect(recognitionErrorMessage('not-allowed')).toMatch(/Microfone negado/);
    expect(recognitionErrorMessage('network')).toMatch(/Chrome/);
    expect(recognitionErrorMessage('no-speech')).toBeNull();
    expect(recognitionErrorMessage('aborted')).toBeNull();
  });
});

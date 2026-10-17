import { describe, expect, it } from 'vitest';
import { confirmation, matchWindow, parseFinance, parseIntent, parseMusic, parseNews, parseWindowRequest, type Catalog } from './intents';

const catalog: Catalog = {
  apps: [
    { id: 'spotify', name: 'Spotify', aliases: ['spotify'] },
    { id: 'vscode', name: 'VS Code', aliases: ['vs code', 'vscode', 'editor'] },
    { id: 'explorer', name: 'Explorador', aliases: ['explorador', 'explorador de arquivos', 'arquivos'] },
    { id: 'jarvis', name: 'JARVIS', aliases: ['jarvis'] },
  ],
  projects: [
    { id: 'janus', name: 'janus', aliases: ['janus'] },
    { id: 'portfolio', name: 'Portfolio', aliases: ['portfolio', 'portfólio'] },
  ],
};

describe('parseIntent', () => {
  it.each([
    ['Jarvis, abre o Spotify', 'open', 'spotify'],
    ['abrir o explorador de arquivos', 'open', 'explorer'],
    ['troca para o VS Code', 'focus', 'vscode'],
    ['mostra o spotify', 'focus', 'spotify'],
    ['volta pro Jarvis', 'focus', 'jarvis'],
  ])('"%s" → %s %s', (text, kind, id) => {
    const intent = parseIntent(text, catalog);
    expect(intent?.kind).toBe(kind);
    expect(intent && 'app' in intent ? intent.app.id : null).toBe(id);
  });

  it.each([
    ['rodar o portfólio', 'portfolio'],
    ['Jarvis, inicia o janus', 'janus'],
    ['sobe o portfolio', 'portfolio'],
  ])('"%s" → projeto %s', (text, id) => {
    const intent = parseIntent(text, catalog);
    expect(intent?.kind).toBe('project');
    expect(intent && 'project' in intent ? intent.project.id : null).toBe(id);
  });

  it.each([
    ['mover o VS Code para o outro monitor', 'vscode', 'right'],
    ['manda o Spotify pro monitor da esquerda', 'spotify', 'left'],
    ['joga o jarvis na outra tela', 'jarvis', 'right'],
    ['maximizar o vs code', 'vscode', 'maximize'],
    ['minimiza o spotify', 'spotify', 'minimize'],
  ])('"%s" → janela %s %s', (text, id, op) => {
    expect(parseIntent(text, catalog)).toMatchObject({ kind: 'window', app: { id }, op });
  });

  it('ignora o que não está na lista', () => {
    expect(parseIntent('abre o photoshop', catalog)).toBeNull();
    expect(parseIntent('abre a calculadora', catalog)).toBeNull();
    expect(parseIntent('o spotify é bom', catalog)).toBeNull();
  });
});

describe('janelas quaisquer', () => {
  const windows = [
    { hwnd: 1, process: 'chrome', title: 'J.A.R.V.I.S. HUD' },
    { hwnd: 2, process: 'Code', title: 'main.ts - jarvis-hud - Visual Studio Code' },
    { hwnd: 3, process: 'Discord', title: '#geral | Servidor dos amigos - Discord' },
    { hwnd: 4, process: 'opera', title: 'Catfish - YouTube - Opera' },
  ];

  it.each([
    ['manda o Discord pro outro monitor', { op: 'right', foreground: false }],
    ['maximiza essa janela', { op: 'maximize', foreground: true }],
    ['joga essa tela pra esquerda no outro monitor', { op: 'left', foreground: true }],
    ['traz a janela do YouTube', { op: 'focus', foreground: false }],
  ])('"%s"', (text, expected) => {
    expect(parseWindowRequest(text)).toEqual(expected);
  });

  it('não confunde conversa com pedido de janela', () => {
    expect(parseWindowRequest('vamos mudar de assunto')).toBeNull();
    expect(parseWindowRequest('me mostra o caminho')).toBeNull();
  });

  it.each([
    ['manda o Discord pro outro monitor', 3],
    ['traz a janela do YouTube', 4],
    ['Jarvis, maximiza o Visual Studio', 2],
  ])('"%s" → janela %i', (text, hwnd) => {
    expect(matchWindow(text, windows)?.hwnd).toBe(hwnd);
  });

  it('devolve null quando nenhuma janela bate', () => {
    expect(matchWindow('manda o Photoshop pro outro monitor', windows)).toBeNull();
  });
});

describe('parseMusic', () => {
  it.each([
    ['Jarvis, toca Back in Black', { action: 'play', query: 'back in black' }],
    ['tocar a música Bohemian Rhapsody no Spotify', { action: 'play', query: 'bohemian rhapsody' }],
    ['coloca Legião Urbana', { action: 'play', query: 'legiao urbana' }],
    ['pausa', { action: 'pause' }],
    ['para a música', { action: 'pause' }],
    ['próxima', { action: 'next' }],
    ['pula essa', { action: 'next' }],
    ['volta a música', { action: 'previous' }],
    ['continua a música', { action: 'resume' }],
    ['que música é essa?', { action: 'current' }],
    ['o que está tocando', { action: 'current' }],
    ['volume 30', { action: 'volume', volume: 30 }],
    ['coloca o volume em 70', { action: 'volume', volume: 70 }],
    ['Volume 10 no Spotify', { action: 'volume', volume: 10 }],
    ['toque Amor e Sexo de Hungria com 10% do volume', { action: 'play', query: 'amor e sexo de hungria', volume: 10 }],
    ['toca Back in Black no volume 40', { action: 'play', query: 'back in black', volume: 40 }],
    ['Jarvis de play no Spotify', { action: 'resume' }],
    ['dá play', { action: 'resume' }],
  ])('"%s"', (text, expected) => {
    expect(parseMusic(text)).toEqual(expected);
  });

  it('não confunde com outros comandos', () => {
    expect(parseMusic('que horas são')).toBeNull();
    expect(parseMusic('toca música')).toBeNull();
    expect(parseMusic('timer de 25 minutos')).toBeNull();
  });
});

describe('parseFinance', () => {
  it.each([
    ['como estão minhas finanças?', true],
    ['Jarvis, resumo financeiro', true],
    ['quanto sobrou esse mês', true],
    ['quanto eu gastei?', true],
    ['me dá o resumo do janus', true],
    ['rodar o janus', false],
    ['que horas são', false],
  ])('"%s" → %s', (text, expected) => {
    expect(parseFinance(text)).toBe(expected);
  });
});

describe('confirmation', () => {
  it.each([
    ['sim', 'yes'],
    ['pode, por favor', 'yes'],
    ['Confirmo', 'yes'],
    ['não', 'no'],
    ['cancela', 'no'],
    ['qual é a capital da França', null],
  ])('"%s" → %s', (text, expected) => {
    expect(confirmation(text)).toBe(expected);
  });
});

describe('parseNews', () => {
  it.each([
    ['notícias', { action: 'read' }],
    ['Jarvis, quais são as notícias?', { action: 'read' }],
    ['manchetes do dia', { action: 'read' }],
    ['notícias de tecnologia', { action: 'read', topic: 'tecnologia' }],
    ['notícias sobre a economia', { action: 'read', topic: 'economia' }],
    ['o que está acontecendo', { action: 'read' }],
    ['mais uma', { action: 'more' }],
    ['próxima notícia', { action: 'more' }],
  ])('%s', (text, expected) => {
    expect(parseNews(text)).toEqual(expected);
  });

  it('ignora frases que não são pedido de notícia ou são longas demais', () => {
    expect(parseNews('que horas são')).toBeNull();
    expect(parseNews('me lembra de ler as notícias amanhã de manhã quando eu acordar')).toBeNull();
  });
});

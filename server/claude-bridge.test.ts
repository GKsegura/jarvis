import { describe, expect, it } from 'vitest';
import { buildContext, FINANCE_QUESTION, MemoryStore, parseReminderArg, parseReply, systemPrompt } from './claude-bridge';

describe('parseReply', () => {
  it('separa as ações do texto falado', () => {
    expect(parseReply('Pausando a música, senhor. [acao:pause]')).toEqual({
      reply: 'Pausando a música, senhor.',
      actions: [{ name: 'pause' }],
    });
  });

  it('aceita "ação" com acento, várias tags e ignora ações desconhecidas (inclusive as antigas do reator)', () => {
    expect(parseReply('[ação:next] Pronto. [acao:look] [acao:explode] [acao:formatar_disco]')).toEqual({
      reply: 'Pronto.',
      actions: [{ name: 'next' }, { name: 'look' }],
    });
  });

  it('lê ações com parâmetro e descarta as que precisam de parâmetro e vieram sem', () => {
    expect(parseReply('Com prazer, senhor. [acao:play: Back in Black] [acao:focus:spotify] [acao:run] [acao:timer]')).toEqual({
      reply: 'Com prazer, senhor.',
      actions: [
        { name: 'play', arg: 'Back in Black' },
        { name: 'focus', arg: 'spotify' },
      ],
    });
  });

  it('lê timer, lembrete e memória', () => {
    expect(
      parseReply('Feito. [acao:timer:25] [acao:reminder:2026-10-12T19:00|estudar matemática] [acao:remember:a prova é dia 15]').actions,
    ).toEqual([
      { name: 'timer', arg: '25' },
      { name: 'reminder', arg: '2026-10-12T19:00|estudar matemática' },
      { name: 'remember', arg: 'a prova é dia 15' },
    ]);
  });

  it('remove markdown que não faz sentido falado', () => {
    expect(parseReply('A **determinante** é `ad - bc`.').reply).toBe('A determinante é ad - bc.');
  });
});

describe('systemPrompt', () => {
  it('lista só os IDs de apps e projetos da configuração, sem o reator', () => {
    const prompt = systemPrompt(['spotify', 'vscode'], ['janus']);
    expect(prompt).toContain('IDs de aplicativos: spotify, vscode.');
    expect(prompt).toContain('IDs de projetos: janus.');
    expect(prompt).not.toMatch(/reator|energia|holográfico/i);
  });

  it('inclui a memória', () => {
    expect(systemPrompt([], [], ['a prova é dia 15'])).toContain('"a prova é dia 15"');
  });
});

describe('buildContext', () => {
  it('monta o contexto com os dados reais e o que o navegador mandou', () => {
    const text = buildContext({
      now: new Date(2026, 9, 12, 14, 5),
      system: { cpu: 23, cores: 8, memTotal: 16 * 1024 ** 3, memFree: 6 * 1024 ** 3, disk: { total: 100, free: 30 }, uptimeSec: 3600, battery: null, charging: null, online: true, netDown: 0, netUp: 0 },
      weather: { place: 'São Paulo', temp: 24.4, feels: 25, humidity: 60, wind: 8, code: 2, isDay: true, max: 28, min: 17, rainChance: 40, hours: [] },
      projects: [
        { id: 'janus', name: 'janus', running: true },
        { id: 'cronos', name: 'CRONOS', running: false },
      ],
      reminders: [{ id: 'a', text: 'Estudar', dueAt: new Date(2026, 9, 12, 19).getTime(), kind: 'reminder', done: false, createdAt: 0 }],
      client: { music: 'Back in Black — AC/DC', object: 'garrafa', visitor: true, mood: 'feliz (80% de confiança)' },
    });
    expect(text).toContain('CPU 23%');
    expect(text).toContain('memória 63% de 16.0 GB');
    expect(text).toContain('disco C: 70% usado');
    expect(text).toContain('24°C, parcialmente nublado');
    expect(text).toContain('Projetos no ar: janus. Desligados: CRONOS');
    expect(text).toContain('Estudar');
    expect(text).toContain('Back in Black');
    expect(text).toContain('garrafa');
    expect(text).toContain('outra pessoa');
    expect(text).toContain('Expressão do senhor enquanto falava (lida pela câmera): feliz');
  });

  it('funciona sem nada além da hora', () => {
    expect(buildContext({ now: new Date(2026, 9, 12, 14, 5) })).toMatch(/^Contexto agora:\n- Data e hora: .*14:05$/);
  });
});

describe('MemoryStore', () => {
  it('lembra sem repetir e esquece por trecho', () => {
    const m = new MemoryStore(null);
    expect(m.remember('A prova da Unesp é dia 15')).toBe(true);
    expect(m.remember('a prova da unesp é dia 15')).toBe(false);
    m.remember('Gosta de AC/DC');
    expect(m.forget('prova')).toBe(1);
    expect(m.facts).toEqual(['Gosta de AC/DC']);
  });
});

describe('parseReminderArg', () => {
  it('lê data local e texto', () => {
    expect(parseReminderArg('2026-10-12T19:00|estudar')).toEqual({ dueAt: new Date(2026, 9, 12, 19, 0).getTime(), text: 'estudar' });
    expect(parseReminderArg('amanhã|estudar')).toBeNull();
    expect(parseReminderArg('2026-10-12T19:00')).toBeNull();
  });
});

describe('FINANCE_QUESTION', () => {
  it('reconhece perguntas sobre dinheiro', () => {
    expect(FINANCE_QUESTION.test('quanto eu gastei com mercado?')).toBe(true);
    expect(FINANCE_QUESTION.test('quanto sobrou esse mês')).toBe(true);
    expect(FINANCE_QUESTION.test('o que é uma matriz?')).toBe(false);
  });
});

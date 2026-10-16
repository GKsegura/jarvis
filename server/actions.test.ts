import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { focusScript, parseConfig, parseTasklist, portOpen, projectSpawn, runAction, windowScript } from './actions';

const realConfig = parseConfig(JSON.parse(readFileSync(new URL('../jarvis.config.example.json', import.meta.url), 'utf8')));

describe('jarvis.config.example.json', () => {
  it('é válido e tem os apps e projetos esperados', () => {
    expect(realConfig.apps.map((a) => a.id)).toEqual(expect.arrayContaining(['spotify', 'vscode', 'chrome', 'jarvis']));
    expect(realConfig.projects.map((p) => p.id)).toEqual(expect.arrayContaining(['meu-projeto']));
  });

  it('descarta entradas malformadas', () => {
    const config = parseConfig({
      apps: [{ id: 'ok', name: 'Ok', aliases: ['ok'], open: { exe: 'x.exe' } }, { id: 'SEM ID VÁLIDO', name: 'x', aliases: [] }],
      projects: [{ id: 'p', name: 'P', aliases: ['p'], cwd: '.', command: [] }],
    });
    expect(config.apps.map((a) => a.id)).toEqual(['ok']);
    expect(config.projects).toEqual([]);
  });
});

describe('projectSpawn', () => {
  it('abre uma janela de terminal própria, na pasta do projeto, com o comando fixo', () => {
    const portfolio = realConfig.projects.find((p) => p.id === 'meu-projeto')!;
    const { file, args } = projectSpawn(portfolio, 'C:/x/jarvis-hud');
    expect(file).toBe('cmd.exe');
    expect(args.slice(0, 4)).toEqual(['/d', '/c', 'start', 'JARVIS - Meu Projeto']);
    expect(args[5].replace(/\\/g, '/')).toBe('C:/x/meu-projeto');
    expect(args.slice(6)).toEqual(['cmd', '/k', 'npm', 'run', 'dev']);
  });
});

describe('focusScript', () => {
  it('escapa aspas simples e aplica os filtros de título', () => {
    const script = focusScript({ process: "o'brien", titleIncludes: 'J.A.R.V.I.S.', titleExcludes: "x'y" });
    expect(script).toContain("Get-Process -Name 'o''brien'");
    expect(script).toContain("-like '*J.A.R.V.I.S.*'");
    expect(script).toContain("-notlike '*x''y*'");
  });
});

describe('windowScript', () => {
  it('manda a janela ao monitor ao lado com Win+Shift+seta, soltando as teclas na ordem inversa', () => {
    const script = windowScript({ process: 'Code' }, 'right');
    const down = script.indexOf('keybd_event(0x5B, 0, 0');
    const arrowDown = script.indexOf('keybd_event(0x27, 0, 0');
    const winUp = script.indexOf('keybd_event(0x5B, 0, 2');
    expect(down).toBeGreaterThan(-1);
    expect(arrowDown).toBeGreaterThan(down);
    expect(winUp).toBeGreaterThan(arrowDown);
    expect(windowScript({ process: 'Code' }, 'left')).toContain('keybd_event(0x25, 0, 0');
  });

  it('maximiza e minimiza com ShowWindow', () => {
    expect(windowScript({ process: 'Code' }, 'maximize')).toContain('ShowWindow($h, 3)');
    expect(windowScript({ process: 'Code' }, 'minimize')).toContain('ShowWindow($h, 6)');
    expect(windowScript({ process: 'Code' }, 'focus')).not.toContain('0x5B');
  });
});

describe('runAction', () => {
  it('recusa ids que não estão na lista', async () => {
    await expect(runAction(realConfig, '.', 'project', 'rm-rf')).rejects.toThrow(/desconhecido/);
    await expect(runAction(realConfig, '.', 'open', 'calc')).rejects.toThrow(/desconhecido/);
  });
});

describe('projetos no ar', () => {
  it('todo projeto da configuração tem um jeito de ser verificado', () => {
    for (const p of realConfig.projects) expect(p.check, p.id).toBeDefined();
  });

  it('descarta projetos com verificação malformada', () => {
    const base = { name: 'P', aliases: ['p'], cwd: '.', command: ['x'] };
    const config = parseConfig({
      projects: [
        { ...base, id: 'porta', check: { port: 8082 } },
        { ...base, id: 'processo', check: { process: 'electron', titleIncludes: 'Hydra' } },
        { ...base, id: 'porta-ruim', check: { port: 99999 } },
        { ...base, id: 'processo-ruim', check: { process: 'a b; rm' } },
      ],
    });
    expect(config.projects.map((p) => p.id)).toEqual(['porta', 'processo']);
  });

  it('lê os títulos das janelas do tasklist, ignorando "N/A" e a mensagem de "nenhuma tarefa"', () => {
    const out = [
      '"electron.exe","1","Console","1","90.000 K","Running","PC\Jose","0:00:01","Hydra"',
      '"electron.exe","2","Console","1","20.000 K","Running","PC\Jose","0:00:00","N/A"',
      'INFORMAÇÕES: nenhuma tarefa em execução',
    ].join('\r\n');
    expect(parseTasklist(out)).toEqual(['Hydra']);
  });

  it('vê se uma porta está aberta', async () => {
    const { createServer } = await import('node:net');
    const server = createServer().listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const { port } = server.address() as { port: number };
    expect(await portOpen(port)).toBe(true);
    server.close();
    await new Promise((r) => server.once('close', r));
    expect(await portOpen(port)).toBe(false);
  });
});

describe('atalhos de mão no config', () => {
  it('o jarvis.config.example.json tem o menu na mão e as poses válidos', () => {
    expect(realConfig.handMenu.length).toBeGreaterThanOrEqual(4);
    expect(realConfig.poses.rock?.action).toMatch(/^play:/);
    // Os apps do menu existem na lista de apps
    const ids = new Set(realConfig.apps.map((a) => a.id));
    for (const item of realConfig.handMenu) {
      const m = item.action.match(/^(?:open|focus):(.+)$/);
      if (m) expect(ids.has(m[1]), item.action).toBe(true);
    }
  });
});

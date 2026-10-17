import { describe, expect, it } from 'vitest';
import { AlertEngine, type AlertInput } from './alerts';
import type { SystemInfo, WeatherInfo } from './info';

const MIN = 60_000;
const sys = (o: Partial<SystemInfo> = {}): SystemInfo => ({
  cpu: 10,
  cores: 8,
  memTotal: 16e9,
  memFree: 8e9,
  disk: null,
  uptimeSec: 100,
  battery: 80,
  charging: false,
  online: true,
  netDown: 0,
  netUp: 0,
  ...o,
});
const weather = (rainChance: number): WeatherInfo => ({ place: 'X', temp: 20, feels: 20, humidity: 50, wind: 5, code: 3, isDay: true, max: 25, min: 15, rainChance, hours: [] });
const input = (now: number, o: Partial<AlertInput> = {}): AlertInput => ({ system: sys(), projects: null, weather: null, now, ...o });

describe('bateria', () => {
  it('avisa baixa e crítica, mas só descarregando, e respeita o tempo de espera', () => {
    const e = new AlertEngine();
    expect(e.check(input(0, { system: sys({ battery: 50 }) }))).toEqual([]);
    expect(e.check(input(0, { system: sys({ battery: 18 }) })).map((a) => a.id)).toEqual(['battery-low']);
    expect(e.check(input(5 * MIN, { system: sys({ battery: 17 }) }))).toEqual([]);
    expect(e.check(input(31 * MIN, { system: sys({ battery: 15 }) })).map((a) => a.id)).toEqual(['battery-low']);
    expect(e.check(input(32 * MIN, { system: sys({ battery: 8 }) })).map((a) => a.id)).toEqual(['battery-critical']);
  });

  it('não avisa carregando nem em PC sem bateria', () => {
    const e = new AlertEngine();
    expect(e.check(input(0, { system: sys({ battery: 5, charging: true }) }))).toEqual([]);
    expect(e.check(input(0, { system: sys({ battery: null, charging: null }) }))).toEqual([]);
  });
});

describe('cpu', () => {
  it('só avisa se ficar alta por um minuto inteiro', () => {
    const e = new AlertEngine();
    expect(e.check(input(0, { system: sys({ cpu: 95 }) }))).toEqual([]);
    expect(e.check(input(30_000, { system: sys({ cpu: 96 }) }))).toEqual([]);
    expect(e.check(input(61_000, { system: sys({ cpu: 94 }) })).map((a) => a.id)).toEqual(['cpu-high']);
    expect(e.check(input(90_000, { system: sys({ cpu: 94 }) }))).toEqual([]);
  });

  it('uma queda zera a contagem', () => {
    const e = new AlertEngine();
    e.check(input(0, { system: sys({ cpu: 95 }) }));
    e.check(input(40_000, { system: sys({ cpu: 20 }) }));
    expect(e.check(input(70_000, { system: sys({ cpu: 95 }) }))).toEqual([]);
  });
});

describe('projetos', () => {
  it('avisa quando um projeto que estava no ar cai, não quando nunca subiu', () => {
    const e = new AlertEngine();
    const p = (running: boolean | null) => [{ id: 'a', name: 'Alfa', running }, { id: 'b', name: 'Beta', running: false }];
    expect(e.check(input(0, { projects: p(false) }))).toEqual([]);
    expect(e.check(input(MIN, { projects: p(true) }))).toEqual([]);
    const down = e.check(input(2 * MIN, { projects: p(false) }));
    expect(down.map((a) => a.id)).toEqual(['project-down:a']);
    expect(down[0].text).toContain('Alfa');
    expect(e.check(input(3 * MIN, { projects: p(false) }))).toEqual([]);
  });

  it('ignora projetos sem verificação', () => {
    const e = new AlertEngine();
    e.check(input(0, { projects: [{ id: 'a', name: 'A', running: null }] }));
    expect(e.check(input(MIN, { projects: [{ id: 'a', name: 'A', running: null }] }))).toEqual([]);
  });
});

describe('chuva', () => {
  it('avisa uma vez com chance alta, e não com chance baixa', () => {
    const e = new AlertEngine();
    expect(e.check(input(0, { weather: weather(40) }))).toEqual([]);
    expect(e.check(input(MIN, { weather: weather(80) })).map((a) => a.id)).toEqual(['rain-soon']);
    expect(e.check(input(2 * MIN, { weather: weather(80) }))).toEqual([]);
    expect(e.check(input(7 * 60 * MIN, { weather: weather(80) }))).toHaveLength(1);
  });

  it('fala em inglês no estilo uk', () => {
    const e = new AlertEngine(() => 'uk');
    expect(e.check(input(0, { weather: weather(90) }))[0].text).toContain('chance of rain');
  });
});

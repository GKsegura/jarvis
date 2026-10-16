import { describe, expect, it } from 'vitest';
import { cpuPercent, parseExtras, systemSnapshot } from './system';

describe('cpuPercent', () => {
  it('mede o uso entre duas leituras', () => {
    expect(cpuPercent({ idle: 100, total: 200 }, { idle: 150, total: 400 })).toBe(75);
    expect(cpuPercent({ idle: 100, total: 200 }, { idle: 100, total: 200 })).toBe(0);
  });
});

describe('parseExtras', () => {
  it('lê bateria e rede do PowerShell', () => {
    expect(parseExtras('{"battery":80,"charging":true,"down":1024,"up":512,"online":true}')).toEqual({
      battery: 80,
      charging: true,
      down: 1024,
      up: 512,
      online: true,
    });
  });

  it('PC sem bateria e saída quebrada', () => {
    expect(parseExtras('{"battery":null,"charging":null,"down":0,"up":0,"online":false}')?.battery).toBeNull();
    expect(parseExtras('erro')).toBeNull();
  });
});

describe('systemSnapshot', () => {
  it('devolve números reais do PC', async () => {
    const s = await systemSnapshot();
    expect(s.cores).toBeGreaterThan(0);
    expect(s.memTotal).toBeGreaterThan(s.memFree);
    expect(s.cpu).toBeGreaterThanOrEqual(0);
    expect(s.cpu).toBeLessThanOrEqual(100);
  });
});

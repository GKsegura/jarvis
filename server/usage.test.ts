import { describe, expect, it } from 'vitest';
import { UsageStore } from './usage';

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();

describe('UsageStore', () => {
  it('registra eventos e ignora lixo e repetição imediata', () => {
    const s = new UsageStore(null);
    expect(s.record('app', 'vscode', at(12, 9))).toBe(true);
    expect(s.record('app', 'vscode', at(12, 9, 0) + 30_000)).toBe(false);
    expect(s.record('app', 'vscode', at(12, 9, 5))).toBe(true);
    expect(s.record('shell', 'rm', at(12, 9))).toBe(false);
    expect(s.record('app', '   ', at(12, 9))).toBe(false);
    expect(s.record('app', 42, at(12, 9))).toBe(false);
  });

  it('só guarda o nome curto, nunca uma frase inteira', () => {
    const s = new UsageStore(null);
    s.record('music', `${'a'.repeat(200)}`, at(12, 9));
    expect(s.candidates(at(13, 9))).toEqual([]);
    for (const d of [12, 13, 14]) s.record('music', 'b'.repeat(200), at(d, 9));
    expect(s.candidates(at(15, 9, 5))[0].key).toHaveLength(60);
  });

  it('percebe o hábito, pergunta, e depois de aceito roda uma vez por dia', () => {
    const s = new UsageStore(null);
    for (const d of [12, 13, 14]) s.record('app', 'vscode', at(d, 9, 5));
    const first = s.tick(at(15, 8, 55));
    expect(first.suggest).toMatchObject({ kind: 'app', key: 'vscode', minute: 545 });
    expect(first.run).toEqual([]);

    const routine = s.answer('app', 'vscode', 545, true)!;
    expect(routine.state).toBe('accepted');
    expect(s.tick(at(15, 9, 0)).suggest).toBeNull();
    expect(s.tick(at(15, 9, 6)).run.map((r) => r.id)).toEqual(['app:vscode']);
    s.markRan('app:vscode', at(15, 9, 6));
    expect(s.tick(at(15, 9, 10)).run).toEqual([]);
    expect(s.tick(at(16, 9, 6)).run).toHaveLength(1);
  });

  it('não volta a perguntar depois de um "não"', () => {
    const s = new UsageStore(null);
    for (const d of [12, 13, 14]) s.record('app', 'vscode', at(d, 9));
    s.answer('app', 'vscode', 540, false);
    expect(s.tick(at(15, 9, 0)).suggest).toBeNull();
    expect(s.tick(at(15, 9, 0)).run).toEqual([]);
  });

  it('esquece uma rotina (ela pode ser sugerida de novo) ou tudo', () => {
    const s = new UsageStore(null);
    for (const d of [12, 13, 14]) s.record('app', 'vscode', at(d, 9));
    s.answer('app', 'vscode', 540, true);
    expect(s.forget('app:vscode')).toBe(1);
    expect(s.tick(at(15, 9, 0)).suggest).not.toBeNull();
    s.answer('app', 'vscode', 540, true);
    expect(s.forget()).toBe(1);
    expect(s.list()).toEqual([]);
    expect(s.candidates(at(15, 9))).toEqual([]);
  });

  it('rejeita respostas malformadas', () => {
    const s = new UsageStore(null);
    expect(s.answer('shell', 'x', 540, true)).toBeNull();
    expect(s.answer('app', 'x', 99999, true)).toBeNull();
    expect(s.answer('app', 7, 540, true)).toBeNull();
  });
});

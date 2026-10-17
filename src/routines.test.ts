import { describe, expect, it } from 'vitest';
import {
  AUTO_COMMANDS,
  clock,
  detectCandidates,
  dueRoutines,
  isRoutine,
  minuteOfDay,
  nextSuggestion,
  routineId,
  routineLabel,
  type Routine,
  type UsageEvent,
} from './routines';

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
const ev = (ts: number, key = 'vscode', kind: UsageEvent['kind'] = 'app'): UsageEvent => ({ ts, kind, key });
const NOW = at(15, 9, 5);

describe('detectCandidates', () => {
  it('acha o que se repete em dias diferentes por volta da mesma hora', () => {
    const events = [ev(at(12, 9, 0)), ev(at(13, 9, 20)), ev(at(14, 8, 50))];
    expect(detectCandidates(events, NOW)).toEqual([{ kind: 'app', key: 'vscode', minute: 9 * 60, days: 3 }]);
  });

  it('não conta repetição no mesmo dia nem poucos dias', () => {
    expect(detectCandidates([ev(at(12, 9)), ev(at(12, 9, 10)), ev(at(12, 9, 20)), ev(at(13, 9))], NOW)).toEqual([]);
  });

  it('ignora quando os horários são muito diferentes', () => {
    expect(detectCandidates([ev(at(12, 7)), ev(at(13, 14)), ev(at(14, 21))], NOW)).toEqual([]);
  });

  it('ignora o que é mais velho que a janela e o que está no futuro', () => {
    const old = [ev(at(1, 9)), ev(at(2, 9)), ev(at(3, 9))];
    expect(detectCandidates(old, NOW)).toEqual([]);
    expect(detectCandidates([ev(at(16, 9)), ev(at(17, 9)), ev(at(18, 9))], NOW)).toEqual([]);
  });

  it('separa coisas diferentes e ordena pelas mais frequentes', () => {
    const events = [
      ...[11, 12, 13, 14].map((d) => ev(at(d, 9), 'vscode')),
      ...[12, 13, 14].map((d) => ev(at(d, 9), 'Legião Urbana', 'music')),
    ];
    expect(detectCandidates(events, NOW).map((c) => c.key)).toEqual(['vscode', 'Legião Urbana']);
  });
});

describe('nextSuggestion', () => {
  const candidate = { kind: 'app' as const, key: 'vscode', minute: 9 * 60, days: 4 };

  it('sugere perto do horário típico', () => {
    expect(nextSuggestion([candidate], [], at(15, 8, 50))).toBe(candidate);
    expect(nextSuggestion([candidate], [], at(15, 9, 40))).toBe(candidate);
  });

  it('não sugere cedo demais, tarde demais ou o que já foi respondido', () => {
    expect(nextSuggestion([candidate], [], at(15, 8, 0))).toBeNull();
    expect(nextSuggestion([candidate], [], at(15, 11, 0))).toBeNull();
    const declined: Routine = { id: routineId('app', 'vscode'), kind: 'app', key: 'vscode', minute: 540, state: 'declined' };
    expect(nextSuggestion([candidate], [declined], at(15, 9, 5))).toBeNull();
  });
});

describe('dueRoutines', () => {
  const accepted: Routine = { id: 'app:vscode', kind: 'app', key: 'vscode', minute: 9 * 60, state: 'accepted' };

  it('roda na hora, uma vez por dia, e não tarde demais', () => {
    expect(dueRoutines([accepted], at(15, 9, 0))).toHaveLength(1);
    expect(dueRoutines([accepted], at(15, 9, 25))).toHaveLength(1);
    expect(dueRoutines([accepted], at(15, 8, 59))).toHaveLength(0);
    expect(dueRoutines([accepted], at(15, 10, 0))).toHaveLength(0);
    expect(dueRoutines([{ ...accepted, lastRunDay: new Date(at(15, 9)).toDateString() }], at(15, 9, 10))).toHaveLength(0);
  });

  it('só roda as aceitas', () => {
    expect(dueRoutines([{ ...accepted, state: 'declined' }], at(15, 9, 5))).toHaveLength(0);
  });
});

describe('textos e validação', () => {
  it('formata hora e descreve a rotina', () => {
    expect(clock(9 * 60 + 5)).toBe('09:05');
    expect(minuteOfDay(at(15, 7, 30))).toBe(450);
    expect(routineLabel('app', 'vscode', 'VS Code')).toBe('abrir o VS Code');
    expect(routineLabel('music', 'Legião Urbana')).toBe('tocar Legião Urbana');
    expect(routineLabel('command', 'daySummary')).toBe('pedir o resumo do dia');
  });

  it('só comandos de informação rodam sozinhos', () => {
    expect(AUTO_COMMANDS.has('daySummary')).toBe(true);
    expect(AUTO_COMMANDS.has('mouseOn')).toBe(false);
  });

  it('rejeita rotina malformada vinda do arquivo', () => {
    expect(isRoutine({ id: 'a', kind: 'app', key: 'x', minute: 540, state: 'accepted' })).toBe(true);
    expect(isRoutine({ id: 'a', kind: 'shell', key: 'x', minute: 540, state: 'accepted' })).toBe(false);
    expect(isRoutine({ id: 'a', kind: 'app', key: 'x', minute: 9999, state: 'accepted' })).toBe(false);
    expect(isRoutine(null)).toBe(false);
  });
});

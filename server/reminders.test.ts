import { describe, expect, it } from 'vitest';
import { ReminderStore } from './reminders';

describe('ReminderStore', () => {
  const now = 1_800_000_000_000;

  it('cria, lista em ordem, conclui e cancela', () => {
    const store = new ReminderStore(null);
    const late = store.add({ text: 'Estudar', dueAt: now + 3_600_000, kind: 'reminder' }, now);
    const soon = store.add({ text: 'Timer', dueAt: now + 60_000, kind: 'timer' }, now);
    expect(store.list(now).map((r) => r.id)).toEqual([soon.id, late.id]);
    expect(store.update(soon.id, 'done')).toBe(true);
    expect(store.pending(now).map((r) => r.id)).toEqual([late.id]);
    expect(store.update(late.id, 'cancel')).toBe(true);
    expect(store.list(now).map((r) => r.id)).toEqual([soon.id]);
    expect(store.update('nao-existe', 'done')).toBe(false);
  });

  it('recusa texto vazio e horários absurdos', () => {
    const store = new ReminderStore(null);
    expect(() => store.add({ text: '  ', dueAt: now + 1000, kind: 'reminder' }, now)).toThrow();
    expect(() => store.add({ text: 'x', dueAt: now - 3_600_000, kind: 'reminder' }, now)).toThrow();
    expect(() => store.add({ text: 'x', dueAt: 'amanhã', kind: 'reminder' }, now)).toThrow();
  });

  it('esquece os concluídos depois de um dia', () => {
    const store = new ReminderStore(null);
    const r = store.add({ text: 'x', dueAt: now + 1000, kind: 'timer' }, now);
    store.update(r.id, 'done');
    expect(store.list(now + 2 * 86_400_000)).toEqual([]);
  });
});

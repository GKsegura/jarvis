import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pollAdaptive, pollSlowdown } from './poll';

describe('pollSlowdown', () => {
  const base = { standby: false, away: false, hidden: false };
  it('é 1 no uso normal e aumenta em espera, ausente ou oculto', () => {
    expect(pollSlowdown(base)).toBe(1);
    expect(pollSlowdown({ ...base, standby: true })).toBe(3);
    expect(pollSlowdown({ ...base, away: true })).toBe(4);
    expect(pollSlowdown({ ...base, hidden: true })).toBe(4);
  });
});

describe('pollAdaptive', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('chama de imediato e repete no intervalo', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    pollAdaptive(fn, 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('multiplica o intervalo pela lentidão', async () => {
    const fn = vi.fn().mockResolvedValue(undefined);
    pollAdaptive(fn, 1000, () => 3);
    await vi.advanceTimersByTimeAsync(0);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2900);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('continua repetindo mesmo se a chamada falhar', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('x'));
    pollAdaptive(() => fn().catch(() => null), 500);
    await vi.advanceTimersByTimeAsync(1600);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(3);
  });
});

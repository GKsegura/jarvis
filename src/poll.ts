/**
 * Repete `fn` a cada `everyMs`, mas multiplica o intervalo por `slowdown()` (1 = normal).
 * Em espera, ausente ou com a janela oculta, o JARVIS chama o servidor bem menos.
 */
export function pollAdaptive(fn: () => Promise<unknown>, everyMs: number, slowdown: () => number = () => 1): void {
  const tick = async () => {
    try {
      await fn();
    } finally {
      setTimeout(() => void tick(), everyMs * Math.max(1, slowdown()));
    }
  };
  void tick();
}

/** Fator de lentidão do polling conforme o que está acontecendo. */
export function pollSlowdown(state: { standby: boolean; away: boolean; hidden: boolean }): number {
  if (state.hidden || state.away) return 4;
  if (state.standby) return 3;
  return 1;
}

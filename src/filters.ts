/**
 * Filtro One Euro (Casiez et al., 2012): suaviza bastante quando o ponto está quase parado
 * (tira o tremor) e quase nada quando ele se move rápido (não deixa atraso).
 */
export class OneEuroFilter {
  private x: number | null = null;
  private dx = 0;
  private lastTime = 0;

  /**
   * @param minCutoff frequência de corte (Hz) com o ponto parado: menor = mais suave
   * @param beta quanto a velocidade aumenta o corte: maior = menos atraso em movimentos rápidos
   */
  constructor(
    private readonly minCutoff = 1,
    private readonly beta = 0,
    private readonly dCutoff = 1,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  /** `time` em milissegundos. */
  filter(value: number, time: number): number {
    if (this.x === null) {
      this.x = value;
      this.lastTime = time;
      return value;
    }
    const dt = Math.max((time - this.lastTime) / 1000, 1e-3);
    this.lastTime = time;
    const rawDx = (value - this.x) / dt;
    this.dx += OneEuroFilter.alpha(this.dCutoff, dt) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += OneEuroFilter.alpha(cutoff, dt) * (value - this.x);
    return this.x;
  }
}

export interface Point3 {
  x: number;
  y: number;
  z?: number;
}

/** Um filtro One Euro por coordenada de cada ponto (os 21 pontos da mão). */
export class PointsFilter {
  private filters: OneEuroFilter[] = [];

  constructor(
    private readonly minCutoff: number,
    private readonly beta: number,
  ) {}

  filter<T extends Point3>(points: T[], time: number): Point3[] {
    if (this.filters.length !== points.length * 3) {
      this.filters = Array.from({ length: points.length * 3 }, () => new OneEuroFilter(this.minCutoff, this.beta));
    }
    return points.map((p, i) => ({
      x: this.filters[i * 3].filter(p.x, time),
      y: this.filters[i * 3 + 1].filter(p.y, time),
      z: this.filters[i * 3 + 2].filter(p.z ?? 0, time),
    }));
  }
}

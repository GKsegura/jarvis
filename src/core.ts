/** O que o JARVIS está fazendo agora; o núcleo no centro da tela muda de cor e de ritmo com isso. */
export type CoreState = 'idle' | 'standby' | 'listening' | 'hearing' | 'thinking' | 'speaking';

export const CORE_LABEL: Record<CoreState, string> = {
  idle: 'MICROFONE DESLIGADO',
  standby: 'EM ESPERA',
  listening: 'DIGA "JARVIS"',
  hearing: 'OUVINDO',
  thinking: 'PROCESSANDO',
  speaking: 'FALANDO',
};

const COLOR: Record<CoreState, [number, number, number]> = {
  idle: [77, 216, 255],
  standby: [60, 120, 150],
  listening: [77, 216, 255],
  hearing: [120, 230, 255],
  thinking: [180, 140, 255],
  speaking: [200, 245, 255],
};

const BARS = 72;

export interface CoreFrame {
  x: number;
  y: number;
  /** Raio do círculo interno, em px. */
  r: number;
  state: CoreState;
  /** Volume (0..1): do microfone ao ouvir, da voz do JARVIS ao falar. */
  level: number;
  time: number;
}

/**
 * Núcleo de voz: anéis finos, arcos girando devagar e um anel de barras que acompanha o som.
 * Tudo em Canvas 2D, sem 3D.
 */
export class VoiceCore {
  /** Volume suavizado de cada barra (sobe rápido, desce devagar). */
  private readonly bars = new Float32Array(BARS);
  private level = 0;
  private spin = 0;
  private lastTime = 0;
  /** Cor atual, que muda aos poucos entre os estados. */
  private color: [number, number, number] = [...COLOR.idle];

  draw(ctx: CanvasRenderingContext2D, f: CoreFrame): void {
    const dt = this.lastTime ? Math.min(0.1, (f.time - this.lastTime) / 1000) : 0;
    this.lastTime = f.time;
    const target = COLOR[f.state];
    for (let i = 0; i < 3; i++) this.color[i] += (target[i] - this.color[i]) * Math.min(1, dt * 4);
    const [cr, cg, cb] = this.color.map(Math.round);
    const rgba = (a: number) => `rgba(${cr}, ${cg}, ${cb}, ${a})`;

    this.level += (f.level - this.level) * Math.min(1, dt * (f.level > this.level ? 18 : 6));
    const speed = f.state === 'thinking' ? 2.6 : f.state === 'speaking' || f.state === 'hearing' ? 0.7 : 0.25;
    this.spin += dt * speed;
    // "Respira" devagar quando está parado
    const breath = 0.5 + 0.5 * Math.sin(f.time * 0.0016);
    const { x, y, r } = f;

    ctx.save();
    ctx.translate(x, y);
    ctx.lineCap = 'round';

    // Brilho de fundo
    const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.9);
    glow.addColorStop(0, rgba(0.1 + this.level * 0.12));
    glow.addColorStop(1, rgba(0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2);
    ctx.fill();

    // Anel externo com marcações (gira devagar)
    ctx.save();
    ctx.rotate(this.spin * 0.15);
    ctx.strokeStyle = rgba(0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const long = i % 10 === 0;
      const r1 = r * 1.62;
      const r2 = r * (long ? 1.72 : 1.66);
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    }
    ctx.stroke();
    ctx.restore();

    // Arcos médios, girando em sentidos opostos
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = this.spin * (i % 2 ? -0.8 : 0.6) + (i * Math.PI * 2) / 3;
      ctx.strokeStyle = rgba(0.55);
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.45, a, a + Math.PI * 0.42);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(0.18);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.45, 0, Math.PI * 2);
    ctx.stroke();

    // Anel de barras: cada barra segue o volume com um pouco de variação, como um espectro
    for (let i = 0; i < BARS; i++) {
      const wobble = 0.55 + 0.45 * Math.sin(i * 1.7 + f.time * 0.009) * Math.sin(i * 0.43 - f.time * 0.0041);
      const want = this.level * Math.abs(wobble);
      this.bars[i] += (want - this.bars[i]) * Math.min(1, dt * (want > this.bars[i] ? 20 : 5));
    }
    ctx.lineWidth = Math.max(1.5, (Math.PI * 2 * r * 1.05) / BARS - 2.2);
    for (let i = 0; i < BARS; i++) {
      const a = (i / BARS) * Math.PI * 2 - Math.PI / 2;
      const len = r * (0.04 + 0.32 * this.bars[i]) + (f.state === 'idle' || f.state === 'standby' ? 0 : breath * r * 0.015);
      const r1 = r * 1.06;
      ctx.strokeStyle = rgba(0.35 + 0.6 * Math.min(1, this.bars[i] * 1.5));
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * (r1 + len), Math.sin(a) * (r1 + len));
      ctx.stroke();
    }

    // Círculo interno
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = rgba(0.75);
    ctx.shadowColor = rgba(0.8);
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.98 + this.level * 0.03), 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(0.22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();

    // Pensando: arco girando rápido por dentro
    if (f.state === 'thinking') {
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgba(0.9);
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.9, this.spin * 2, this.spin * 2 + Math.PI * 0.6);
      ctx.stroke();
    }

    // Nome e estado no centro
    ctx.textAlign = 'center';
    ctx.fillStyle = rgba(0.95);
    ctx.font = `600 ${Math.round(r * 0.2)}px Orbitron, sans-serif`;
    ctx.fillText('J.A.R.V.I.S.', 0, r * 0.02);
    ctx.font = `${Math.max(11, Math.round(r * 0.11))}px "Share Tech Mono", ui-monospace, monospace`;
    ctx.fillStyle = rgba(f.state === 'idle' || f.state === 'standby' ? 0.45 : 0.4 + 0.5 * (f.state === 'listening' ? breath : 1));
    ctx.fillText(CORE_LABEL[f.state], 0, r * 0.24);
    ctx.restore();
  }
}

import { VoiceCore, type CoreState } from './core';
import { drawFaceScan, type FaceScanFrame } from './facescan';
import { drawHandUi, type HandUiFrame } from './handui';
import type { Pt } from './geometry';
import { GESTURE_LABEL, type Gesture } from './gestures';
import { Panels, type HitTarget, type PanelsData, type Rect } from './panels';

export { inRect, type HitTarget, type MusicButton, type MusicView, type PanelId, type Rect } from './panels';

const CYAN = '#4dd8ff';
const DIM = 'rgba(77, 216, 255, 0.45)';
const HOT = '#ffb347';
const mono = (size: number) => `${size}px "Share Tech Mono", ui-monospace, monospace`;

const CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const TIPS = [4, 8, 12, 16, 20];

export interface HudHand {
  points: Pt[];
  gesture: Gesture;
  pinch: Pt;
  /** Mão perdida há pouco pelo detector (desenhada apagada). */
  stale: boolean;
  /** Linhas do modo de depuração (tecla D), ou null. */
  debug: string[] | null;
}

export interface HudFrame {
  time: number;
  cameraOn: boolean;
  /** Etapa da inicialização ("CARREGANDO..."), ou vazio quando já está tudo de pé. */
  boot: string;
  /** Linha de estado abaixo do título (identidade, Claude, presença). */
  status: Array<{ text: string; color?: string }>;
  hands: HudHand[];
  core: { state: CoreState; level: number };
  /** Última fala do JARVIS. */
  caption: string;
  /** O que o microfone está ouvindo ou acabou de ouvir. */
  transcript: string;
  panels: PanelsData;
  /** Leitura facial em volta do rosto (identificando, confirmando, cadastrando ou lendo a expressão), ou null. */
  faceScan: FaceScanFrame | null;
  /** Objetos vistos no último "o que é isso?", em pixels da tela. */
  objects: Array<{ rect: Rect; name: string; shown: boolean }>;
  /** Cursor do dedo indicador (apontar), com o progresso para "clicar" parado (0..1). */
  cursor: { x: number; y: number; progress: number } | null;
  hints: string[];
  /** Tamanho da interface (duas pinças): 1 = normal. */
  scale: number;
  /** Modo espera (aceno de tchau): sem painéis, núcleo apagado. */
  standby: boolean;
  /** Camada dos gestos: menu na mão, volume, anéis de progresso, avisos, ajuda. */
  handUi: HandUiFrame;
}

export class Hud {
  readonly panels = new Panels();
  private readonly core = new VoiceCore();
  private readonly ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível');
    this.ctx = ctx;
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.panels.resize(w, h);
  }

  /** Centro e raio do núcleo de voz. */
  coreGeometry(scale = 1): { x: number; y: number; r: number } {
    const r = Math.max(64, Math.min(140, Math.min(this.w, this.h) * 0.12)) * scale;
    return { x: this.w / 2, y: this.h * 0.46, r };
  }

  /** Desenha o frame e devolve as áreas clicáveis (botões dos painéis). */
  draw(f: HudFrame): HitTarget[] {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawCorners();
    this.drawHeader(f);
    const g = this.coreGeometry(f.scale);
    // Modo espera: o núcleo fica apagado e os painéis somem
    if (f.standby) ctx.globalAlpha = 0.35;
    this.core.draw(ctx, { ...g, ...f.core, time: f.time });
    ctx.globalAlpha = 1;
    this.drawSpeech(f, g);
    const targets = f.standby ? [] : this.panels.draw(ctx, f.panels, f.scale);
    for (const o of f.objects) this.drawObject(o);
    for (const hand of f.hands) this.drawHand(hand);
    if (f.faceScan) drawFaceScan(this.ctx, f.faceScan, { w: this.w, h: this.h });
    if (f.cursor) this.drawCursor(f.cursor);
    drawHandUi(ctx, f.handUi, { w: this.w, h: this.h });
    this.drawFooter(f);
    return targets;
  }

  private drawCorners(): void {
    const { ctx, w, h } = this;
    const m = 14;
    const l = 30;
    ctx.strokeStyle = 'rgba(77, 216, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(m, m + l); ctx.lineTo(m, m); ctx.lineTo(m + l, m);
    ctx.moveTo(w - m - l, m); ctx.lineTo(w - m, m); ctx.lineTo(w - m, m + l);
    ctx.moveTo(m, h - m - l); ctx.lineTo(m, h - m); ctx.lineTo(m + l, h - m);
    ctx.moveTo(w - m - l, h - m); ctx.lineTo(w - m, h - m); ctx.lineTo(w - m, h - m - l);
    ctx.stroke();
  }

  private drawHeader(f: HudFrame): void {
    const { ctx } = this;
    // Ampliado junto com a interface
    ctx.save();
    ctx.scale(f.scale, f.scale);
    const w = this.w / f.scale;
    ctx.textAlign = 'left';
    ctx.fillStyle = CYAN;
    ctx.font = '600 20px Orbitron, sans-serif';
    ctx.fillText('J.A.R.V.I.S.', 30, 48);
    ctx.font = mono(12);
    let x = 30;
    const parts = f.boot ? [{ text: f.boot, color: HOT }] : f.status;
    parts.forEach((p, i) => {
      const text = i === 0 ? p.text : `  ·  ${p.text}`;
      ctx.fillStyle = p.color ?? DIM;
      ctx.fillText(text, x, 70);
      x += ctx.measureText(text).width;
    });

    const now = new Date();
    ctx.textAlign = 'right';
    ctx.font = '500 22px Orbitron, sans-serif';
    ctx.fillStyle = CYAN;
    ctx.fillText(now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), w - 30, 48);
    ctx.font = mono(12);
    ctx.fillStyle = DIM;
    ctx.fillText(now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).toUpperCase(), w - 30, 70);
    ctx.restore();
  }

  /** Legenda da fala do JARVIS e transcrição do que ele ouviu, embaixo do núcleo. */
  private drawSpeech(f: HudFrame, g: { x: number; y: number; r: number }): void {
    const { ctx } = this;
    const s = f.scale;
    const maxW = Math.min(this.w - 680 * s, 760 * s);
    let y = g.y + g.r * 1.9 + 18 * s;
    ctx.textAlign = 'center';
    if (f.transcript) {
      ctx.font = mono(Math.round(14 * s));
      ctx.fillStyle = 'rgba(223, 247, 255, 0.75)';
      for (const line of wrap(ctx, `“${f.transcript}”`, Math.max(260, maxW)).slice(0, 2)) {
        ctx.fillText(line, g.x, y);
        y += 20 * s;
      }
      y += 6 * s;
    }
    if (f.caption) {
      ctx.font = mono(Math.round(17 * s));
      ctx.fillStyle = CYAN;
      ctx.shadowColor = 'rgba(77, 216, 255, 0.6)';
      ctx.shadowBlur = 8;
      for (const line of wrap(ctx, f.caption, Math.max(260, maxW)).slice(0, 4)) {
        ctx.fillText(line, g.x, y);
        y += 24 * s;
      }
      ctx.shadowBlur = 0;
    }
  }

  private drawObject(o: HudFrame['objects'][number]): void {
    const { ctx } = this;
    const r = o.rect;
    const color = o.shown ? HOT : DIM;
    const l = Math.min(r.w, r.h) * 0.2;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = o.shown ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + l); ctx.lineTo(r.x, r.y); ctx.lineTo(r.x + l, r.y);
    ctx.moveTo(r.x + r.w - l, r.y); ctx.lineTo(r.x + r.w, r.y); ctx.lineTo(r.x + r.w, r.y + l);
    ctx.moveTo(r.x, r.y + r.h - l); ctx.lineTo(r.x, r.y + r.h); ctx.lineTo(r.x + l, r.y + r.h);
    ctx.moveTo(r.x + r.w - l, r.y + r.h); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x + r.w, r.y + r.h - l);
    ctx.stroke();
    ctx.font = mono(13);
    ctx.textAlign = 'left';
    const label = o.name.toUpperCase();
    ctx.fillStyle = 'rgba(2, 14, 20, 0.75)';
    ctx.fillRect(r.x, r.y - 22, ctx.measureText(label).width + 12, 18);
    ctx.fillStyle = color;
    ctx.fillText(label, r.x + 6, r.y - 8);
    ctx.restore();
  }

  private drawHand(hand: HudHand): void {
    const { ctx } = this;
    const pts = hand.points;
    ctx.save();
    ctx.globalAlpha = hand.stale ? 0.25 : 0.7;
    ctx.strokeStyle = 'rgba(77, 216, 255, 0.6)';
    ctx.fillStyle = CYAN;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) {
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
    }
    ctx.stroke();
    pts.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, TIPS.includes(i) ? 3.5 : 2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = hand.stale ? 0.35 : 1;
    if (hand.gesture === 'pinch') {
      ctx.beginPath();
      ctx.arc(hand.pinch.x, hand.pinch.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 179, 71, 0.3)';
      ctx.fill();
      ctx.strokeStyle = HOT;
      ctx.stroke();
    }
    if (hand.gesture !== 'none') {
      ctx.font = mono(11);
      ctx.textAlign = 'center';
      ctx.fillStyle = hand.gesture === 'pinch' ? HOT : CYAN;
      ctx.fillText(GESTURE_LABEL[hand.gesture], pts[0].x, pts[0].y + 26);
    }
    ctx.restore();
    if (hand.debug) this.drawDebug(hand);
  }

  private drawDebug(hand: HudHand): void {
    const { ctx } = this;
    const wrist = hand.points[0];
    ctx.font = mono(12);
    ctx.textAlign = 'left';
    const x = wrist.x + 24;
    const lines = hand.debug!;
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12;
    ctx.fillStyle = 'rgba(2, 14, 20, 0.8)';
    ctx.fillRect(x - 6, wrist.y + 36, width, lines.length * 16 + 8);
    ctx.fillStyle = HOT;
    lines.forEach((line, i) => ctx.fillText(line, x, wrist.y + 52 + i * 16));
  }

  private drawCursor(c: NonNullable<HudFrame['cursor']>): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
    ctx.moveTo(c.x - 15, c.y); ctx.lineTo(c.x - 11, c.y);
    ctx.moveTo(c.x + 11, c.y); ctx.lineTo(c.x + 15, c.y);
    ctx.moveTo(c.x, c.y - 15); ctx.lineTo(c.x, c.y - 11);
    ctx.moveTo(c.x, c.y + 11); ctx.lineTo(c.x, c.y + 15);
    ctx.stroke();
    if (c.progress > 0) {
      ctx.strokeStyle = HOT;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 13, -Math.PI / 2, -Math.PI / 2 + c.progress * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFooter(f: HudFrame): void {
    const { ctx, w, h } = this;
    ctx.textAlign = 'center';
    ctx.font = mono(12);
    ctx.fillStyle = 'rgba(77, 216, 255, 0.4)';
    const line = f.hints.join('   ·   ');
    if (ctx.measureText(line).width < w - 520) ctx.fillText(line, w / 2, h - 26);
    else {
      const half = Math.ceil(f.hints.length / 2);
      ctx.fillText(f.hints.slice(0, half).join('   ·   '), w / 2, h - 42);
      ctx.fillText(f.hints.slice(half).join('   ·   '), w / 2, h - 24);
    }
  }
}

/** Quebra o texto em linhas que cabem na largura. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

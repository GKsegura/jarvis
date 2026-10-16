import type { Pt } from './geometry';
import type { Rect } from './panels';

/**
 * O que a leitura facial na tela está mostrando:
 * - scanning: comparando o rosto com o perfil cadastrado
 * - unknown: rosto que não é o do dono
 * - enrolling: cadastrando o rosto
 * - confirmed: animação de "identidade confirmada" (alguns segundos)
 * - reading: o senhor está falando com o JARVIS; só a malha discreta e a expressão
 */
export type FaceScanMode = 'scanning' | 'unknown' | 'enrolling' | 'confirmed' | 'reading';

export interface FaceScanFrame {
  mode: FaceScanMode;
  /** Retângulo do rosto, em pixels da tela. */
  box: Rect;
  /** Os 68 pontos do rosto, em pixels da tela (pode vir vazio). */
  points: Pt[];
  /** Linhas de dados ao lado do rosto ([rótulo, valor]). */
  data: Array<[string, string]>;
  /** Progresso do cadastro (0..1). */
  progress: number;
  /** Há quanto tempo (ms) o modo começou (usado na animação de confirmação). */
  elapsed: number;
  time: number;
}

/** Duração da animação de "identidade confirmada". */
export const CONFIRM_ANIMATION_MS = 2600;

const COLOR: Record<FaceScanMode, [number, number, number]> = {
  scanning: [77, 216, 255],
  unknown: [255, 107, 107],
  enrolling: [255, 179, 71],
  confirmed: [124, 255, 178],
  reading: [77, 216, 255],
};

const TITLE: Record<FaceScanMode, string> = {
  scanning: 'ANÁLISE FACIAL',
  unknown: 'ROSTO NÃO RECONHECIDO',
  enrolling: 'CADASTRO FACIAL',
  confirmed: 'IDENTIDADE CONFIRMADA',
  reading: 'LEITURA FACIAL',
};

/** Contornos do modelo de 68 pontos: [início, fim, fechado?]. */
const CONTOURS: Array<[number, number, boolean]> = [
  [0, 16, false], // mandíbula
  [17, 21, false], // sobrancelha direita
  [22, 26, false], // sobrancelha esquerda
  [27, 30, false], // ponte do nariz
  [31, 35, false], // base do nariz
  [36, 41, true], // olho direito
  [42, 47, true], // olho esquerdo
  [48, 59, true], // lábios por fora
  [60, 67, true], // lábios por dentro
];
/** Linhas da malha: contorno do rosto até a ponta do nariz e entre os olhos. */
const MESH: Array<[number, number]> = [
  ...[0, 2, 4, 6, 8, 10, 12, 14, 16].map((i): [number, number] => [i, 30]),
  ...[17, 19, 21, 22, 24, 26].map((i): [number, number] => [i, 27]),
  [36, 39], [42, 45], [39, 27], [42, 27], [48, 31], [54, 35], [8, 57],
];

const mono = (size: number) => `${size}px "Share Tech Mono", ui-monospace, monospace`;
const ease = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

export function drawFaceScan(ctx: CanvasRenderingContext2D, f: FaceScanFrame, view: { w: number; h: number }): void {
  const [r, g, b] = COLOR[f.mode];
  const rgba = (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;
  const confirming = f.mode === 'confirmed';
  // Confirmação: entra forte e some no final
  const fade = confirming ? 1 - Math.max(0, (f.elapsed - (CONFIRM_ANIMATION_MS - 700)) / 700) : 1;
  const reading = f.mode === 'reading';
  const { box } = f;

  ctx.save();
  ctx.globalAlpha = fade;

  // Malha dos pontos do rosto
  if (f.points.length === 68) {
    const scanY = box.y + ((f.time * 0.00065) % 1) * box.h;
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(reading ? 0.12 : 0.22);
    ctx.beginPath();
    for (const [a, c] of MESH) {
      ctx.moveTo(f.points[a].x, f.points[a].y);
      ctx.lineTo(f.points[c].x, f.points[c].y);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba(reading ? 0.3 : 0.6);
    ctx.beginPath();
    for (const [start, end, closed] of CONTOURS) {
      ctx.moveTo(f.points[start].x, f.points[start].y);
      for (let i = start + 1; i <= end; i++) ctx.lineTo(f.points[i].x, f.points[i].y);
      if (closed) ctx.lineTo(f.points[start].x, f.points[start].y);
    }
    ctx.stroke();
    // Pontos: os que estão na altura da linha de varredura acendem
    f.points.forEach((p, i) => {
      const near = !reading && !confirming && Math.abs(p.y - scanY) < box.h * 0.06;
      // Na confirmação, os pontos acendem em sequência
      const lit = confirming && f.elapsed > (i / 68) * 500;
      ctx.fillStyle = rgba(near || lit ? 1 : reading ? 0.35 : 0.65);
      ctx.beginPath();
      ctx.arc(p.x, p.y, near || lit ? 2.4 : 1.4, 0, Math.PI * 2);
      ctx.fill();
    });
    // Linha de varredura
    if (!reading && !confirming) {
      const grad = ctx.createLinearGradient(box.x, 0, box.x + box.w, 0);
      grad.addColorStop(0, rgba(0));
      grad.addColorStop(0.5, rgba(0.8));
      grad.addColorStop(1, rgba(0));
      ctx.fillStyle = grad;
      ctx.fillRect(box.x - box.w * 0.1, scanY, box.w * 1.2, 1.5);
      ctx.fillStyle = rgba(0.06);
      ctx.fillRect(box.x, Math.min(scanY, box.y + box.h) - box.h * 0.12, box.w, box.h * 0.12);
    }
  }

  // Moldura: na confirmação, fecha de fora para dentro e "trava"
  const lock = confirming ? ease(f.elapsed / 450) : 1;
  const grow = confirming ? 1.35 - 0.35 * lock : reading ? 1.08 : 1.12 + 0.02 * Math.sin(f.time * 0.006);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const w = box.w * grow;
  const h = box.h * grow;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const l = Math.min(w, h) * 0.2;
  ctx.strokeStyle = rgba(reading ? 0.45 : 0.95);
  ctx.lineWidth = confirming ? 2.5 : 1.5;
  ctx.shadowColor = rgba(0.8);
  ctx.shadowBlur = reading ? 0 : 10;
  ctx.beginPath();
  ctx.moveTo(x, y + l); ctx.lineTo(x, y); ctx.lineTo(x + l, y);
  ctx.moveTo(x + w - l, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + l);
  ctx.moveTo(x, y + h - l); ctx.lineTo(x, y + h); ctx.lineTo(x + l, y + h);
  ctx.moveTo(x + w - l, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - l);
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (!reading) {
    // Marcas de mira no meio de cada lado
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, y - 8); ctx.lineTo(cx, y + 4);
    ctx.moveTo(cx, y + h - 4); ctx.lineTo(cx, y + h + 8);
    ctx.moveTo(x - 8, cy); ctx.lineTo(x + 4, cy);
    ctx.moveTo(x + w - 4, cy); ctx.lineTo(x + w + 8, cy);
    ctx.stroke();
  }

  // Confirmação: anel que se expande a partir do rosto
  if (confirming && f.elapsed < 900) {
    const t = f.elapsed / 900;
    ctx.strokeStyle = rgba(0.7 * (1 - t));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(w, h) * (0.55 + t * 0.6), 0, Math.PI * 2);
    ctx.stroke();
  }

  // Título embaixo do rosto
  ctx.textAlign = 'center';
  ctx.fillStyle = rgba(reading ? 0.6 : 1);
  ctx.font = confirming ? '600 15px Orbitron, sans-serif' : mono(13);
  const blink = f.mode === 'scanning' && Math.floor(f.time / 500) % 2 === 0 ? '▮' : ' ';
  ctx.fillText(f.mode === 'scanning' ? `${TITLE.scanning} ${blink}` : TITLE[f.mode], cx, y + h + 24);
  if (confirming) {
    ctx.font = mono(13);
    ctx.fillStyle = rgba(ease((f.elapsed - 350) / 400));
    ctx.fillText('BEM-VINDO, SENHOR', cx, y + h + 44);
  }

  // Painel de dados ao lado do rosto (do lado com mais espaço)
  if (f.data.length > 0) {
    const pw = 210;
    const right = x + w + 18 + pw < view.w - 300;
    const px = right ? x + w + 18 : x - 18 - pw;
    const py = y;
    const ph = 26 + f.data.length * 18 + (f.mode === 'enrolling' ? 14 : 0);
    // Linha de chamada até o painel
    ctx.strokeStyle = rgba(0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(right ? x + w : x, y + 10);
    ctx.lineTo(right ? px : px + pw, py + 10);
    ctx.stroke();
    ctx.fillStyle = 'rgba(2, 14, 20, 0.7)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = rgba(0.35);
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    ctx.textAlign = 'left';
    ctx.font = '600 10px Orbitron, sans-serif';
    ctx.fillStyle = rgba(1);
    ctx.fillText(TITLE[f.mode], px + 10, py + 16);
    ctx.font = mono(12);
    // As linhas aparecem uma a uma (como se estivessem sendo calculadas)
    const shown = confirming ? f.data.length : Math.min(f.data.length, 1 + Math.floor((f.time / 180) % (f.data.length + 6)));
    f.data.slice(0, shown).forEach(([label, value], i) => {
      const ly = py + 34 + i * 18;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(160, 220, 240, 0.6)';
      ctx.fillText(label, px + 10, ly);
      ctx.textAlign = 'right';
      ctx.fillStyle = rgba(1);
      ctx.fillText(value, px + pw - 10, ly);
    });
    if (f.mode === 'enrolling') {
      const by = py + ph - 12;
      ctx.fillStyle = rgba(0.2);
      ctx.fillRect(px + 10, by, pw - 20, 3);
      ctx.fillStyle = rgba(1);
      ctx.fillRect(px + 10, by, (pw - 20) * f.progress, 3);
    }
  }
  ctx.restore();
}

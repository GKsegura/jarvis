import type { Pt } from './geometry';
import { menuItemPosition, MENU_PICK_MS, MENU_RADIUS, type MenuState, type ProgressMark } from './handcontrol';

/** O que a camada dos gestos desenha por cima do HUD (tudo em pixels da tela). */
export interface HandUiFrame {
  time: number;
  progress: ProgressMark[];
  menu: (MenuState & { labels: string[] }) | null;
  /** Volume no ar: posição da mão e volume atual (0..1). */
  volume: { at: Pt; value: number } | null;
  /** Aviso curto ("ALT+TAB →", "INTERFACE 130%", "TUDO PARADO"). */
  toast: { text: string; tone: 'cyan' | 'hot' | 'red'; age: number } | null;
  /** Mouse no ar ligado: anel na mão que controla. */
  mouse: { at: Pt; pressed: boolean } | null;
  /** Gravando um gesto novo: progresso (0..1) e posição da mão. */
  learning: { at: Pt | null; progress: number } | null;
  /** Painel de ajuda (tecla G / "quais gestos"): linhas [gesto, ação]. */
  help: Array<[string, string]> | null;
}

const TONE = { cyan: '77, 216, 255', hot: '255, 179, 71', red: '255, 107, 107' };
const mono = (size: number) => `${size}px "Share Tech Mono", ui-monospace, monospace`;
export const TOAST_MS = 1600;

export function drawHandUi(ctx: CanvasRenderingContext2D, f: HandUiFrame, view: { w: number; h: number }): void {
  ctx.save();
  for (const p of f.progress) progressRing(ctx, p);
  if (f.menu) menu(ctx, f.menu, f.time);
  if (f.volume) volume(ctx, f.volume);
  if (f.mouse) mouseRing(ctx, f.mouse, f.time);
  if (f.learning) learning(ctx, f.learning, f.time);
  if (f.toast) toast(ctx, f.toast, view);
  if (f.help) help(ctx, f.help, view);
  ctx.restore();
}

function progressRing(ctx: CanvasRenderingContext2D, p: ProgressMark): void {
  const c = TONE[p.tone];
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(${c}, 0.25)`;
  ctx.beginPath();
  ctx.arc(p.at.x, p.at.y, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(${c}, 1)`;
  ctx.beginPath();
  ctx.arc(p.at.x, p.at.y, 34, -Math.PI / 2, -Math.PI / 2 + p.value * Math.PI * 2);
  ctx.stroke();
  ctx.font = mono(12);
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(${c}, 1)`;
  ctx.fillText(p.label, p.at.x, p.at.y + 52);
}

function menu(ctx: CanvasRenderingContext2D, m: NonNullable<HandUiFrame['menu']>, time: number): void {
  const open = Math.min(1, (time - m.openedAt) / 180);
  ctx.strokeStyle = `rgba(${TONE.cyan}, ${0.25 * open})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(m.center.x, m.center.y, MENU_RADIUS * 0.55, 0, Math.PI * 2);
  ctx.stroke();
  m.labels.forEach((label, i) => {
    const p = menuItemPosition(m.center, i, m.items, MENU_RADIUS * (0.6 + 0.4 * open));
    const hover = i === m.hover;
    const r = 36;
    ctx.fillStyle = hover ? `rgba(${TONE.hot}, 0.25)` : 'rgba(2, 16, 24, 0.8)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hover ? `rgba(${TONE.hot}, 1)` : `rgba(${TONE.cyan}, 0.7)`;
    ctx.lineWidth = hover ? 2 : 1;
    ctx.stroke();
    if (hover) {
      // Anel de "segurando para escolher"
      const value = Math.min(1, (time - m.hoverSince) / MENU_PICK_MS);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 5, -Math.PI / 2, -Math.PI / 2 + value * Math.PI * 2);
      ctx.stroke();
    }
    ctx.font = mono(11);
    ctx.textAlign = 'center';
    ctx.fillStyle = hover ? `rgba(${TONE.hot}, 1)` : '#dff7ff';
    const words = label.split(' ');
    const lines = words.length > 1 && label.length > 9 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [label];
    lines.forEach((l, j) => ctx.fillText(l, p.x, p.y + 4 + (j - (lines.length - 1) / 2) * 13));
  });
  ctx.font = mono(11);
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(${TONE.cyan}, 0.6)`;
  ctx.fillText('LEVE A MÃO ATÉ UM ITEM · PUNHO FECHA', m.center.x, m.center.y + MENU_RADIUS + 58);
}

function volume(ctx: CanvasRenderingContext2D, v: NonNullable<HandUiFrame['volume']>): void {
  const x = v.at.x + 50;
  const h = 160;
  const y = v.at.y - h / 2;
  ctx.fillStyle = 'rgba(2, 16, 24, 0.75)';
  ctx.fillRect(x - 8, y - 26, 44, h + 50);
  ctx.fillStyle = `rgba(${TONE.cyan}, 0.2)`;
  ctx.fillRect(x + 8, y, 12, h);
  ctx.fillStyle = `rgba(${TONE.cyan}, 1)`;
  ctx.fillRect(x + 8, y + h * (1 - v.value), 12, h * v.value);
  ctx.font = mono(12);
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(v.value * 100)}%`, x + 14, y - 10);
  ctx.fillStyle = `rgba(${TONE.cyan}, 0.6)`;
  ctx.fillText('VOL', x + 14, y + h + 18);
}

function mouseRing(ctx: CanvasRenderingContext2D, m: NonNullable<HandUiFrame['mouse']>, time: number): void {
  const c = m.pressed ? TONE.hot : TONE.cyan;
  ctx.strokeStyle = `rgba(${c}, 0.9)`;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -time * 0.03;
  ctx.beginPath();
  ctx.arc(m.at.x, m.at.y, 46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = mono(11);
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(${c}, 1)`;
  ctx.fillText(m.pressed ? 'CLICANDO' : 'MOUSE NO AR', m.at.x, m.at.y + 64);
}

function learning(ctx: CanvasRenderingContext2D, l: NonNullable<HandUiFrame['learning']>, time: number): void {
  if (!l.at) return;
  const blink = 0.5 + 0.5 * Math.sin(time * 0.012);
  ctx.strokeStyle = `rgba(${TONE.hot}, ${0.5 + 0.5 * blink})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(l.at.x - 90, l.at.y - 110, 180, 200);
  ctx.fillStyle = `rgba(${TONE.hot}, 1)`;
  ctx.fillRect(l.at.x - 90, l.at.y + 96, 180 * l.progress, 3);
  ctx.font = mono(12);
  ctx.textAlign = 'center';
  ctx.fillText('● GRAVANDO GESTO', l.at.x, l.at.y - 120);
}

function toast(ctx: CanvasRenderingContext2D, t: NonNullable<HandUiFrame['toast']>, view: { w: number; h: number }): void {
  const alpha = t.age < TOAST_MS - 300 ? 1 : Math.max(0, (TOAST_MS - t.age) / 300);
  ctx.font = '600 18px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  const w = ctx.measureText(t.text).width + 40;
  const y = view.h * 0.18;
  ctx.fillStyle = `rgba(2, 16, 24, ${0.8 * alpha})`;
  ctx.fillRect(view.w / 2 - w / 2, y - 28, w, 42);
  ctx.strokeStyle = `rgba(${TONE[t.tone]}, ${alpha})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(view.w / 2 - w / 2 + 0.5, y - 27.5, w - 1, 41);
  ctx.fillStyle = `rgba(${TONE[t.tone]}, ${alpha})`;
  ctx.fillText(t.text, view.w / 2, y);
}

function help(ctx: CanvasRenderingContext2D, rows: Array<[string, string]>, view: { w: number; h: number }): void {
  const w = Math.min(720, view.w - 80);
  const h = 70 + rows.length * 24;
  const x = (view.w - w) / 2;
  const y = Math.max(90, (view.h - h) / 2);
  ctx.fillStyle = 'rgba(2, 14, 20, 0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = `rgba(${TONE.cyan}, 0.6)`;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.font = '600 14px Orbitron, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = `rgba(${TONE.cyan}, 1)`;
  ctx.fillText('GESTOS', x + 20, y + 32);
  ctx.font = mono(11);
  ctx.textAlign = 'right';
  ctx.fillStyle = `rgba(${TONE.cyan}, 0.5)`;
  ctx.fillText('G: FECHAR', x + w - 20, y + 32);
  ctx.font = mono(13);
  rows.forEach(([gesture, action], i) => {
    const ry = y + 62 + i * 24;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#dff7ff';
    ctx.fillText(gesture, x + 20, ry);
    ctx.fillStyle = `rgba(${TONE.cyan}, 0.85)`;
    ctx.fillText(action, x + 280, ry);
  });
}

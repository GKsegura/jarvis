import type { FinanceSummary } from './finance';
import { ago, type NewsItem } from './news';
import { clamp, type Pt } from './geometry';
import {
  diskPercent,
  formatCountdown,
  formatGb,
  formatRate,
  formatUptime,
  memPercent,
  type ProjectStatus,
  type Reminder,
  type SystemInfo,
  type WeatherInfo,
  weatherLabel,
} from './info';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const inRect = (p: Pt, r: Rect): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Retângulo do espaço da interface ampliada para pixels da tela. */
export const scaleRect = (r: Rect, s: number): Rect => ({ x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s });

/** Limites da ampliação da interface (duas pinças). */
export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 1.6;

export type PanelId = 'system' | 'projects' | 'finance' | 'news' | 'weather' | 'reminders' | 'music';
export const PANEL_ORDER: PanelId[] = ['system', 'projects', 'finance', 'news', 'weather', 'reminders', 'music'];
const COLUMNS: Record<'left' | 'right', PanelId[]> = { left: ['system', 'projects', 'finance', 'news'], right: ['weather', 'reminders', 'music'] };
const TITLE: Record<PanelId, string> = {
  system: 'SISTEMA',
  projects: 'PROJETOS',
  finance: 'FINANÇAS',
  news: 'NOTÍCIAS',
  weather: 'CLIMA',
  reminders: 'LEMBRETES',
  music: 'SPOTIFY',
};
/** Painéis com dados pessoais: somem quando tem outra pessoa na frente da câmera. */
const PRIVATE: PanelId[] = ['finance', 'reminders', 'music'];

export interface MusicView {
  name: string;
  artist: string;
  playing: boolean;
  elapsedMs: number;
  durationMs: number;
  cover: HTMLImageElement | null;
}

export type MusicButton = 'previous' | 'toggle' | 'next';

export interface PanelsData {
  /** Date.now(), para as contagens regressivas. */
  now: number;
  system: SystemInfo | null;
  projects: ProjectStatus[] | null;
  weather: WeatherInfo | null;
  reminders: Reminder[] | null;
  music: MusicView | null;
  finance: FinanceSummary | null;
  news: NewsItem[] | null;
  /** Outra pessoa na frente da câmera: esconde os painéis pessoais. */
  privacy: boolean;
  /** Painel em destaque (mostra mais detalhes). */
  focus: PanelId | null;
  grabbed: PanelId | null;
}

/** Área clicável desenhada no frame: "music:next", "reminder:<id>", "panel:<id>" (cabeçalho). */
export interface HitTarget {
  id: string;
  rect: Rect;
}

const CYAN = '#4dd8ff';
const DIM = 'rgba(77, 216, 255, 0.45)';
const FAINT = 'rgba(77, 216, 255, 0.18)';
const TEXT = '#dff7ff';
const HOT = '#ffb347';
const OK = '#7cffb2';
const BAD = '#ff6b6b';
const mono = (size: number) => `${size}px "Share Tech Mono", ui-monospace, monospace`;

const WIDTH = 280;
const HEADER = 26;
const PAD = 12;
const LINE = 21;
const GAP = 12;
const TOP = 104;
const SIDE = 24;
const STORAGE_KEY = 'jarvis.panels';

const formatTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Corta o texto com "…" para caber na largura. */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1);
  return `${t}…`;
}

/** Quando vence: "19:30" hoje, "amanhã 08:00", "15/10 09:00". */
function dueLabel(dueAt: number, now: number): string {
  const due = new Date(dueAt);
  const time = due.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date(due).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return time;
  if (days === 1) return `amanhã ${time}`;
  return `${due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`;
}

/**
 * Os painéis de dados reais nas laterais. Cada coluna se empilha sozinha; um painel arrastado
 * (pinça ou mouse) fica preso onde foi solto, e a posição é lembrada.
 */
export class Panels {
  readonly rects = {} as Record<PanelId, Rect>;
  /** Painéis que o senhor arrastou (posição fixa). */
  private pinned = new Map<PanelId, { x: number; y: number }>();
  private view = { w: 0, h: 0 };

  constructor() {
    for (const id of PANEL_ORDER) this.rects[id] = { x: 0, y: 0, w: WIDTH, h: HEADER + 40 };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, { x: number; y: number }>;
      for (const id of PANEL_ORDER) if (saved[id] && Number.isFinite(saved[id].x)) this.pinned.set(id, saved[id]);
    } catch {
      /* sem posições salvas */
    }
  }

  resize(w: number, h: number): void {
    this.view = { w, h };
  }

  /** Painel sendo arrastado: fica preso na nova posição. */
  move(id: PanelId, x: number, y: number): void {
    const r = this.rects[id];
    this.pinned.set(id, { x: clamp(x, 0, this.view.w - r.w), y: clamp(y, 0, this.view.h - r.h) });
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this.pinned)));
    } catch {
      /* ignora */
    }
  }

  /** Volta todos os painéis para as colunas. */
  resetLayout(): void {
    this.pinned.clear();
    this.save();
  }

  visible(id: PanelId, d: PanelsData): boolean {
    if (d.privacy && PRIVATE.includes(id)) return false;
    if (id === 'music') return d.music !== null;
    if (id === 'finance') return d.finance !== null;
    if (id === 'news') return d.news !== null && d.news.length > 0;
    if (id === 'projects') return d.projects !== null && d.projects.length > 0;
    return true;
  }

  /** Painel visível sob o ponto (o de cima ganha). */
  panelAt(p: Pt, d: PanelsData): PanelId | null {
    return [...PANEL_ORDER].reverse().find((id) => this.visible(id, d) && inRect(p, this.rects[id])) ?? null;
  }

  /**
   * Desenha todos os painéis e devolve as áreas clicáveis, em pixels da tela.
   * Com a interface ampliada (`scale`, duas pinças), desenha num espaço menor com `ctx.scale` e
   * converte de volta os retângulos, para pinça, mouse e apontar continuarem acertando.
   */
  draw(ctx: CanvasRenderingContext2D, d: PanelsData, scale = 1): HitTarget[] {
    const targets: HitTarget[] = [];
    const view = { w: this.view.w / scale, h: this.view.h / scale };
    ctx.save();
    ctx.scale(scale, scale);
    for (const [side, ids] of Object.entries(COLUMNS) as Array<['left' | 'right', PanelId[]]>) {
      let y = TOP;
      for (const id of ids) {
        if (!this.visible(id, d)) continue;
        const r: Rect = { x: 0, y: 0, w: WIDTH, h: HEADER + this.bodyHeight(id, d) };
        const pin = this.pinned.get(id);
        if (pin) {
          r.x = clamp(pin.x / scale, 0, Math.max(0, view.w - r.w));
          r.y = clamp(pin.y / scale, 0, Math.max(0, view.h - r.h));
        } else {
          r.x = side === 'left' ? SIDE : view.w - r.w - SIDE;
          r.y = y;
          y += r.h + GAP;
        }
        this.frame(ctx, id, r, d, targets);
        this.rects[id] = scaleRect(r, scale);
      }
    }
    ctx.restore();
    return targets.map((t) => ({ id: t.id, rect: scaleRect(t.rect, scale) }));
  }

  private bodyHeight(id: PanelId, d: PanelsData): number {
    const expanded = d.focus === id;
    switch (id) {
      case 'system':
        return PAD + LINE * ((d.system?.battery != null ? 5 : 4) + (expanded ? 2 : 0)) + 4;
      case 'projects':
        return PAD + LINE * (d.projects?.length ?? 1) + 4;
      case 'weather':
        return expanded ? 112 : 70;
      case 'reminders': {
        const n = Math.min(this.pendingReminders(d).length, expanded ? 8 : 3);
        return PAD + LINE * Math.max(1, n) + 4;
      }
      case 'music':
        return 96;
      case 'finance':
        return PAD + LINE * 6 + 4;
      case 'news':
        return PAD + LINE * Math.min(d.news?.length ?? 1, expanded ? 6 : 3) + 4;
    }
  }

  private pendingReminders(d: PanelsData): Reminder[] {
    return (d.reminders ?? []).filter((r) => !r.done).sort((a, b) => a.dueAt - b.dueAt);
  }

  private frame(ctx: CanvasRenderingContext2D, id: PanelId, r: Rect, d: PanelsData, targets: HitTarget[]): void {
    const grabbed = d.grabbed === id;
    const focused = d.focus === id;
    const accent = grabbed ? HOT : CYAN;
    ctx.save();
    ctx.fillStyle = 'rgba(2, 16, 24, 0.62)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // Moldura com cantos marcados, sem caixa fechada
    ctx.strokeStyle = grabbed ? HOT : focused ? 'rgba(77, 216, 255, 0.7)' : FAINT;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    const c = 10;
    ctx.beginPath();
    ctx.moveTo(r.x, r.y + c); ctx.lineTo(r.x, r.y); ctx.lineTo(r.x + c, r.y);
    ctx.moveTo(r.x + r.w - c, r.y + r.h); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x + r.w, r.y + r.h - c);
    ctx.stroke();

    ctx.font = '600 11px Orbitron, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = accent;
    ctx.fillText(TITLE[id], r.x + PAD, r.y + 17);
    ctx.fillStyle = FAINT;
    ctx.fillRect(r.x + PAD, r.y + HEADER - 1, r.w - 2 * PAD, 1);
    targets.push({ id: `panel:${id}`, rect: { x: r.x, y: r.y, w: r.w, h: HEADER } });

    const body = { x: r.x + PAD, y: r.y + HEADER + PAD, w: r.w - 2 * PAD };
    switch (id) {
      case 'system':
        this.system(ctx, body, d.system, focused, r);
        break;
      case 'projects':
        this.projects(ctx, body, d.projects ?? []);
        break;
      case 'weather':
        this.weather(ctx, body, d.weather, focused, r);
        break;
      case 'reminders':
        this.reminders(ctx, body, d, focused, r, targets);
        break;
      case 'music':
        this.music(ctx, r, d.music!, grabbed, targets);
        break;
      case 'finance':
        this.finance(ctx, body, d.finance!, r);
        break;
      case 'news':
        this.news(ctx, body, d, focused);
        break;
    }
    ctx.restore();
  }

  private headerNote(ctx: CanvasRenderingContext2D, r: Rect, text: string, color = DIM): void {
    ctx.font = mono(11);
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.fillText(text, r.x + r.w - PAD, r.y + 17);
  }

  private row(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number }, i: number, label: string, value: string, color = TEXT): number {
    const y = b.y + i * LINE + 10;
    ctx.font = mono(12);
    ctx.textAlign = 'left';
    ctx.fillStyle = DIM;
    ctx.fillText(label, b.x, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.fillText(value, b.x + b.w, y);
    return y;
  }

  /** Linha com barra de uso: rótulo, barra fina e valor. */
  private meter(
    ctx: CanvasRenderingContext2D,
    b: { x: number; y: number; w: number },
    i: number,
    label: string,
    pct: number,
    value: string,
    alert: string | null = pct >= 90 ? BAD : pct >= 75 ? HOT : null,
  ): void {
    const y = this.row(ctx, b, i, label, value, alert ?? TEXT);
    const x = b.x + 54;
    const w = b.w - 54 - 96;
    ctx.fillStyle = FAINT;
    ctx.fillRect(x, y - 5, w, 3);
    ctx.fillStyle = alert ?? CYAN;
    ctx.fillRect(x, y - 5, (w * clamp(pct, 0, 100)) / 100, 3);
  }

  private system(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number }, s: SystemInfo | null, expanded: boolean, r: Rect): void {
    if (!s) {
      this.row(ctx, b, 0, 'lendo o sistema…', '');
      return;
    }
    this.headerNote(ctx, r, s.online === false ? '● OFFLINE' : s.online ? '● ONLINE' : '', s.online === false ? BAD : OK);
    const mem = memPercent(s);
    this.meter(ctx, b, 0, 'CPU', s.cpu, `${s.cpu}%`);
    this.meter(ctx, b, 1, 'MEM', mem, `${formatGb(s.memTotal - s.memFree)} / ${formatGb(s.memTotal)}`);
    const disk = diskPercent(s);
    if (s.disk && disk !== null) this.meter(ctx, b, 2, 'DISCO', disk, `${formatGb(s.disk.free)} livres`);
    else this.row(ctx, b, 2, 'DISCO', '—');
    const net = s.netDown === null ? '—' : `↓ ${formatRate(s.netDown)}  ↑ ${formatRate(s.netUp ?? 0)}`;
    this.row(ctx, b, 3, 'REDE', s.online === false ? 'sem internet' : net, s.online === false ? BAD : TEXT);
    let i = 4;
    if (s.battery !== null) {
      const low = s.battery <= 20 ? BAD : s.battery <= 40 ? HOT : null;
      this.meter(ctx, b, i++, 'BATERIA', s.battery, `${s.battery}%${s.charging ? ' ⚡' : ''}`, low);
    }
    if (expanded) {
      this.row(ctx, b, i++, 'LIGADO HÁ', formatUptime(s.uptimeSec));
      this.row(ctx, b, i, 'NÚCLEOS', String(s.cores));
    }
  }

  private projects(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number }, list: ProjectStatus[]): void {
    list.forEach((p, i) => {
      const y = b.y + i * LINE + 10;
      const color = p.running ? OK : p.running === false ? 'rgba(160, 190, 200, 0.45)' : FAINT;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(b.x + 4, y - 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = mono(12);
      ctx.textAlign = 'left';
      ctx.fillStyle = TEXT;
      ctx.fillText(p.name, b.x + 16, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = p.running ? OK : DIM;
      ctx.fillText(p.running ? 'NO AR' : p.running === false ? 'DESLIGADO' : '—', b.x + b.w, y);
    });
  }

  private weather(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number }, w: WeatherInfo | null, expanded: boolean, r: Rect): void {
    if (!w) {
      this.row(ctx, b, 0, 'buscando a previsão…', '');
      return;
    }
    this.headerNote(ctx, r, w.place.toUpperCase());
    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT;
    ctx.font = '500 30px Orbitron, sans-serif';
    ctx.fillText(`${Math.round(w.temp)}°`, b.x, b.y + 26);
    ctx.font = mono(13);
    ctx.fillStyle = TEXT;
    ctx.fillText(ellipsize(ctx, weatherLabel(w.code), b.w - 84), b.x + 80, b.y + 10);
    ctx.font = mono(11);
    ctx.fillStyle = DIM;
    ctx.fillText(`MÁX ${Math.round(w.max)}°  MÍN ${Math.round(w.min)}°`, b.x + 80, b.y + 26);
    ctx.fillStyle = w.rainChance >= 60 ? HOT : DIM;
    ctx.fillText(`CHUVA ${w.rainChance}%  ·  SENSAÇÃO ${Math.round(w.feels)}°`, b.x + 80, b.y + 41);
    if (!expanded) return;
    const hours = w.hours.slice(0, 6);
    const cell = b.w / Math.max(1, hours.length);
    hours.forEach((h, i) => {
      const x = b.x + cell * i + cell / 2;
      ctx.textAlign = 'center';
      ctx.fillStyle = DIM;
      ctx.fillText(`${String(h.hour).padStart(2, '0')}h`, x, b.y + 62);
      ctx.fillStyle = TEXT;
      ctx.fillText(`${Math.round(h.temp)}°`, x, b.y + 77);
      ctx.fillStyle = h.rain >= 50 ? HOT : DIM;
      ctx.fillText(`${h.rain}%`, x, b.y + 92);
    });
  }

  private reminders(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number }, d: PanelsData, expanded: boolean, r: Rect, targets: HitTarget[]): void {
    const pending = this.pendingReminders(d);
    if (pending.length > 0) this.headerNote(ctx, r, `${pending.length} PENDENTE${pending.length > 1 ? 'S' : ''}`);
    if (pending.length === 0) {
      ctx.font = mono(12);
      ctx.textAlign = 'left';
      ctx.fillStyle = DIM;
      ctx.fillText('nada pendente', b.x, b.y + 10);
      return;
    }
    pending.slice(0, expanded ? 8 : 3).forEach((rem, i) => {
      const y = b.y + i * LINE + 10;
      const left = rem.dueAt - d.now;
      const soon = left < 60_000;
      ctx.font = mono(12);
      ctx.textAlign = 'left';
      ctx.fillStyle = soon ? HOT : TEXT;
      const when = rem.kind === 'timer' ? formatCountdown(left) : dueLabel(rem.dueAt, d.now);
      ctx.textAlign = 'right';
      ctx.fillStyle = soon ? HOT : CYAN;
      ctx.fillText(when, b.x + b.w - 18, y);
      const whenW = ctx.measureText(when).width;
      ctx.textAlign = 'left';
      ctx.fillStyle = soon ? HOT : TEXT;
      ctx.fillText(ellipsize(ctx, `${rem.kind === 'timer' ? '⏱' : '•'} ${rem.text}`, b.w - whenW - 28), b.x, y);
      // "×" cancela (clique, pinça ou apontar e esperar)
      ctx.textAlign = 'center';
      ctx.fillStyle = DIM;
      ctx.fillText('×', b.x + b.w - 5, y);
      targets.push({ id: `reminder:${rem.id}`, rect: { x: b.x + b.w - 14, y: y - 14, w: 20, h: 18 } });
    });
  }

  private news(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number }, d: PanelsData, expanded: boolean): void {
    (d.news ?? []).slice(0, expanded ? 6 : 3).forEach((item, i) => {
      const y = b.y + i * LINE + 10;
      const when = ago(item.publishedAt, d.now);
      ctx.font = mono(11);
      ctx.textAlign = 'right';
      ctx.fillStyle = DIM;
      ctx.fillText(when, b.x + b.w, y);
      const whenW = ctx.measureText(when).width;
      ctx.font = mono(12);
      ctx.textAlign = 'left';
      ctx.fillStyle = TEXT;
      ctx.fillText(ellipsize(ctx, `• ${item.title}`, b.w - whenW - 10), b.x, y);
    });
  }

  /** Áreas dos botões ⏮ ⏯ ⏭ do visor de música. */
  static musicButtons(r: Rect): Record<MusicButton, Rect> {
    const y = r.y + HEADER + 44;
    const x = r.x + 84;
    return {
      previous: { x, y, w: 36, h: 22 },
      toggle: { x: x + 44, y, w: 36, h: 22 },
      next: { x: x + 88, y, w: 36, h: 22 },
    };
  }

  private music(ctx: CanvasRenderingContext2D, r: Rect, m: MusicView, grabbed: boolean, targets: HitTarget[]): void {
    const color = grabbed ? HOT : CYAN;
    this.headerNote(ctx, r, m.playing ? '● TOCANDO' : '❚❚ PAUSADO', m.playing ? OK : DIM);
    const cx = r.x + PAD;
    const cy = r.y + HEADER + 8;
    if (m.cover?.complete && m.cover.naturalWidth > 0) ctx.drawImage(m.cover, cx, cy, 60, 60);
    else {
      ctx.fillStyle = FAINT;
      ctx.fillRect(cx, cy, 60, 60);
    }
    const tx = r.x + 84;
    const tw = r.w - 84 - PAD;
    ctx.textAlign = 'left';
    ctx.font = mono(13);
    ctx.fillStyle = TEXT;
    ctx.fillText(ellipsize(ctx, m.name, tw), tx, cy + 13);
    ctx.font = mono(11);
    ctx.fillStyle = DIM;
    ctx.fillText(ellipsize(ctx, m.artist, tw), tx, cy + 29);

    const icon = { previous: '⏮', toggle: m.playing ? '❚❚' : '▶', next: '⏭' };
    for (const [name, b] of Object.entries(Panels.musicButtons(r)) as Array<[MusicButton, Rect]>) {
      ctx.strokeStyle = FAINT;
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
      ctx.fillStyle = CYAN;
      ctx.font = mono(12);
      ctx.textAlign = 'center';
      ctx.fillText(icon[name], b.x + b.w / 2, b.y + 15);
      targets.push({ id: `music:${name}`, rect: b });
    }
    ctx.font = mono(10);
    ctx.textAlign = 'right';
    ctx.fillStyle = DIM;
    ctx.fillText(`${formatTime(m.elapsedMs)} / ${formatTime(m.durationMs)}`, r.x + r.w - PAD, r.y + r.h - 12);
    const barW = r.w - 2 * PAD;
    ctx.fillStyle = FAINT;
    ctx.fillRect(r.x + PAD, r.y + r.h - 6, barW, 2);
    ctx.fillStyle = color;
    ctx.fillRect(r.x + PAD, r.y + r.h - 6, barW * Math.min(1, m.durationMs ? m.elapsedMs / m.durationMs : 0), 2);
  }

  private finance(ctx: CanvasRenderingContext2D, b: { x: number; y: number; w: number }, f: FinanceSummary, r: Rect): void {
    this.headerNote(ctx, r, f.month);
    this.row(ctx, b, 0, 'ENTROU', money(f.ganho), OK);
    this.row(ctx, b, 1, 'SAIU', money(f.fixo + f.variavel));
    this.row(ctx, b, 2, 'SOBRA', money(f.restante), f.restante >= 0 ? OK : BAD);
    this.row(ctx, b, 3, 'PENDENTE', money(f.pendente), f.pendente > 0 ? HOT : TEXT);
    this.row(ctx, b, 4, 'DÍVIDAS', money(f.dividasAbertas), f.dividasAbertas > 0 ? HOT : TEXT);
    this.row(ctx, b, 5, 'DEVENDO', f.devendo.map((p) => p.person).join(', ') || '—');
  }
}

import { dist, type Pt } from './geometry';
import type { Gesture } from './gestures';
import type { ShortcutPose } from './handactions';
import { matchPose, poseFeatures, type LearnedGesture } from './poses';

/**
 * O que os gestos significam. Recebe as mãos de cada frame e devolve eventos; quem executa é o
 * main.ts. Prioridade: duas palmas (parar tudo) > dedo nos lábios (silêncio) > modo mouse >
 * menu aberto > modo espera > o resto.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ControlHand {
  key: string;
  gesture: Gesture;
  stale: boolean;
  /** Em pixels da tela. */
  palm: Pt;
  tip: Pt;
  pinch: Pt;
  /** Base do indicador e do médio, normalizada (0..1) na imagem já espelhada: âncora do mouse no ar. */
  anchor: Pt;
  /** Pontos 3D da mão, para os gestos aprendidos. */
  world: Pt[];
}

export interface ControlContext {
  now: number;
  mouseMode: boolean;
  standby: boolean;
  /** Regiões do rosto na tela (null sem rosto visto há pouco). */
  mouth: Rect | null;
  ears: Rect[];
  chest: Rect | null;
  /** Palma acima desta altura (px) = mão levantada. */
  raiseY: number;
  /** O ponto está sobre um painel ou botão do HUD? (lá a pinça arrasta, não mexe no volume) */
  overUi: (p: Pt) => boolean;
  /** Área do visor de música, ou null. */
  music: Rect | null;
  learned: LearnedGesture[];
}

export type SwipeDir = 'left' | 'right' | 'up' | 'down';

export type ControlEvent =
  | { type: 'stopAll' }
  | { type: 'shush' }
  | { type: 'wave' }
  | { type: 'raise' }
  | { type: 'ear' }
  | { type: 'daySummary' }
  | { type: 'pose'; pose: ShortcutPose; at: Pt }
  | { type: 'learned'; gesture: LearnedGesture }
  | { type: 'palmHold'; at: Pt; hand: string }
  | { type: 'palmSwipe'; dir: 'left' | 'right'; overMusic: boolean }
  | { type: 'windowSwipe'; pose: 'victory' | 'three'; dir: SwipeDir }
  | { type: 'zoom'; phase: 'start' | 'move' | 'end'; ratio: number }
  | { type: 'volume'; phase: 'start' | 'move' | 'end'; dy: number; at: Pt }
  | { type: 'mouseMove'; x: number; y: number }
  | { type: 'mouseButton'; down: boolean }
  | { type: 'mouseScroll'; steps: number }
  | { type: 'mouseExit' }
  | { type: 'menuPick'; index: number }
  | { type: 'menuClose' };

/** Anel de progresso de um gesto sendo segurado (desenhado perto da mão). */
export interface ProgressMark {
  at: Pt;
  value: number;
  label: string;
  tone: 'cyan' | 'hot' | 'red';
}

export interface MenuState {
  center: Pt;
  hand: string;
  items: number;
  /** Item para onde a mão está apontando, ou -1. */
  hover: number;
  hoverSince: number;
  openedAt: number;
}

// Tempos (ms) e distâncias (px)
export const BOTH_PALMS_MS = 1000;
export const SHUSH_MS = 500;
export const RAISE_MS = 500;
export const EAR_MS = 600;
export const POSE_MS = 800;
export const PALM_HOLD_MS = 1000;
export const MOUSE_EXIT_FIST_MS = 1000;
export const MOUSE_LOST_MS = 3000;
export const MENU_PICK_MS = 400;
export const MENU_TIMEOUT_MS = 8000;
export const MENU_RADIUS = 120;
/** Quanto a mão pode se mexer e ainda contar como "parada". */
export const STILL_PX = 30;
export const SWIPE_SPEED = 1300;
export const SWIPE_COOLDOWN_MS = 1200;
/** O deslizar da palma espera um pouco: se a mão voltar, era um aceno. */
export const SWIPE_DELAY_MS = 350;
export const WAVE_WINDOW_MS = 1500;
export const WAVE_REVERSALS = 3;
export const WAVE_MIN_STROKE = 25;
export const SCROLL_STEP_PX = 40;
/** Parte da imagem da câmera que cobre a tela inteira no mouse no ar. */
export const MOUSE_MARGIN = 0.15;

const COOLDOWN: Record<string, number> = { raise: 5000, ear: 3000, daySummary: 5000, pose: 3000, learned: 3000, wave: 2500, stopAll: 2000, shush: 2000 };

const inRect = (p: Pt, r: Rect | null) => r !== null && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** Mapeia a âncora da mão (0..1) para a tela inteira, usando só o miolo da imagem. */
export const mouseTarget = (anchor: Pt): Pt => {
  const f = (v: number) => Math.min(1, Math.max(0, (v - MOUSE_MARGIN) / (1 - 2 * MOUSE_MARGIN)));
  return { x: f(anchor.x), y: f(anchor.y) };
};

/** Um gesto segurado: começa, acumula tempo enquanto a condição vale e dispara uma vez. */
class Hold {
  private since = -1;
  private start: Pt | null = null;
  private fired = false;

  /** Devolve o progresso (0..1) e se disparou neste frame. `at` = posição, para exigir mão parada. */
  update(active: boolean, now: number, ms: number, at: Pt | null = null, still = true): { progress: number; fire: boolean } {
    if (!active || (still && at && this.start && dist(at, this.start) > STILL_PX)) {
      this.reset();
      if (!active) return { progress: 0, fire: false };
    }
    if (this.since < 0) {
      this.since = now;
      this.start = at;
    }
    const progress = Math.min(1, (now - this.since) / ms);
    if (progress >= 1 && !this.fired) {
      this.fired = true;
      return { progress, fire: true };
    }
    return { progress: this.fired ? 0 : progress, fire: false };
  }

  reset(): void {
    this.since = -1;
    this.start = null;
    this.fired = false;
  }
}

interface Trail {
  t: number;
  x: number;
  y: number;
}

export class HandControl {
  menu: MenuState | null = null;
  progress: ProgressMark[] = [];
  /** Volume no ar em andamento (para a barra perto da mão). */
  volumeAt: Pt | null = null;
  zooming = false;

  private holds = new Map<string, Hold>();
  private cooldownUntil = new Map<string, number>();
  private trails = new Map<string, Trail[]>();
  private lastSwipeAt = -Infinity;
  private pendingSwipe: { hand: string; dir: 'left' | 'right'; overMusic: boolean; at: number } | null = null;
  private volume: { hand: string; startY: number } | null = null;
  private zoom: { a: string; b: string; d0: number } | null = null;
  private mouseDown = false;
  private mouseHand: string | null = null;
  private lastHandAt = -Infinity;
  private scrollFrom: number | null = null;
  private pinchedBefore = new Set<string>();
  private learnedCandidate: string | null = null;

  private hold(key: string): Hold {
    let h = this.holds.get(key);
    if (!h) this.holds.set(key, (h = new Hold()));
    return h;
  }

  private ready(name: string, now: number): boolean {
    return now >= (this.cooldownUntil.get(name) ?? -Infinity);
  }

  private cool(name: string, now: number): void {
    this.cooldownUntil.set(name, now + (COOLDOWN[name] ?? 1000));
  }

  openMenu(center: Pt, items: number, hand: string, now: number): void {
    this.menu = { center, hand, items, hover: -1, hoverSince: now, openedAt: now };
  }

  closeMenu(): void {
    this.menu = null;
  }

  /** Cancela tudo o que estava em andamento (parar tudo, sair do modo mouse...). */
  cancel(): ControlEvent[] {
    const events: ControlEvent[] = [];
    if (this.mouseDown) events.push({ type: 'mouseButton', down: false });
    if (this.volume) events.push({ type: 'volume', phase: 'end', dy: 0, at: this.volumeAt ?? { x: 0, y: 0 } });
    if (this.zoom) events.push({ type: 'zoom', phase: 'end', ratio: 1 });
    this.mouseDown = false;
    this.volume = null;
    this.volumeAt = null;
    this.zoom = null;
    this.zooming = false;
    this.menu = null;
    this.pendingSwipe = null;
    this.scrollFrom = null;
    for (const h of this.holds.values()) h.reset();
    return events;
  }

  update(all: ControlHand[], ctx: ControlContext): ControlEvent[] {
    const { now } = ctx;
    const hands = all.filter((h) => !h.stale);
    const events: ControlEvent[] = [];
    this.progress = [];
    if (hands.length) this.lastHandAt = now;
    this.updateTrails(hands, now);

    // 0. Duas palmas abertas paradas: parar tudo (vale em qualquer modo)
    const palms = hands.filter((h) => h.gesture === 'open');
    const both = palms.length >= 2;
    const mid = both ? { x: (palms[0].palm.x + palms[1].palm.x) / 2, y: (palms[0].palm.y + palms[1].palm.y) / 2 } : null;
    const stop = this.hold('stopAll').update(both && this.ready('stopAll', now), now, BOTH_PALMS_MS, mid);
    if (both && stop.progress > 0.15) {
      for (const p of palms.slice(0, 2)) this.progress.push({ at: p.palm, value: stop.progress, label: 'PARAR TUDO', tone: 'red' });
    }
    if (stop.fire) {
      this.cool('stopAll', now);
      return [...this.cancel(), { type: 'stopAll' }];
    }

    // 0b. Dedo nos lábios: silêncio
    const shusher = ctx.standby ? undefined : hands.find((h) => h.gesture === 'point' && inRect(h.tip, ctx.mouth));
    const shush = this.hold('shush').update(Boolean(shusher) && this.ready('shush', now), now, SHUSH_MS);
    if (shusher && shush.progress > 0.2) this.progress.push({ at: shusher.tip, value: shush.progress, label: 'SILÊNCIO', tone: 'cyan' });
    if (shush.fire) {
      this.cool('shush', now);
      events.push({ type: 'shush' });
      return events;
    }
    if (shusher) return events;

    // 1. Mouse no ar
    if (ctx.mouseMode) return [...events, ...this.mouse(hands, ctx)];
    if (this.mouseDown) {
      this.mouseDown = false;
      events.push({ type: 'mouseButton', down: false });
    }
    this.mouseHand = null;

    // 2. Menu na mão aberto
    if (this.menu) return [...events, ...this.updateMenu(hands, now)];

    // Aceno (tchau / acordar) vale no modo normal e no modo espera
    const waver = hands.find((h) => this.isWaving(h, now));
    if (waver && this.ready('wave', now)) {
      this.cool('wave', now);
      this.pendingSwipe = null;
      this.lastSwipeAt = now;
      events.push({ type: 'wave' });
      return events;
    }

    // Mão levantada (ouvir; no modo espera, acorda)
    const raiser = hands.find((h) => h.gesture === 'open' && h.palm.y < ctx.raiseY);
    const raise = this.hold('raise').update(Boolean(raiser) && !both && this.ready('raise', now), now, RAISE_MS);
    if (raiser && raise.progress > 0.2) this.progress.push({ at: raiser.palm, value: raise.progress, label: ctx.standby ? 'ACORDAR' : 'OUVIR', tone: 'cyan' });
    if (raise.fire) {
      this.cool('raise', now);
      events.push({ type: 'raise' });
    }

    // 3. Modo espera: só valem aceno, mão levantada e as duas palmas
    if (ctx.standby) return events;

    // Mão na orelha: repete
    const ear = hands.find((h) => (h.gesture === 'open' || h.gesture === 'none') && ctx.ears.some((r) => inRect(h.palm, r)));
    const earHold = this.hold('ear').update(Boolean(ear) && this.ready('ear', now), now, EAR_MS);
    if (ear && earHold.progress > 0.2) this.progress.push({ at: ear.palm, value: earHold.progress, label: 'REPETIR', tone: 'cyan' });
    if (earHold.fire) {
      this.cool('ear', now);
      events.push({ type: 'ear' });
    }

    // Polegar no peito: resumo do dia
    const chest = hands.find((h) => h.gesture === 'thumbSide' && inRect(h.palm, ctx.chest));
    const chestHold = this.hold('daySummary').update(Boolean(chest) && this.ready('daySummary', now), now, POSE_MS, chest?.palm ?? null);
    if (chest && chestHold.progress > 0.15) this.progress.push({ at: chest.palm, value: chestHold.progress, label: 'MEU DIA', tone: 'hot' });
    if (chestHold.fire) {
      this.cool('daySummary', now);
      events.push({ type: 'daySummary' });
    }

    // Poses-atalho (🤘, 🤙)
    for (const pose of ['rock', 'call'] as const) {
      const h = hands.find((x) => x.gesture === pose);
      const r = this.hold(`pose:${pose}`).update(Boolean(h) && this.ready('pose', now), now, POSE_MS, h?.palm ?? null);
      if (h && r.progress > 0.15) this.progress.push({ at: h.palm, value: r.progress, label: pose === 'rock' ? '🤘' : '🤙', tone: 'hot' });
      if (r.fire && h) {
        this.cool('pose', now);
        events.push({ type: 'pose', pose, at: h.palm });
      }
    }

    // Gestos aprendidos: só poses que não são nenhum gesto fixo
    const unknown = ctx.learned.length ? hands.find((h) => h.gesture === 'none') : undefined;
    const match = unknown ? matchPose(poseFeatures(unknown.world), ctx.learned) : null;
    if (match?.id !== this.learnedCandidate) this.hold('learned').reset();
    this.learnedCandidate = match?.id ?? null;
    const learned = this.hold('learned').update(Boolean(match) && this.ready('learned', now), now, POSE_MS, unknown?.palm ?? null);
    if (match && unknown && learned.progress > 0.15) this.progress.push({ at: unknown.palm, value: learned.progress, label: match.phrase.toUpperCase(), tone: 'hot' });
    if (learned.fire && match) {
      this.cool('learned', now);
      events.push({ type: 'learned', gesture: match });
    }

    // Duas pinças: ampliar/reduzir o HUD
    const pinching = hands.filter((h) => h.gesture === 'pinch');
    if (pinching.length >= 2) {
      const [a, b] = pinching;
      const d = Math.max(1, dist(a.pinch, b.pinch));
      if (this.volume) {
        events.push({ type: 'volume', phase: 'end', dy: 0, at: this.volumeAt! });
        this.volume = null;
        this.volumeAt = null;
      }
      if (!this.zoom || this.zoom.a !== a.key || this.zoom.b !== b.key) {
        this.zoom = { a: a.key, b: b.key, d0: d };
        this.zooming = true;
        events.push({ type: 'zoom', phase: 'start', ratio: 1 });
      } else events.push({ type: 'zoom', phase: 'move', ratio: d / this.zoom.d0 });
    } else if (this.zoom) {
      this.zoom = null;
      this.zooming = false;
      events.push({ type: 'zoom', phase: 'end', ratio: 1 });
    }

    // Uma pinça fora dos painéis: volume no ar
    if (!this.zoom) {
      const one = pinching.length === 1 ? pinching[0] : null;
      if (this.volume) {
        const h = hands.find((x) => x.key === this.volume!.hand && x.gesture === 'pinch');
        if (!h) {
          events.push({ type: 'volume', phase: 'end', dy: 0, at: this.volumeAt! });
          this.volume = null;
          this.volumeAt = null;
        } else {
          this.volumeAt = h.pinch;
          events.push({ type: 'volume', phase: 'move', dy: this.volume.startY - h.pinch.y, at: h.pinch });
        }
      } else if (one && !this.pinchedBefore.has(one.key) && !ctx.overUi(one.pinch)) {
        this.volume = { hand: one.key, startY: one.pinch.y };
        this.volumeAt = one.pinch;
        events.push({ type: 'volume', phase: 'start', dy: 0, at: one.pinch });
      }
    }
    this.pinchedBefore = new Set(pinching.map((h) => h.key));

    // Palma parada: o main decide (calar, música ou abrir o menu). Não dispara com a outra mão também aberta
    const palm = palms.length === 1 ? palms[0] : null;
    const zone = palm && (palm.palm.y < ctx.raiseY || ctx.ears.some((r) => inRect(palm.palm, r)));
    const palmHold = this.hold('palmHold').update(Boolean(palm) && !zone, now, PALM_HOLD_MS, palm?.palm ?? null);
    if (palm && !zone && palmHold.progress > 0.3) this.progress.push({ at: palm.palm, value: palmHold.progress, label: 'MENU', tone: 'cyan' });
    if (palmHold.fire && palm) events.push({ type: 'palmHold', at: palm.palm, hand: palm.key });

    events.push(...this.swipes(hands, ctx));
    return events;
  }

  /** Guarda as últimas posições de cada palma (para deslizar e acenar). */
  private updateTrails(hands: ControlHand[], now: number): void {
    for (const key of this.trails.keys()) if (!hands.some((h) => h.key === key)) this.trails.delete(key);
    for (const h of hands) {
      const t = this.trails.get(h.key) ?? [];
      t.push({ t: now, x: h.palm.x, y: h.palm.y });
      while (t.length && now - t[0].t > WAVE_WINDOW_MS) t.shift();
      this.trails.set(h.key, t);
    }
  }

  /** Aceno: a palma vai e volta na horizontal várias vezes, sem subir nem descer muito. */
  private isWaving(h: ControlHand, now: number): boolean {
    if (h.gesture !== 'open' && h.gesture !== 'none') return false;
    const t = (this.trails.get(h.key) ?? []).filter((p) => now - p.t <= WAVE_WINDOW_MS);
    return countReversals(t) >= WAVE_REVERSALS;
  }

  private swipes(hands: ControlHand[], ctx: ControlContext): ControlEvent[] {
    const { now } = ctx;
    const events: ControlEvent[] = [];
    // Deslizar da palma esperando para ver se não era aceno
    if (this.pendingSwipe && now - this.pendingSwipe.at >= SWIPE_DELAY_MS) {
      const { hand, dir, overMusic, at } = this.pendingSwipe;
      this.pendingSwipe = null;
      // A mão voltou logo depois: é o começo de um aceno, não um deslizar
      const since = (this.trails.get(hand) ?? []).filter((p) => p.t >= at - 150);
      if (countReversals(since) === 0) events.push({ type: 'palmSwipe', dir, overMusic });
    }
    if (now - this.lastSwipeAt < SWIPE_COOLDOWN_MS) return events;
    for (const h of hands) {
      const t = this.trails.get(h.key) ?? [];
      if (t.length < 2) continue;
      const a = t[t.length - 2];
      const b = t[t.length - 1];
      const dt = (b.t - a.t) / 1000;
      if (dt <= 0 || dt > 0.2) continue;
      const vx = (b.x - a.x) / dt;
      const vy = (b.y - a.y) / dt;
      const horizontal = Math.abs(vx) > SWIPE_SPEED && Math.abs(vy) < Math.abs(vx) * 0.6;
      const vertical = Math.abs(vy) > SWIPE_SPEED && Math.abs(vx) < Math.abs(vy) * 0.6;
      if (h.gesture === 'victory' || h.gesture === 'three') {
        if (!horizontal && !(vertical && h.gesture === 'victory')) continue;
        const dir: SwipeDir = horizontal ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
        this.lastSwipeAt = now;
        events.push({ type: 'windowSwipe', pose: h.gesture, dir });
        break;
      }
      if ((h.gesture === 'open' || h.gesture === 'none') && horizontal && h.key !== this.volume?.hand) {
        this.lastSwipeAt = now;
        const m = ctx.music;
        const margin = 80;
        const overMusic = m !== null && inRect(h.palm, { x: m.x - margin, y: m.y - margin, w: m.w + 2 * margin, h: m.h + 2 * margin });
        this.pendingSwipe = { hand: h.key, dir: vx > 0 ? 'right' : 'left', overMusic, at: now };
        break;
      }
    }
    return events;
  }

  private mouse(hands: ControlHand[], ctx: ControlContext): ControlEvent[] {
    const { now } = ctx;
    const events: ControlEvent[] = [];
    if (now - this.lastHandAt > MOUSE_LOST_MS) return [...this.cancel(), { type: 'mouseExit' }];
    const hand = hands.find((h) => h.key === this.mouseHand) ?? hands[0];
    if (!hand) {
      if (this.mouseDown) {
        this.mouseDown = false;
        events.push({ type: 'mouseButton', down: false });
      }
      return events;
    }
    this.mouseHand = hand.key;
    // Punho fechado por 1 s: sai do modo mouse
    const exit = this.hold('mouseExit').update(hand.gesture === 'fist', now, MOUSE_EXIT_FIST_MS);
    if (hand.gesture === 'fist' && exit.progress > 0.2) this.progress.push({ at: hand.palm, value: exit.progress, label: 'SAIR DO MOUSE', tone: 'hot' });
    if (exit.fire) return [...this.cancel(), { type: 'mouseExit' }];

    const target = mouseTarget(hand.anchor);
    if (hand.gesture === 'victory') {
      // ✌ subindo ou descendo: rola a página (o cursor fica parado)
      if (this.scrollFrom === null) this.scrollFrom = hand.palm.y;
      const steps = Math.trunc((this.scrollFrom - hand.palm.y) / SCROLL_STEP_PX);
      if (steps !== 0) {
        this.scrollFrom -= steps * SCROLL_STEP_PX;
        events.push({ type: 'mouseScroll', steps });
      }
    } else {
      this.scrollFrom = null;
      events.push({ type: 'mouseMove', x: target.x, y: target.y });
    }
    const pinch = hand.gesture === 'pinch';
    if (pinch !== this.mouseDown) {
      this.mouseDown = pinch;
      events.push({ type: 'mouseButton', down: pinch });
    }
    return events;
  }

  private updateMenu(hands: ControlHand[], now: number): ControlEvent[] {
    const menu = this.menu!;
    const hand = hands.find((h) => h.key === menu.hand);
    if (!hand || hand.gesture === 'fist' || now - menu.openedAt > MENU_TIMEOUT_MS) {
      this.menu = null;
      return [{ type: 'menuClose' }];
    }
    const dx = hand.palm.x - menu.center.x;
    const dy = hand.palm.y - menu.center.y;
    const hover = Math.hypot(dx, dy) > MENU_RADIUS * 0.55 ? menuIndexAt(dx, dy, menu.items) : -1;
    if (hover !== menu.hover) {
      menu.hover = hover;
      menu.hoverSince = now;
    }
    if (hover >= 0) {
      const value = Math.min(1, (now - menu.hoverSince) / MENU_PICK_MS);
      if (value >= 1) {
        this.menu = null;
        return [{ type: 'menuPick', index: hover }];
      }
    }
    return [];
  }
}

/** Item do menu circular na direção (dx, dy). O item 0 fica em cima e os outros seguem no sentido horário. */
export function menuIndexAt(dx: number, dy: number, items: number): number {
  const angle = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  return Math.round(angle / ((Math.PI * 2) / items)) % items;
}

/** Posição do item i do menu em volta do centro. */
export function menuItemPosition(center: Pt, i: number, items: number, radius = MENU_RADIUS): Pt {
  const angle = (i / items) * Math.PI * 2 - Math.PI / 2;
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
}

/** Quantas vezes a palma trocou de direção na horizontal (ignorando tremidas pequenas e movimento vertical). */
export function countReversals(trail: Array<{ x: number; y: number }>): number {
  if (trail.length < 3) return 0;
  const xs = trail.map((p) => p.x);
  const ys = trail.map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  if (width < WAVE_MIN_STROKE * 2 || height > width * 0.6) return 0;
  let reversals = 0;
  let dir = 0;
  let anchor = xs[0];
  for (const x of xs) {
    const d = x - anchor;
    if (Math.abs(d) < WAVE_MIN_STROKE) continue;
    const s = Math.sign(d);
    if (dir !== 0 && s !== dir) reversals++;
    dir = s;
    anchor = x;
  }
  return reversals;
}

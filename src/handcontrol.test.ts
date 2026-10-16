import { describe, expect, it } from 'vitest';
import type { Pt } from './geometry';
import type { Gesture } from './gestures';
import { countReversals, HandControl, menuIndexAt, mouseTarget, type ControlContext, type ControlEvent, type ControlHand } from './handcontrol';

const FRAME = 33;

function hand(key: string, gesture: Gesture, palm: Pt, extra: Partial<ControlHand> = {}): ControlHand {
  return { key, gesture, stale: false, palm, tip: palm, pinch: palm, anchor: { x: 0.5, y: 0.5 }, world: [], ...extra };
}

function ctx(now: number, extra: Partial<ControlContext> = {}): ControlContext {
  return {
    now,
    mouseMode: false,
    standby: false,
    mouth: { x: 900, y: 300, w: 120, h: 60 },
    ears: [{ x: 700, y: 150, w: 120, h: 150 }],
    chest: { x: 760, y: 450, w: 400, h: 300 },
    raiseY: 100,
    overUi: () => false,
    music: null,
    learned: [],
    ...extra,
  };
}

/** Roda `frames` quadros com as mesmas mãos (ou uma função das mãos pelo número do quadro) e junta os eventos. */
function run(c: HandControl, frames: number, hands: (i: number) => ControlHand[], extra: Partial<ControlContext> = {}, start = 0): ControlEvent[] {
  const events: ControlEvent[] = [];
  for (let i = 0; i < frames; i++) events.push(...c.update(hands(i), ctx(start + i * FRAME, extra)));
  return events;
}

const types = (events: ControlEvent[]) => events.map((e) => e.type);

describe('duas palmas = parar tudo', () => {
  it('dispara com as duas mãos abertas paradas por 1 s, uma vez só', () => {
    const c = new HandControl();
    const events = run(c, 40, () => [hand('a', 'open', { x: 500, y: 500 }), hand('b', 'open', { x: 1300, y: 500 })]);
    expect(types(events).filter((t) => t === 'stopAll')).toHaveLength(1);
    expect(types(events)).not.toContain('palmHold');
  });

  it('não dispara com uma mão só nem com as mãos se mexendo', () => {
    expect(types(run(new HandControl(), 40, () => [hand('a', 'open', { x: 500, y: 500 })]))).not.toContain('stopAll');
    const moving = run(new HandControl(), 40, (i) => [hand('a', 'open', { x: 500 + i * 15, y: 500 }), hand('b', 'open', { x: 1300, y: 500 })]);
    expect(types(moving)).not.toContain('stopAll');
  });

  it('vale até no modo mouse, e solta o botão do mouse', () => {
    const c = new HandControl();
    run(c, 3, () => [hand('a', 'pinch', { x: 500, y: 500 })], { mouseMode: true });
    const events = run(c, 40, () => [hand('a', 'open', { x: 500, y: 500 }), hand('b', 'open', { x: 1300, y: 500 })], { mouseMode: true }, 200);
    expect(events).toContainEqual({ type: 'mouseButton', down: false });
    expect(types(events)).toContain('stopAll');
  });
});

describe('dedo nos lábios = silêncio', () => {
  it('apontando com a ponta do dedo na boca', () => {
    const shh = run(new HandControl(), 20, () => [hand('a', 'point', { x: 960, y: 420 }, { tip: { x: 960, y: 330 } })]);
    expect(types(shh)).toContain('shush');
    const away = run(new HandControl(), 20, () => [hand('a', 'point', { x: 500, y: 420 }, { tip: { x: 500, y: 330 } })]);
    expect(types(away)).not.toContain('shush');
  });
});

describe('modo mouse', () => {
  it('move, aperta com a pinça, rola com ✌ e sai com o punho', () => {
    const c = new HandControl();
    const move = run(c, 2, () => [hand('a', 'open', { x: 0, y: 0 }, { anchor: { x: 0.5, y: 0.5 } })], { mouseMode: true });
    expect(move).toContainEqual({ type: 'mouseMove', x: 0.5, y: 0.5 });
    const press = run(c, 2, () => [hand('a', 'pinch', { x: 0, y: 0 })], { mouseMode: true }, 100);
    expect(press).toContainEqual({ type: 'mouseButton', down: true });
    const release = run(c, 1, () => [hand('a', 'open', { x: 0, y: 0 })], { mouseMode: true }, 200);
    expect(release).toContainEqual({ type: 'mouseButton', down: false });
    const scroll = run(c, 10, (i) => [hand('a', 'victory', { x: 0, y: 500 - i * 10 })], { mouseMode: true }, 300);
    expect(scroll.filter((e) => e.type === 'mouseScroll').length).toBeGreaterThan(0);
    const exit = run(c, 40, () => [hand('a', 'fist', { x: 0, y: 0 })], { mouseMode: true }, 700);
    expect(types(exit)).toContain('mouseExit');
  });

  it('sai sozinho se a mão sumir por 3 s', () => {
    const c = new HandControl();
    run(c, 1, () => [hand('a', 'open', { x: 0, y: 0 })], { mouseMode: true });
    expect(types(run(c, 1, () => [], { mouseMode: true }, 3500))).toContain('mouseExit');
  });

  it('o miolo da câmera cobre a tela inteira', () => {
    expect(mouseTarget({ x: 0.15, y: 0.85 })).toEqual({ x: 0, y: 1 });
    expect(mouseTarget({ x: 0, y: 1 })).toEqual({ x: 0, y: 1 });
  });
});

describe('menu na mão', () => {
  it('palma parada pede o menu; levar a mão para um item e segurar escolhe', () => {
    const c = new HandControl();
    const hold = run(c, 40, () => [hand('a', 'open', { x: 500, y: 500 })]);
    const ev = hold.find((e) => e.type === 'palmHold');
    expect(ev).toBeDefined();
    c.openMenu({ x: 500, y: 500 }, 6, 'a', 2000);
    // Item 0 fica em cima
    const pick = run(c, 20, () => [hand('a', 'open', { x: 500, y: 380 })], {}, 2000);
    expect(pick).toContainEqual({ type: 'menuPick', index: 0 });
  });

  it('punho fecha o menu', () => {
    const c = new HandControl();
    c.openMenu({ x: 500, y: 500 }, 6, 'a', 0);
    expect(types(run(c, 1, () => [hand('a', 'fist', { x: 500, y: 500 })]))).toContain('menuClose');
  });

  it('índice pela direção', () => {
    expect(menuIndexAt(0, -100, 6)).toBe(0);
    expect(menuIndexAt(100, 0, 4)).toBe(1);
    expect(menuIndexAt(0, 100, 4)).toBe(2);
    expect(menuIndexAt(-100, 0, 4)).toBe(3);
  });
});

describe('aceno e deslizar', () => {
  const wave = (i: number) => [hand('a', 'open', { x: 800 + Math.sin(i * 0.9) * 80, y: 500 })];

  it('vaivém da mão aberta = aceno', () => {
    expect(types(run(new HandControl(), 40, wave))).toContain('wave');
  });

  it('um deslizar só não é aceno e vira palmSwipe depois do atraso', () => {
    const events = run(new HandControl(), 25, (i) => [hand('a', 'open', { x: 400 + Math.min(i, 6) * 70, y: 500 })]);
    expect(types(events)).not.toContain('wave');
    expect(events.filter((e) => e.type === 'palmSwipe')).toEqual([{ type: 'palmSwipe', dir: 'right', overMusic: false }]);
  });

  it('o começo de um aceno não vira deslizar', () => {
    expect(types(run(new HandControl(), 40, wave))).not.toContain('palmSwipe');
  });

  it('✌ e três dedos deslizando trocam janelas e áreas de trabalho', () => {
    const v = run(new HandControl(), 4, (i) => [hand('a', 'victory', { x: 400 + i * 70, y: 500 })]);
    expect(v).toContainEqual({ type: 'windowSwipe', pose: 'victory', dir: 'right' });
    const up = run(new HandControl(), 4, (i) => [hand('a', 'victory', { x: 400, y: 600 - i * 70 })]);
    expect(up).toContainEqual({ type: 'windowSwipe', pose: 'victory', dir: 'up' });
    const three = run(new HandControl(), 4, (i) => [hand('a', 'three', { x: 900 - i * 70, y: 500 })]);
    expect(three).toContainEqual({ type: 'windowSwipe', pose: 'three', dir: 'left' });
  });

  it('countReversals ignora tremidas e movimento vertical', () => {
    expect(countReversals([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }])).toBe(0);
    expect(countReversals([{ x: 0, y: 0 }, { x: 60, y: 200 }, { x: 0, y: 0 }, { x: 60, y: 200 }])).toBe(0);
  });
});

describe('outros gestos', () => {
  it('mão levantada = ouvir; no modo espera, só ela, o aceno e as duas palmas valem', () => {
    expect(types(run(new HandControl(), 20, () => [hand('a', 'open', { x: 900, y: 60 })]))).toContain('raise');
    const standby = run(new HandControl(), 40, () => [hand('a', 'rock', { x: 900, y: 600 })], { standby: true });
    expect(types(standby)).not.toContain('pose');
  });

  it('mão na orelha = repetir', () => {
    expect(types(run(new HandControl(), 25, () => [hand('a', 'none', { x: 760, y: 220 })]))).toContain('ear');
  });

  it('polegar de lado no peito = resumo do dia; fora do peito não', () => {
    expect(types(run(new HandControl(), 30, () => [hand('a', 'thumbSide', { x: 960, y: 600 })]))).toContain('daySummary');
    expect(types(run(new HandControl(), 30, () => [hand('a', 'thumbSide', { x: 200, y: 600 })]))).not.toContain('daySummary');
  });

  it('🤘 segurado dispara a pose-atalho', () => {
    const events = run(new HandControl(), 30, () => [hand('a', 'rock', { x: 900, y: 600 })]);
    expect(events.filter((e) => e.type === 'pose')).toEqual([{ type: 'pose', pose: 'rock', at: { x: 900, y: 600 } }]);
  });

  it('duas pinças = zoom; uma pinça fora dos painéis = volume', () => {
    const zoom = run(new HandControl(), 10, (i) => [hand('a', 'pinch', { x: 800 - i * 10, y: 500 }), hand('b', 'pinch', { x: 1000 + i * 10, y: 500 })]);
    const last = zoom.filter((e) => e.type === 'zoom').pop() as { ratio: number };
    expect(last.ratio).toBeGreaterThan(1.3);
    const volume = run(new HandControl(), 10, (i) => [hand('a', 'pinch', { x: 800, y: 600 - i * 10 })]);
    const v = volume.filter((e) => e.type === 'volume').pop() as { dy: number };
    expect(v.dy).toBeCloseTo(90);
    // Pinça sobre um painel: é arrastar, não volume
    const drag = run(new HandControl(), 5, () => [hand('a', 'pinch', { x: 800, y: 600 })], { overUi: () => true });
    expect(types(drag)).not.toContain('volume');
  });
});

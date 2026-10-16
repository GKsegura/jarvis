import { describe, expect, it } from 'vitest';
import { canvasScale, frameInterval, handInterval, type Activity } from './budget';

const base: Activity = { hands: false, sinceHandsMs: 0, interacting: false, standby: false, away: false, hidden: false };
const with_ = (a: Partial<Activity>): Activity => ({ ...base, ...a });

describe('handInterval', () => {
  it('detecta ~30 vezes por segundo com mão na câmera ou interagindo', () => {
    expect(handInterval(with_({ hands: true }))).toBe(33);
    expect(handInterval(with_({ interacting: true, sinceHandsMs: 99999 }))).toBe(33);
  });

  it('mantém a taxa por alguns segundos depois que a mão some e depois desacelera', () => {
    expect(handInterval(with_({ sinceHandsMs: 1000 }))).toBe(33);
    expect(handInterval(with_({ sinceHandsMs: 10000 }))).toBe(100);
  });

  it('fica bem lento em espera, ausente ou janela oculta, mas não para (o aceno acorda)', () => {
    expect(handInterval(with_({ standby: true, sinceHandsMs: 10000 }))).toBe(250);
    expect(handInterval(with_({ away: true, sinceHandsMs: 10000 }))).toBe(500);
    expect(handInterval(with_({ hidden: true, sinceHandsMs: 10000 }))).toBe(500);
  });
});

describe('frameInterval', () => {
  it('não limita o HUD quando há mão ou interação', () => {
    expect(frameInterval(with_({ hands: true }))).toBe(0);
    expect(frameInterval(with_({ interacting: true }))).toBe(0);
  });

  it('limita a ~30 fps parado, ~15 em espera e ~10 ausente ou oculto', () => {
    expect(frameInterval(base)).toBe(33);
    expect(frameInterval(with_({ standby: true }))).toBe(66);
    expect(frameInterval(with_({ away: true }))).toBe(100);
    expect(frameInterval(with_({ hidden: true }))).toBe(100);
  });
});

describe('canvasScale', () => {
  it('usa a densidade da tela, entre 1 e 1,5', () => {
    expect(canvasScale(1)).toBe(1);
    expect(canvasScale(1.25)).toBe(1.25);
    expect(canvasScale(2)).toBe(1.5);
    expect(canvasScale(3)).toBe(1.5);
    expect(canvasScale(0.5)).toBe(1);
  });
});

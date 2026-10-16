/**
 * Ações dos atalhos de mão (menu na mão, poses-atalho e gestos aprendidos), escritas como texto
 * no jarvis.config.json: "play:Back in Black", "open:spotify", "timer:25", "command:weather"...
 * Este arquivo também é usado pelo servidor para validar o config.
 */
export type HandAction =
  | { kind: 'play'; query: string }
  | { kind: 'music'; action: 'pause' | 'resume' | 'next' | 'previous' }
  | { kind: 'open' | 'focus' | 'run'; id: string }
  | { kind: 'timer'; minutes: number }
  | { kind: 'command'; command: string }
  | { kind: 'mouse' }
  | { kind: 'say'; text: string };

/** Um atalho com nome curto (aparece no menu e perto da mão) e a ação. */
export interface Shortcut {
  label: string;
  action: string;
}

/** Poses que podem ter atalho no config. As outras já têm função fixa (✌ e 3 dedos deslizam, joinha confirma...). */
export const SHORTCUT_POSES = ['rock', 'call'] as const;
export type ShortcutPose = (typeof SHORTCUT_POSES)[number];

export const MAX_MENU_ITEMS = 8;
const MAX_LABEL = 24;
const MAX_ACTION = 200;

export function parseHandAction(raw: string): HandAction | null {
  if (typeof raw !== 'string' || raw.length > MAX_ACTION) return null;
  const s = raw.trim();
  const i = s.indexOf(':');
  const name = (i < 0 ? s : s.slice(0, i)).toLowerCase();
  const arg = i < 0 ? '' : s.slice(i + 1).trim();
  switch (name) {
    case 'play':
      return arg ? { kind: 'play', query: arg } : null;
    case 'pause':
    case 'resume':
    case 'next':
    case 'previous':
      return arg ? null : { kind: 'music', action: name };
    case 'open':
    case 'focus':
    case 'run':
      return /^[a-z0-9-]+$/.test(arg) ? { kind: name, id: arg } : null;
    case 'timer': {
      const minutes = Number(arg.replace(',', '.'));
      return minutes > 0 && minutes <= 24 * 60 ? { kind: 'timer', minutes } : null;
    }
    case 'command':
      return /^[a-zA-Z]+$/.test(arg) ? { kind: 'command', command: arg } : null;
    case 'mouse':
      return arg ? null : { kind: 'mouse' };
    case 'say':
      return arg ? { kind: 'say', text: arg } : null;
    default:
      return null;
  }
}

export const isShortcut = (v: unknown): v is Shortcut => {
  const s = v as Shortcut;
  return typeof s?.label === 'string' && s.label.trim().length > 0 && s.label.length <= MAX_LABEL && parseHandAction(s.action) !== null;
};

/** Menu e poses do jarvis.config.json, descartando o que estiver malformado. */
export function parseShortcuts(raw: { handMenu?: unknown; poses?: unknown }): { handMenu: Shortcut[]; poses: Partial<Record<ShortcutPose, Shortcut>> } {
  const handMenu = (Array.isArray(raw.handMenu) ? raw.handMenu : []).filter(isShortcut).slice(0, MAX_MENU_ITEMS);
  const poses: Partial<Record<ShortcutPose, Shortcut>> = {};
  const rawPoses = (raw.poses ?? {}) as Record<string, unknown>;
  for (const pose of SHORTCUT_POSES) if (isShortcut(rawPoses[pose])) poses[pose] = rawPoses[pose] as Shortcut;
  return { handMenu, poses };
}

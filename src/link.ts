import type { CoreState } from './core';

/**
 * Ligação entre a janela principal do JARVIS e os painéis nas outras telas (BroadcastChannel:
 * funciona entre janelas do mesmo Chrome e do mesmo endereço). A principal manda o que só ela
 * sabe; os painéis buscam sozinhos no servidor o resto (sistema, clima, lembretes, projetos).
 */
export const LINK_CHANNEL = 'jarvis-link';

export interface LinkState {
  core: { state: CoreState; level: number };
  caption: string;
  transcript: string;
  status: Array<{ text: string; color?: string }>;
  /** Pode mostrar dados pessoais (lembretes, música)? Só com o dono confirmado e sem visita. */
  personal: boolean;
  music: {
    name: string;
    artist: string;
    playing: boolean;
    elapsedMs: number;
    durationMs: number;
    cover: string | null;
  } | null;
}

export type LinkMessage = { type: 'state'; state: LinkState; at: number };

export function openLink(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(LINK_CHANNEL);
}

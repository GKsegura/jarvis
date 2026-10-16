import { PointsFilter } from './filters';
import { dist, type Pt } from './geometry';
import type { TrackedHand } from './hands';

/** Por quanto tempo uma mão que sumiu da detecção continua valendo (posição congelada). */
export const LOST_GRACE_MS = 250;
/** Distância máxima (em coordenadas normalizadas do vídeo) para considerar que é a mesma mão. */
const MAX_MATCH_DIST = 0.25;

// Normalizado (0..1): ~1 unidade/s numa mão em movimento normal
const SCREEN_MIN_CUTOFF = 1.2;
const SCREEN_BETA = 20;
// Em metros, centrado na mão: só muda a forma da mão, então pode suavizar mais
const WORLD_MIN_CUTOFF = 1.5;
const WORLD_BETA = 40;

export interface StableHand {
  /** Identidade estável enquanto a mão estiver em cena ("h1", "h2"...). Não troca com o handedness. */
  id: string;
  landmarks: Pt[];
  world: Pt[];
  /** True quando a mão sumiu há pouco e está sendo mantida na última posição. */
  stale: boolean;
}

interface Track {
  id: string;
  landmarks: Pt[];
  world: Pt[];
  lastSeen: number;
  screenFilter: PointsFilter;
  worldFilter: PointsFilter;
}

const PALM = [0, 5, 9, 13, 17];

export function palmCenter(points: Pt[]): Pt {
  const sum = PALM.reduce((acc, i) => ({ x: acc.x + points[i].x, y: acc.y + points[i].y }), { x: 0, y: 0 });
  return { x: sum.x / PALM.length, y: sum.y / PALM.length };
}

/**
 * Dá identidade estável às mãos (casando cada detecção com a mão mais próxima do frame anterior),
 * suaviza os pontos e segura por um instante uma mão que o detector perdeu.
 */
export class HandStabilizer {
  private tracks: Track[] = [];
  private nextId = 1;

  update(detected: TrackedHand[], now: number): StableHand[] {
    // Casamento guloso pelo par mais próximo: evita que duas mãos troquem de identidade
    const pairs: Array<{ track: Track; index: number; d: number }> = [];
    detected.forEach((h, index) => {
      const center = palmCenter(h.landmarks);
      for (const track of this.tracks) {
        const d = dist(center, palmCenter(track.landmarks));
        if (d < MAX_MATCH_DIST) pairs.push({ track, index, d });
      }
    });
    pairs.sort((a, b) => a.d - b.d);

    const usedTracks = new Set<Track>();
    const assigned = new Map<number, Track>();
    for (const p of pairs) {
      if (usedTracks.has(p.track) || assigned.has(p.index)) continue;
      usedTracks.add(p.track);
      assigned.set(p.index, p.track);
    }

    detected.forEach((h, index) => {
      let track = assigned.get(index);
      if (!track) {
        track = {
          id: `h${this.nextId++}`,
          landmarks: h.landmarks,
          world: h.world,
          lastSeen: now,
          screenFilter: new PointsFilter(SCREEN_MIN_CUTOFF, SCREEN_BETA),
          worldFilter: new PointsFilter(WORLD_MIN_CUTOFF, WORLD_BETA),
        };
        this.tracks.push(track);
        usedTracks.add(track);
      }
      track.landmarks = track.screenFilter.filter(h.landmarks, now);
      track.world = track.worldFilter.filter(h.world, now);
      track.lastSeen = now;
    });

    this.tracks = this.tracks.filter((t) => usedTracks.has(t) || now - t.lastSeen <= LOST_GRACE_MS);
    return this.tracks.map((t) => ({ id: t.id, landmarks: t.landmarks, world: t.world, stale: !usedTracks.has(t) }));
  }
}

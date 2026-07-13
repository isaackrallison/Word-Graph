// Pure pieces of the map-style label placement (see scene/Labels.tsx):
// frequency tiers, screen-rect overlap, and the greedy non-overlapping
// selection. Kept free of three.js/React so they're unit-testable.

export const PAD_PX = 5; // breathing room between label rects

export interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const overlaps = (a: Rect, b: Rect) =>
  a.x0 < b.x1 + PAD_PX && a.x1 > b.x0 - PAD_PX && a.y0 < b.y1 + PAD_PX && a.y1 > b.y0 - PAD_PX;

/** Frequency boost: common words label earlier and slightly larger.
 *  Rank = index into the frequency-ordered word list. */
export function tier(rank: number): number {
  if (rank < 2_000) return 1.45;
  if (rank < 20_000) return 1.15;
  return 1.0;
}

export interface PlaceableLabel {
  score: number;
  rect: Rect;
  mustShow: boolean;
}

/**
 * Greedy placement: must-show labels first (always accepted, even past the
 * cap or overlapping), then best-score-first, skipping anything whose rect
 * collides with an accepted label. Sorts `candidates` in place.
 */
export function greedyPlace<T extends PlaceableLabel>(candidates: T[], maxLabels: number): T[] {
  candidates.sort((a, b) => Number(b.mustShow) - Number(a.mustShow) || b.score - a.score);
  const accepted: T[] = [];
  for (const c of candidates) {
    if (accepted.length >= maxLabels && !c.mustShow) break;
    if (!c.mustShow && accepted.some((a) => overlaps(a.rect, c.rect))) continue;
    accepted.push(c);
  }
  return accepted;
}

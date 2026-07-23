// Word-to-word "star trail": a semantic path between two words. We walk a
// straight line through the 300-dim word2vec space from one word's vector to the
// other and snap each sample to its nearest real word — the ordered, de-duped
// result is a chain of stepping-stone words ("cat → kitten → pet → … → dog").
// Linear interpolation is meaningful because coords are the raw vectors (no
// PCA), same reasoning as the word algebra.

import type { GraphData } from './data';
import { nearestNeighbors } from './project';

const ARROW_RE = /^\s*([a-z][a-z']*)\s*(?:->|→|\bto\b)\s*([a-z][a-z']*)\s*$/i;

/** Parse "cat -> dog", "cat → dog", or "cat to dog" → ["cat","dog"]; else null. */
export function parsePathExpression(input: string): [string, string] | null {
  const m = ARROW_RE.exec(input.trim().toLowerCase());
  if (!m) return null;
  if (m[1] === m[2]) return null;
  return [m[1], m[2]];
}

/**
 * Ordered word indices bridging `fromVec` → `toVec`. Samples the segment,
 * snaps each point to the nearest word, keeps first-seen order, and caps the
 * node count while always preserving the two endpoints.
 */
export function semanticPath(
  fromVec: Float32Array,
  toVec: Float32Array,
  data: GraphData,
  samples = 36,
  maxNodes = 16
): number[] {
  const { dims } = data;
  const tmp = new Float32Array(dims);
  const path: number[] = [];
  const seen = new Set<number>();
  for (let s = 0; s <= samples; s++) {
    const t = s / samples;
    for (let j = 0; j < dims; j++) tmp[j] = (1 - t) * fromVec[j] + t * toVec[j];
    const nn = nearestNeighbors(tmp, data, 1)[0];
    if (!nn || seen.has(nn.index)) continue;
    seen.add(nn.index);
    path.push(nn.index);
  }
  if (path.length <= maxNodes) return path;

  // Too many stops — keep both endpoints and evenly-spaced interior nodes.
  const kept = [path[0]];
  const interior = maxNodes - 2;
  for (let i = 1; i <= interior; i++) {
    kept.push(path[Math.round((i * (path.length - 1)) / (interior + 1))]);
  }
  kept.push(path[path.length - 1]);
  return kept;
}

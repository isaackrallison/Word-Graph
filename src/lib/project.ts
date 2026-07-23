// Project a raw embedding into the precomputed PCA space and find neighbors.
import type { GraphData } from './data';

/**
 * Coords are the raw word2vec vectors (no PCA), and /api/embed returns vectors
 * from the same word2vec table — so projection is the identity. Kept as a
 * function so callers stay agnostic to whether a reduction is in play.
 */
export function projectEmbedding(embedding: number[], data: GraphData): Float32Array {
  if (embedding.length !== data.dims) throw new Error(`expected ${data.dims}-dim embedding`);
  return Float32Array.from(embedding);
}

export interface Neighbor {
  index: number;
  similarity: number;
}

/**
 * Scene position for a new word: similarity-weighted centroid of its nearest
 * seed neighbors in the UMAP layout (UMAP has no out-of-sample projection).
 * Weights are sharpened so the closest neighbor dominates, with a small
 * offset so the marker never sits exactly on a seed point.
 */
export function placeByNeighbors(neighbors: Neighbor[], data: GraphData): [number, number, number] {
  const maxSim = Math.max(...neighbors.map((n) => n.similarity));
  let wSum = 0;
  const pos: [number, number, number] = [0, 0, 0];
  for (const n of neighbors) {
    // Sharp temperature: for novel words the runner-up neighbors are often
    // orthographic noise scattered across the layout — the top match should
    // dominate unless the similarities are a genuine near-tie.
    const w = Math.exp((n.similarity - maxSim) / 0.025);
    wSum += w;
    for (let a = 0; a < 3; a++) pos[a] += w * data.positions[n.index * 3 + a];
  }
  for (let a = 0; a < 3; a++) pos[a] /= wSum || 1;
  // Deterministic-ish jitter (~1 scene unit) to avoid z-fighting with seeds.
  for (let a = 0; a < 3; a++) pos[a] += Math.sin((a + 1) * 12.9898 + wSum * 78.233) * 0.8;
  return pos;
}

/** Top-k seed words by cosine similarity in the raw word2vec space. */
export function nearestNeighbors(vec: Float32Array, data: GraphData, k = 5): Neighbor[] {
  const { coords, dims, count } = data;
  let vn = 0;
  for (let j = 0; j < dims; j++) vn += vec[j] * vec[j];
  vn = Math.sqrt(vn) || 1;

  const best: Neighbor[] = [];
  for (let i = 0; i < count; i++) {
    let dot = 0;
    let rn = 0;
    const row = i * dims;
    for (let j = 0; j < dims; j++) {
      dot += coords[row + j] * vec[j];
      rn += coords[row + j] * coords[row + j];
    }
    const sim = dot / (Math.sqrt(rn) * vn || 1);
    if (best.length < k) {
      best.push({ index: i, similarity: sim });
      best.sort((a, b) => b.similarity - a.similarity);
    } else if (sim > best[k - 1].similarity) {
      best[k - 1] = { index: i, similarity: sim };
      best.sort((a, b) => b.similarity - a.similarity);
    }
  }
  return best;
}

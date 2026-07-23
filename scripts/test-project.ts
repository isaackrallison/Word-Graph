// Unit tests for the projection / nearest-neighbor / placement math.
//   npx tsx scripts/test-project.ts

import { nearestNeighbors, placeByNeighbors, projectEmbedding } from '../src/lib/project.ts';
import type { GraphData } from '../src/lib/data.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// Deterministic PRNG so failures are reproducible.
let seed = 42;
const rng = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31 - 0.5;

const DIMS = 16; // coords are the raw word2vec vectors — no separate PCA space
const COUNT = 300;

function makeData(): GraphData {
  const coords = Float32Array.from({ length: COUNT * DIMS }, rng);
  const positions = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++)
    for (let a = 0; a < 3; a++) positions[i * 3 + a] = coords[i * DIMS + a] * 50;
  return {
    words: Array.from({ length: COUNT }, (_, i) => ({ word: `w${i}`, cluster: i % 8 })),
    count: COUNT,
    dims: DIMS,
    coords,
    positions,
    cloudRadius: 50,
    regions: [],
  };
}
const data = makeData();

// --- projectEmbedding: identity (coords are the raw word2vec space) ---
{
  const e = Array.from({ length: DIMS }, rng);
  const got = projectEmbedding(e, data);
  let maxDiff = 0;
  for (let j = 0; j < DIMS; j++) maxDiff = Math.max(maxDiff, Math.abs(e[j] - got[j]));
  check('projection returns the vector unchanged', got.length === DIMS && maxDiff === 0);
  check('rejects wrong dimensionality', (() => { try { projectEmbedding([1, 2, 3], data); return false; } catch { return true; } })());
}

// --- linearity: P(a - b + c) == P(a) - P(b) + P(c) (the word-algebra premise) ---
{
  const a = Array.from({ length: DIMS }, rng);
  const b = Array.from({ length: DIMS }, rng);
  const c = Array.from({ length: DIMS }, rng);
  const combined = a.map((v, j) => v - b[j] + c[j]);
  const direct = projectEmbedding(combined, data);
  const pa = projectEmbedding(a, data);
  const pb = projectEmbedding(b, data);
  const pc = projectEmbedding(c, data);
  let maxDiff = 0;
  for (let i = 0; i < DIMS; i++) maxDiff = Math.max(maxDiff, Math.abs(direct[i] - (pa[i] - pb[i] + pc[i])));
  check('projection is linear (algebra premise)', maxDiff < 1e-4, `maxDiff ${maxDiff.toExponential(1)}`);
}

// --- nearestNeighbors: agrees with brute force, on several queries ---
{
  const cosine = (v: Float32Array, i: number) => {
    let dot = 0, vn = 0, rn = 0;
    for (let j = 0; j < DIMS; j++) {
      dot += v[j] * data.coords[i * DIMS + j];
      vn += v[j] * v[j];
      rn += data.coords[i * DIMS + j] ** 2;
    }
    return dot / (Math.sqrt(vn * rn) || 1);
  };
  let agree = true;
  for (let q = 0; q < 5; q++) {
    const v = Float32Array.from({ length: DIMS }, rng);
    const got = nearestNeighbors(v, data, 10).map((n) => n.index);
    const want = Array.from({ length: COUNT }, (_, i) => i)
      .sort((x, y) => cosine(v, y) - cosine(v, x))
      .slice(0, 10);
    if (got.join() !== want.join()) agree = false;
  }
  check('top-10 matches brute-force sort (5 random queries)', agree);
  const exact = nearestNeighbors(data.coords.slice(7 * DIMS, 8 * DIMS), data, 1);
  check('a word is its own nearest neighbor', exact[0].index === 7 && exact[0].similarity > 0.999);
}

// --- placeByNeighbors: sharp weighting snaps to a dominant top match ---
{
  const neighbors = [
    { index: 1, similarity: 0.9, word: 'w1' },
    { index: 2, similarity: 0.5, word: 'w2' },
    { index: 3, similarity: 0.45, word: 'w3' },
  ];
  const pos = placeByNeighbors(neighbors, data);
  const top = [data.positions[3], data.positions[4], data.positions[5]];
  const dTop = Math.hypot(pos[0] - top[0], pos[1] - top[1], pos[2] - top[2]);
  check('dominant neighbor pulls the placement to itself', dTop < 2.0, `dist ${dTop.toFixed(2)}`);

  const tie = [
    { index: 1, similarity: 0.7, word: 'w1' },
    { index: 2, similarity: 0.7, word: 'w2' },
  ];
  const posTie = placeByNeighbors(tie, data);
  const mid = [0, 1, 2].map((a) => (data.positions[3 + a] + data.positions[6 + a]) / 2);
  const dMid = Math.hypot(posTie[0] - mid[0], posTie[1] - mid[1], posTie[2] - mid[2]);
  check('near-tie lands near the midpoint', dMid < 2.0, `dist ${dMid.toFixed(2)}`);

  const again = placeByNeighbors(neighbors, data);
  check('placement is deterministic', again.every((v, i) => v === pos[i]));
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

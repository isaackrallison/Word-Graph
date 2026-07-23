// Unit tests for the semantic-path ("star trail") lib.
//   npx tsx scripts/test-path.ts

import { parsePathExpression, semanticPath } from '../src/lib/path.ts';
import type { GraphData } from '../src/lib/data.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// --- parsePathExpression ---
check('parses arrow', JSON.stringify(parsePathExpression('cat -> dog')) === '["cat","dog"]');
check('parses unicode arrow', JSON.stringify(parsePathExpression('cat → dog')) === '["cat","dog"]');
check('parses "to"', JSON.stringify(parsePathExpression('cat to dog')) === '["cat","dog"]');
check('case-insensitive', JSON.stringify(parsePathExpression('Cat To Dog')) === '["cat","dog"]');
check('rejects plain word', parsePathExpression('cat') === null);
check('rejects equation', parsePathExpression('king - man + woman') === null);
check('rejects same word', parsePathExpression('cat to cat') === null);
check('rejects three-part', parsePathExpression('cat to dog to bird') === null);

// --- semanticPath on a tiny synthetic space ---
// nearestNeighbors snaps by COSINE (direction), so words are placed on a
// semicircle: word i points at angle θ=π·i/(N-1). Distinct directions, and the
// chord between two words sweeps monotonically through the intermediate angles.
const DIMS = 3;
const COUNT = 40;
const coords = new Float32Array(COUNT * DIMS);
const positions = new Float32Array(COUNT * 3);
for (let i = 0; i < COUNT; i++) {
  const theta = (Math.PI * i) / (COUNT - 1);
  coords[i * DIMS] = Math.cos(theta);
  coords[i * DIMS + 1] = Math.sin(theta);
  positions[i * 3] = i;
}
const data: GraphData = {
  words: Array.from({ length: COUNT }, (_, i) => ({ word: `w${i}`, cluster: 0 })),
  count: COUNT,
  dims: DIMS,
  coords,
  positions,
  cloudRadius: COUNT,
  regions: [],
};

const from = coords.slice(5 * DIMS, 6 * DIMS); // w5
const to = coords.slice(30 * DIMS, 31 * DIMS); // w30
const path = semanticPath(from, to, data, 36, 16);

check('path starts at source', path[0] === 5, `first = ${path[0]}`);
check('path ends at target', path[path.length - 1] === 30, `last = ${path[path.length - 1]}`);
check('path has no duplicates', new Set(path).size === path.length);
check('path is monotonic along the line', path.every((v, i) => i === 0 || v > path[i - 1]));
check('path respects maxNodes cap', semanticPath(from, to, data, 200, 8).length <= 8);
check(
  'all path nodes lie between endpoints',
  path.every((v) => v >= 5 && v <= 30)
);

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

// Unit tests for the word-algebra module.
//   npx tsx scripts/test-algebra.ts

import { combine, equationNeighbors, parseExpression } from '../src/lib/algebra.ts';
import type { GraphData } from '../src/lib/data.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

// --- parser ---
{
  const t = parseExpression('king - man + woman')!;
  check(
    'parses classic equation',
    t.length === 3 &&
      t[0].word === 'king' && t[0].sign === 1 &&
      t[1].word === 'man' && t[1].sign === -1 &&
      t[2].word === 'woman' && t[2].sign === 1
  );
  check('unicode minus', parseExpression('king − man')![1].sign === -1);
  check('single word is not an equation', parseExpression('king') === null);
  check('plain phrase is not an equation', parseExpression('ice cream') === null);
  check('rejects leading operator', throws(() => parseExpression('- king + man')));
  check('rejects trailing operator', throws(() => parseExpression('king + man -')));
  check('rejects double operator', throws(() => parseExpression('king + - man')));
  check('rejects five terms', throws(() => parseExpression('a + b + c + d + e')));
  check('rejects junk token', throws(() => parseExpression('king + m4n')));
  check('case/whitespace tolerant', parseExpression('  King -  MAN ')![1].word === 'man');
}

// --- combine ---
{
  const v = combine(
    [new Float32Array([1, 2]), new Float32Array([0.5, 1]), new Float32Array([0, 3])],
    [1, -1, 1]
  );
  check('signed sum', Math.abs(v[0] - 0.5) < 1e-6 && Math.abs(v[1] - 4) < 1e-6);
}

// --- equationNeighbors exclusion ---
{
  // Tiny fake dataset: 6 words in 2-dim space; query vector points at "queen".
  const words = ['king', 'kings', 'queen', 'man', 'woman', 'throne'];
  const coords = new Float32Array([
    1, 0, // king
    0.99, 0.05, // kings
    0.9, 0.4, // queen
    0, 1, // man
    0.1, 0.95, // woman
    0.8, 0.5, // throne
  ]);
  const data = {
    words: words.map((w) => ({ word: w, cluster: 0 })),
    count: 6,
    dims: 2,
    coords,
    positions: new Float32Array(18),
    cloudRadius: 1,
  } as GraphData;

  const result = equationNeighbors(new Float32Array([1, 0.1]), data, ['king', 'man', 'woman'], 3);
  const names = result.map((n) => words[n.index]);
  check('excludes terms', !names.includes('king') && !names.includes('man') && !names.includes('woman'));
  check('excludes plural variant of term', !names.includes('kings'), names.join(', '));
  check('keeps real answers', names.includes('queen') && names.includes('throne'));
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

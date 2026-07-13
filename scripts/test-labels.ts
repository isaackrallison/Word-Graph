// Unit tests for the label-placement module.
//   npx tsx scripts/test-labels.ts

import { greedyPlace, overlaps, tier, PAD_PX, type Rect } from '../src/lib/labelLayout.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const rect = (x: number, y: number, w = 60, h = 16): Rect => ({
  x0: x,
  x1: x + w,
  y0: y,
  y1: y + h,
});
const label = (score: number, r: Rect, mustShow = false) => ({ score, rect: r, mustShow });

// --- overlaps ---
{
  check('identical rects overlap', overlaps(rect(0, 0), rect(0, 0)));
  check('distant rects do not overlap', !overlaps(rect(0, 0), rect(500, 500)));
  check(
    'rects inside the padding band overlap',
    overlaps(rect(0, 0), rect(60 + PAD_PX - 1, 0)) // 4px gap < PAD_PX
  );
  check(
    'rects just outside the padding band do not overlap',
    !overlaps(rect(0, 0), rect(60 + PAD_PX + 1, 0)) // 6px gap > PAD_PX
  );
  check('vertical padding applies too', overlaps(rect(0, 0), rect(0, 16 + PAD_PX - 1)));
}

// --- tier ---
{
  check('top-2k words boosted most', tier(0) === 1.45 && tier(1999) === 1.45);
  check('top-20k words boosted', tier(2000) === 1.15 && tier(19_999) === 1.15);
  check('long tail unboosted', tier(20_000) === 1.0 && tier(99_999) === 1.0);
}

// --- greedyPlace ---
{
  // Two colliding labels — higher score wins.
  const a = label(10, rect(0, 0));
  const b = label(5, rect(2, 2));
  const placed = greedyPlace([b, a], 10);
  check('collision keeps higher score', placed.length === 1 && placed[0] === a);
}
{
  // Non-colliding labels all placed, best first.
  const ls = [label(1, rect(0, 0)), label(3, rect(0, 100)), label(2, rect(0, 200))];
  const placed = greedyPlace([...ls], 10);
  check('non-colliding all placed', placed.length === 3);
  check('ordered by score', placed[0].score === 3 && placed[1].score === 2);
}
{
  // Cap respected for normal labels.
  const many = Array.from({ length: 30 }, (_, i) => label(30 - i, rect(0, i * 40)));
  check('cap respected', greedyPlace(many, 5).length === 5);
}
{
  // must-show bypasses collisions and claims its space first; the total cap
  // covers must-show + normal labels together.
  const winner = label(100, rect(0, 0));
  const must = label(0, rect(0, 0), true); // collides with winner, worst score
  const fillers = Array.from({ length: 10 }, (_, i) => label(50 - i, rect(0, 100 + i * 40)));
  const placed = greedyPlace([winner, must, ...fillers], 3);
  check('must-show always placed', placed.includes(must));
  check('must-show placed first', placed[0] === must);
  check('normal label colliding with must-show is rejected', !placed.includes(winner));
  check('total stays at the cap', placed.length === 3);
}
{
  // Chain: A blocks B, but B would have blocked C — C gets in because B is out.
  const a = label(10, rect(0, 0));
  const b = label(9, rect(30, 0)); // collides with a
  const c = label(8, rect(30 + 60 + PAD_PX + 1, 0)); // collides with b, not a
  const placed = greedyPlace([a, b, c], 10);
  check('rejected label frees its space', placed.includes(a) && !placed.includes(b) && placed.includes(c));
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

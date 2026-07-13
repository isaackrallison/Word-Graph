// Unit test for the gesture state machine using synthetic landmark frames.
//   npx tsx scripts/test-gestures.ts

import { GestureMachine } from '../src/gesture/gestures.ts';
import type { GestureEvent, HandData, Point3 } from '../src/gesture/types.ts';

/** Minimal synthetic hand at (cx, cy). Only landmarks 0/4/5/8/17 matter. */
function hand(cx: number, cy: number, pinched: boolean): HandData {
  const p = (x: number, y: number): Point3 => ({ x, y, z: 0 });
  const landmarks: Point3[] = Array.from({ length: 21 }, () => p(cx, cy));
  landmarks[0] = p(cx, cy + 0.08); // wrist
  landmarks[5] = p(cx - 0.05, cy); // index MCP
  landmarks[17] = p(cx + 0.05, cy); // pinky MCP  → hand scale 0.1
  if (pinched) {
    landmarks[4] = p(cx, cy); // thumb tip on index tip → ratio 0
    landmarks[8] = p(cx, cy);
  } else {
    landmarks[4] = p(cx - 0.04, cy - 0.04); // ratio ≈ 1.1 → open
    landmarks[8] = p(cx + 0.04, cy + 0.04);
  }
  return { landmarks };
}

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

function run(frames: { hands: HandData[]; dt?: number }[]): GestureEvent[] {
  const events: GestureEvent[] = [];
  const m = new GestureMachine((e) => events.push(e));
  let t = 0;
  for (const f of frames) {
    t += f.dt ?? 33;
    m.frame({ hands: f.hands, t });
  }
  return events;
}

// --- open hand → cursor events ---
{
  const ev = run(Array.from({ length: 10 }, (_, i) => ({ hands: [hand(0.3 + i * 0.01, 0.5, false)] })));
  const cursors = ev.filter((e) => e.type === 'cursor');
  check('open hand emits cursor', cursors.length === 10);
  check(
    'cursor moves right',
    cursors.length > 1 &&
      (cursors.at(-1) as { x: number }).x > (cursors[0] as { x: number }).x
  );
  check('state is cursor', ev.some((e) => e.type === 'state' && e.state === 'cursor'));
}

// --- pinch-drag → orbit deltas, no select on slow release ---
{
  const frames = [
    { hands: [hand(0.3, 0.5, false)] },
    ...Array.from({ length: 20 }, (_, i) => ({ hands: [hand(0.3 + i * 0.015, 0.5, true)] })),
    { hands: [hand(0.6, 0.5, false)] },
  ];
  const ev = run(frames);
  const orbits = ev.filter((e) => e.type === 'orbit') as { dx: number; dy: number }[];
  check('pinch-drag emits orbit', orbits.length >= 15, `${orbits.length} events`);
  check('orbit dx positive', orbits.every((o) => o.dx >= 0) && orbits.some((o) => o.dx > 0.001));
  check('long drag is not a tap', !ev.some((e) => e.type === 'select'));
  check('state is orbit', ev.some((e) => e.type === 'state' && e.state === 'orbit'));
}

// --- quick stationary pinch → select at cursor position ---
{
  const frames = [
    { hands: [hand(0.4, 0.6, false)] },
    { hands: [hand(0.4, 0.6, false)] },
    { hands: [hand(0.4, 0.6, true)], dt: 30 },
    { hands: [hand(0.4, 0.6, true)], dt: 30 },
    { hands: [hand(0.4, 0.6, true)], dt: 30 },
    { hands: [hand(0.4, 0.6, false)], dt: 30 },
  ];
  const ev = run(frames);
  const sel = ev.filter((e) => e.type === 'select') as { x: number; y: number }[];
  check('quick pinch-tap emits select', sel.length === 1);
  check(
    'select carries cursor position',
    sel.length === 1 && Math.abs(sel[0].x - 0.4) < 0.05 && Math.abs(sel[0].y - 0.6) < 0.05,
    sel.length ? `(${sel[0].x.toFixed(2)}, ${sel[0].y.toFixed(2)})` : ''
  );
}

// --- slow pinch (held long, stationary) → no select ---
{
  const frames = [
    { hands: [hand(0.4, 0.6, false)] },
    ...Array.from({ length: 15 }, () => ({ hands: [hand(0.4, 0.6, true)], dt: 40 })),
    { hands: [hand(0.4, 0.6, false)], dt: 40 },
  ];
  const ev = run(frames);
  check('long-held pinch is not a select', !ev.some((e) => e.type === 'select'));
}

// --- two-hand pinch spread → dolly in (factor < 1) ---
{
  const frames = Array.from({ length: 15 }, (_, i) => ({
    hands: [hand(0.5 - 0.1 - i * 0.01, 0.5, true), hand(0.5 + 0.1 + i * 0.01, 0.5, true)],
  }));
  const ev = run(frames);
  const dollies = ev.filter((e) => e.type === 'dolly') as { factor: number }[];
  check('two-hand spread emits dolly', dollies.length >= 10, `${dollies.length} events`);
  check('spread → factor < 1 (zoom in)', dollies.every((d) => d.factor < 1));
  check('state is zoom', ev.some((e) => e.type === 'state' && e.state === 'zoom'));
}

// --- two-hand squeeze → dolly out (factor > 1) ---
{
  const frames = Array.from({ length: 15 }, (_, i) => ({
    hands: [hand(0.5 - 0.25 + i * 0.01, 0.5, true), hand(0.5 + 0.25 - i * 0.01, 0.5, true)],
  }));
  const ev = run(frames);
  const dollies = ev.filter((e) => e.type === 'dolly') as { factor: number }[];
  check('squeeze → factor > 1 (zoom out)', dollies.length > 0 && dollies.every((d) => d.factor > 1));
}

// --- jitter robustness: pinch ratio noise around threshold doesn't flap state ---
{
  // ratio oscillating between 0.30 and 0.38 — inside the hysteresis band once engaged
  const jitterHand = (r: number, cx: number): HandData => {
    const h = hand(cx, 0.5, false);
    h.landmarks[4] = { x: cx - (r * 0.1) / 2, y: 0.5, z: 0 };
    h.landmarks[8] = { x: cx + (r * 0.1) / 2, y: 0.5, z: 0 };
    return h;
  };
  const frames = [
    { hands: [jitterHand(0.2, 0.4)] }, // engage (below 0.28)
    ...Array.from({ length: 20 }, (_, i) => ({ hands: [jitterHand(i % 2 ? 0.3 : 0.38, 0.4 + i * 0.01)] })),
  ];
  const ev = run(frames);
  const states = ev.filter((e) => e.type === 'state');
  check('hysteresis: no state flapping', states.length <= 2, `${states.length} transitions`);
}

// --- no hands → idle + cursorEnd ---
{
  const ev = run([{ hands: [hand(0.5, 0.5, false)] }, { hands: [] }]);
  check('hands lost → cursorEnd', ev.some((e) => e.type === 'cursorEnd'));
  check('hands lost → idle state', ev.some((e) => e.type === 'state' && e.state === 'idle'));
}

// --- two open hands crossing paths: no spurious selects or orbits ---
{
  const frames = Array.from({ length: 20 }, (_, i) => ({
    hands: [hand(0.3 + i * 0.02, 0.5, false), hand(0.7 - i * 0.02, 0.5, false)],
  }));
  const ev = run(frames);
  check('crossing open hands: no select', !ev.some((e) => e.type === 'select'));
  check('crossing open hands: no orbit', !ev.some((e) => e.type === 'orbit'));
  check('crossing open hands: stays in cursor mode', !ev.some((e) => e.type === 'state' && (e.state === 'orbit' || e.state === 'zoom')));
}

// --- zoom → one hand releases → seamless orbit, dolly stops ---
{
  const frames = [
    ...Array.from({ length: 10 }, (_, i) => ({
      hands: [hand(0.4 - i * 0.01, 0.5, true), hand(0.6 + i * 0.01, 0.5, true)],
    })),
    // right hand releases; left keeps pinching and moving
    ...Array.from({ length: 10 }, (_, i) => ({
      hands: [hand(0.3 + i * 0.015, 0.5, true), hand(0.7, 0.5, false)],
    })),
  ];
  const ev = run(frames);
  const firstOrbit = ev.findIndex((e) => e.type === 'orbit');
  const lastDolly = ev.map((e) => e.type).lastIndexOf('dolly');
  check('zoom hand-release → orbit continues', firstOrbit !== -1);
  check('dolly stops once a hand releases', lastDolly < firstOrbit);
  check(
    'zoom release is not a tap',
    !ev.some((e) => e.type === 'select'),
    'releasing one zoom hand must not select'
  );
}

// --- QUICK two-hand zoom released fast: must not fire selects ---
{
  const frames = [
    { hands: [hand(0.45, 0.5, false), hand(0.55, 0.5, false)], dt: 30 },
    { hands: [hand(0.44, 0.5, true), hand(0.56, 0.5, true)], dt: 30 },
    { hands: [hand(0.43, 0.5, true), hand(0.57, 0.5, true)], dt: 30 },
    { hands: [hand(0.42, 0.5, true), hand(0.58, 0.5, true)], dt: 30 },
    // both release fast + barely moved — would look like two taps without the guard
    { hands: [hand(0.42, 0.5, false), hand(0.58, 0.5, false)], dt: 30 },
  ];
  const ev = run(frames);
  check('fast zoom release fires no selects', !ev.some((e) => e.type === 'select'));
  check('fast zoom still dollied', ev.some((e) => e.type === 'dolly'));
}

// --- hand teleport (> MATCH_DIST): new track, no phantom tap ---
{
  const frames = [
    { hands: [hand(0.2, 0.2, true)], dt: 40 }, // pinched hand appears
    { hands: [hand(0.2, 0.2, true)], dt: 40 },
    { hands: [hand(0.85, 0.85, false)], dt: 40 }, // teleports across screen, open
    { hands: [hand(0.85, 0.85, false)], dt: 40 },
  ];
  const ev = run(frames);
  check('teleported hand fires no phantom tap', !ev.some((e) => e.type === 'select'));
  const cursors = ev.filter((e) => e.type === 'cursor') as { x: number }[];
  check(
    'teleported hand tracked at new position',
    cursors.length > 0 && Math.abs(cursors.at(-1)!.x - 0.85) < 0.1
  );
}

// --- pinch immediately on first detection then quick release = still a tap ---
{
  const frames = [
    { hands: [], dt: 40 },
    { hands: [hand(0.5, 0.5, true)], dt: 40 }, // appears already pinched
    { hands: [hand(0.5, 0.5, true)], dt: 40 },
    { hands: [hand(0.5, 0.5, false)], dt: 40 },
  ];
  const ev = run(frames);
  check('pinch-on-appearance quick release taps', ev.filter((e) => e.type === 'select').length === 1);
}

// --- cursor smoothing converges to a still hand ---
{
  const frames = [
    { hands: [hand(0.2, 0.2, false)] },
    ...Array.from({ length: 30 }, () => ({ hands: [hand(0.8, 0.6, false)] })),
  ];
  const ev = run(frames);
  // The cursor is the INDEX TIP, which the synthetic open hand puts at
  // (cx + 0.04, cy + 0.04) — converge to that, not the hand center.
  const last = ev.filter((e) => e.type === 'cursor').at(-1) as { x: number; y: number };
  check(
    'cursor converges to the index tip',
    Math.abs(last.x - 0.84) < 0.01 && Math.abs(last.y - 0.64) < 0.01,
    `(${last.x.toFixed(3)}, ${last.y.toFixed(3)})`
  );
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

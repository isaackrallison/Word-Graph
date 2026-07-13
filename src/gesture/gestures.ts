// Pure gesture state machine: HandFrame stream in → GestureEvent stream out.
// No DOM, no three.js — unit-testable with synthetic frames.
//
// Vocabulary:
//   one hand, pinch held + move   → orbit (dx/dy deltas)
//   one hand, quick pinch-tap     → select
//   one hand open                 → cursor (index-tip position)
//   two hands pinching, spread/squeeze → dolly (zoom)

import type { GestureEvent, GestureState, HandData, HandFrame, Point3 } from './types';

const PINCH_ENGAGE = 0.28; // pinch ratio below this → pinching
const PINCH_RELEASE = 0.42; // …and stays pinching until above this (hysteresis)
const TAP_MAX_MS = 250;
const TAP_MAX_MOVE = 0.02; // screen fraction
const POS_ALPHA = 0.4; // EMA for pinch midpoint / hand position
const CURSOR_ALPHA = 0.3; // heavier smoothing for the cursor
const MATCH_DIST = 0.3; // max wrist travel between frames to keep hand identity

const dist2d = (a: Point3, b: Point3) => Math.hypot(a.x - b.x, a.y - b.y);

/** thumb-tip↔index-tip distance normalized by hand size (index↔pinky MCP). */
export function pinchRatio(hand: HandData): number {
  const l = hand.landmarks;
  const scale = dist2d(l[5], l[17]);
  return scale > 1e-4 ? dist2d(l[4], l[8]) / scale : Infinity;
}

interface TrackedHand {
  wrist: Point3;
  pos: { x: number; y: number }; // smoothed pinch midpoint
  cursor: { x: number; y: number }; // smoothed index tip
  pinching: boolean;
  pinchStart: number; // ms
  pinchTravel: number; // accumulated movement while pinched
}

export class GestureMachine {
  private tracked: TrackedHand[] = [];
  private state: GestureState = 'idle';
  private zoomPrevDist: number | null = null;
  private emit: (e: GestureEvent) => void;

  constructor(emit: (e: GestureEvent) => void) {
    this.emit = emit;
  }

  private setState(s: GestureState) {
    if (s !== this.state) {
      this.state = s;
      this.emit({ type: 'state', state: s });
    }
  }

  frame(f: HandFrame) {
    // --- associate detected hands with tracked hands by wrist proximity ---
    const next: TrackedHand[] = [];
    const used = new Set<number>();
    const deltas = new Map<TrackedHand, { dx: number; dy: number }>();
    for (const hand of f.hands) {
      const l = hand.landmarks;
      const wrist = l[0];
      const midRaw = { x: (l[4].x + l[8].x) / 2, y: (l[4].y + l[8].y) / 2 };
      const curRaw = { x: l[8].x, y: l[8].y };

      let best = -1;
      let bestD = MATCH_DIST;
      for (let i = 0; i < this.tracked.length; i++) {
        if (used.has(i)) continue;
        const d = dist2d(this.tracked[i].wrist, wrist);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }

      const ratio = pinchRatio(hand);
      if (best >= 0) {
        used.add(best);
        const t = this.tracked[best];
        const prev = { ...t.pos };
        t.wrist = wrist;
        t.pos.x += (midRaw.x - t.pos.x) * POS_ALPHA;
        t.pos.y += (midRaw.y - t.pos.y) * POS_ALPHA;
        t.cursor.x += (curRaw.x - t.cursor.x) * CURSOR_ALPHA;
        t.cursor.y += (curRaw.y - t.cursor.y) * CURSOR_ALPHA;
        const wasPinching = t.pinching;
        t.pinching = t.pinching ? ratio < PINCH_RELEASE : ratio < PINCH_ENGAGE;
        if (t.pinching && !wasPinching) {
          t.pinchStart = f.t;
          t.pinchTravel = 0;
        }
        if (t.pinching && wasPinching) {
          const dx = t.pos.x - prev.x;
          const dy = t.pos.y - prev.y;
          t.pinchTravel += Math.hypot(dx, dy);
          deltas.set(t, { dx, dy });
        }
        if (!t.pinching && wasPinching) {
          // pinch released — was it a tap?
          if (f.t - t.pinchStart < TAP_MAX_MS && t.pinchTravel < TAP_MAX_MOVE) {
            this.emit({ type: 'select', x: t.cursor.x, y: t.cursor.y });
          }
        }
        next.push(t);
      } else {
        next.push({
          wrist,
          pos: { ...midRaw },
          cursor: { ...curRaw },
          pinching: ratio < PINCH_ENGAGE,
          pinchStart: f.t,
          pinchTravel: 0,
        });
      }
    }
    this.tracked = next;

    // --- derive the global mode ---
    const pinching = this.tracked.filter((t) => t.pinching);

    if (pinching.length >= 2) {
      const d = dist2d(
        { ...pinching[0].pos, z: 0 },
        { ...pinching[1].pos, z: 0 }
      );
      if (this.zoomPrevDist !== null && d > 1e-4) {
        this.emit({ type: 'dolly', factor: this.zoomPrevDist / d });
      }
      this.zoomPrevDist = d;
      this.setState('zoom');
      this.emit({ type: 'cursorEnd' });
      return;
    }
    this.zoomPrevDist = null;

    if (pinching.length === 1) {
      const d = deltas.get(pinching[0]);
      if (d && (d.dx !== 0 || d.dy !== 0)) {
        this.emit({ type: 'orbit', dx: d.dx, dy: d.dy });
      }
      this.setState('orbit');
      this.emit({ type: 'cursorEnd' });
      return;
    }

    if (this.tracked.length > 0) {
      const c = this.tracked[0].cursor;
      this.emit({ type: 'cursor', x: c.x, y: c.y });
      this.setState('cursor');
      return;
    }

    this.emit({ type: 'cursorEnd' });
    this.setState('idle');
  }
}

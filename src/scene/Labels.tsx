import { memo, useState, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import type { GraphData } from '../lib/data';
import { CLUSTER_COLORS } from '../lib/palette';
import { greedyPlace, tier, type Rect } from '../lib/labelLayout';

/**
 * Map-style label placement. Instead of "the 56 nearest words" (a wall of
 * overlapping text in a 100k cloud), each refresh:
 *   1. collects the ~400 nearest in-front words,
 *   2. scores them by on-screen size × word frequency (the word list is
 *      frequency-ordered, so index = importance rank) with stickiness for
 *      labels already showing,
 *   3. greedily accepts labels whose projected screen rects don't overlap,
 *      up to a hard cap.
 * Result: a handful of readable, non-colliding labels, important words first.
 */

const REFRESH_SECONDS = 0.4;
const MAX_LABELS = 26;
const CANDIDATES = 400;
const MIN_PX = 10; // labels smaller than this are noise — skip
const MAX_PX = 26; // …and larger than this dominate the view — cap
const CHAR_ASPECT = 0.62; // approx glyph width / font size
const BASE_FONT = 1.05; // world units

interface LabelInfo {
  index: number;
  fontSize: number; // world units, quantized
  opacity: number; // quantized
}

interface LabelsProps {
  data: GraphData;
  hovered: number | null;
  /** Word indices that must stay labeled (focused word, neighbors of a new word). */
  forced: number[];
}

export function Labels({ data, hovered, forced }: LabelsProps) {
  const camera = useThree((s) => s.camera);
  const viewport = useThree((s) => s.size);
  const [visible, setVisible] = useState<LabelInfo[]>([]);
  const clock = useRef(0);
  const lastShown = useRef(new Set<number>());
  const forwardVec = useMemo(() => new THREE.Vector3(), []);
  const toPoint = useMemo(() => new THREE.Vector3(), []);
  const projVec = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    clock.current += delta;
    if (clock.current < REFRESH_SECONDS) return;
    clock.current = 0;

    const { positions, count, words } = data;
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 55;
    // px per world unit at distance 1
    const ppu = viewport.height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));

    // --- 1. bounded top-k nearest in-front candidates (no full sort) ---
    camera.getWorldDirection(forwardVec);
    const nearest: { index: number; d2: number }[] = [];
    let worst = Infinity;
    for (let i = 0; i < count; i++) {
      toPoint
        .set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
        .sub(camera.position);
      const d2 = toPoint.lengthSq();
      if (d2 >= worst && nearest.length >= CANDIDATES) continue;
      if (toPoint.dot(forwardVec) < 0) continue;
      if (nearest.length < CANDIDATES) {
        nearest.push({ index: i, d2 });
        if (nearest.length === CANDIDATES) {
          nearest.sort((a, b) => a.d2 - b.d2);
          worst = nearest[CANDIDATES - 1].d2;
        }
      } else {
        let k = CANDIDATES - 1;
        while (k > 0 && nearest[k - 1].d2 > d2) {
          nearest[k] = nearest[k - 1];
          k--;
        }
        nearest[k] = { index: i, d2 };
        worst = nearest[CANDIDATES - 1].d2;
      }
    }

    // --- 2. score + screen-project the survivors ---
    interface Candidate {
      index: number;
      fontSize: number;
      opacity: number;
      score: number;
      rect: Rect;
      mustShow: boolean;
    }
    const mustShow = new Set<number>(forced);
    if (hovered !== null) mustShow.add(hovered);

    const project = (index: number, must: boolean): Candidate | null => {
      const d = Math.hypot(
        positions[index * 3] - camera.position.x,
        positions[index * 3 + 1] - camera.position.y,
        positions[index * 3 + 2] - camera.position.z
      );
      if (d < 1e-3) return null;
      let fontSize = BASE_FONT * tier(index) * (must ? 1.3 : 1);
      let px = (fontSize * ppu) / d;
      if (px > MAX_PX) {
        fontSize *= MAX_PX / px;
        px = MAX_PX;
      }
      if (must && px < 12) {
        fontSize *= 12 / px;
        px = 12;
      }
      if (px < MIN_PX) return null;

      projVec.set(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
      projVec.project(camera);
      if (projVec.z > 1) return null; // behind
      const sx = (projVec.x * 0.5 + 0.5) * viewport.width;
      const sy = (1 - (projVec.y * 0.5 + 0.5)) * viewport.height;
      const w = px * CHAR_ASPECT * words[index].word.length;
      const rect: Rect = { x0: sx - w / 2, x1: sx + w / 2, y0: sy - px * 1.6, y1: sy };
      if (rect.x1 < 0 || rect.x0 > viewport.width || rect.y1 < 0 || rect.y0 > viewport.height) {
        return null; // fully off-screen
      }

      const sticky = lastShown.current.has(index) ? 1.35 : 1;
      return {
        index,
        fontSize,
        opacity: THREE.MathUtils.clamp((px - MIN_PX) / 9 + 0.35, 0.35, 0.95),
        score: px * tier(index) * sticky,
        rect,
        mustShow: must,
      };
    };

    const candidates: Candidate[] = [];
    for (const index of mustShow) {
      const c = project(index, true);
      if (c) candidates.push(c);
    }
    for (const { index } of nearest) {
      if (mustShow.has(index)) continue;
      const c = project(index, false);
      if (c) candidates.push(c);
    }

    // --- 3. greedy non-overlapping placement, must-show first ---
    const accepted = greedyPlace(candidates, MAX_LABELS);

    lastShown.current = new Set(accepted.map((c) => c.index));

    const q = (v: number) => Math.round(v * 10) / 10;
    const next = accepted
      .map((c) => ({
        index: c.index,
        fontSize: q(c.fontSize),
        opacity: c.mustShow ? 1 : q(c.opacity),
      }))
      .sort((a, b) => a.index - b.index);

    setVisible((prev) =>
      prev.length === next.length &&
      prev.every(
        (p, i) =>
          p.index === next[i].index &&
          p.fontSize === next[i].fontSize &&
          p.opacity === next[i].opacity
      )
        ? prev // unchanged — skip the React re-render entirely
        : next
    );
  });

  return (
    <>
      {visible.map(({ index, fontSize, opacity }) => (
        <LabelItem
          key={index}
          word={data.words[index].word}
          x={data.positions[index * 3]}
          y={data.positions[index * 3 + 1] + 0.6}
          z={data.positions[index * 3 + 2]}
          color={CLUSTER_COLORS[data.words[index].cluster % CLUSTER_COLORS.length]}
          opacity={opacity}
          fontSize={fontSize}
          emphasized={index === hovered || forced.includes(index)}
        />
      ))}
    </>
  );
}

/** Memoized so a refresh that keeps a label's quantized props untouched skips
 *  the troika Text update entirely. */
const LabelItem = memo(function LabelItem({
  word,
  x,
  y,
  z,
  color,
  opacity,
  fontSize,
  emphasized,
}: {
  word: string;
  x: number;
  y: number;
  z: number;
  color: string;
  opacity: number;
  fontSize: number;
  emphasized: boolean;
}) {
  return (
    <Billboard position={[x, y, z]}>
      <Text
        fontSize={fontSize}
        color={emphasized ? '#ffffff' : color}
        fillOpacity={opacity}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={emphasized ? 0.045 : 0}
        outlineColor="#060610"
      >
        {word}
      </Text>
    </Billboard>
  );
});

import { memo, useState, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import type { GraphData } from '../lib/data';
import { CLUSTER_COLORS } from '../lib/palette';

const MAX_LABELS = 56;
const REFRESH_SECONDS = 0.8;

interface LabelInfo {
  index: number;
  opacity: number;
  size: number;
}

interface LabelsProps {
  data: GraphData;
  hovered: number | null;
  /** Word indices that must stay labeled (focused word, neighbors of a new word). */
  forced: number[];
}

/**
 * Shows labels only for the words nearest the camera (plus hovered/forced
 * ones), with distance-based fade — all 1k labels at once would be unreadable.
 * Keyed by word index so persisting labels don't re-layout on refresh.
 */
export function Labels({ data, hovered, forced }: LabelsProps) {
  const camera = useThree((s) => s.camera);
  const [visible, setVisible] = useState<LabelInfo[]>([]);
  const clock = useRef(0);
  const forwardVec = useMemo(() => new THREE.Vector3(), []);
  const toPoint = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    clock.current += delta;
    if (clock.current < REFRESH_SECONDS) return;
    clock.current = 0;

    camera.getWorldDirection(forwardVec);
    const { positions, count } = data;
    // Bounded top-k selection (no full sort — count can be 100k+).
    const nearest: { index: number; d2: number }[] = [];
    let worst = Infinity;
    for (let i = 0; i < count; i++) {
      toPoint
        .set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
        .sub(camera.position);
      const d2 = toPoint.lengthSq();
      if (d2 >= worst && nearest.length >= MAX_LABELS) continue;
      if (toPoint.dot(forwardVec) < 0) continue; // behind the camera
      if (nearest.length < MAX_LABELS) {
        nearest.push({ index: i, d2 });
        if (nearest.length === MAX_LABELS) {
          nearest.sort((a, b) => a.d2 - b.d2);
          worst = nearest[MAX_LABELS - 1].d2;
        }
      } else {
        let k = MAX_LABELS - 1;
        while (k > 0 && nearest[k - 1].d2 > d2) {
          nearest[k] = nearest[k - 1];
          k--;
        }
        nearest[k] = { index: i, d2 };
        worst = nearest[MAX_LABELS - 1].d2;
      }
    }

    const fadeRange = data.cloudRadius * 1.07;
    const chosen = new Map<number, { opacity: number; size: number }>();
    // Quantize to a coarse grid so a label whose distance barely changed keeps
    // identical props — troika re-layouts on every fontSize change, and 56 of
    // those per refresh is what kills the frame rate.
    const q = (v: number) => Math.round(v * 10) / 10;
    const entry = (d: number) => ({
      // Fade with distance, and also fade OUT labels almost on top of the
      // camera — in a 100k cloud they'd otherwise wallpaper the screen.
      opacity: q(
        THREE.MathUtils.clamp(1.4 - d / fadeRange, 0.18, 1) *
          THREE.MathUtils.clamp(d / 6, 0.1, 1)
      ),
      // Shrink labels very close to the camera so they don't dominate the view.
      size: q(THREE.MathUtils.clamp(d / 16, 0.3, 1)),
    });
    for (const { index, d2 } of nearest) {
      chosen.set(index, entry(Math.sqrt(d2)));
    }
    const dist = (i: number) =>
      toPoint
        .set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
        .sub(camera.position)
        .length();
    for (const f of forced) chosen.set(f, { ...entry(dist(f)), opacity: 1 });
    if (hovered !== null) chosen.set(hovered, { ...entry(dist(hovered)), opacity: 1 });

    const next = [...chosen.entries()]
      .map(([index, { opacity, size }]) => ({ index, opacity, size }))
      .sort((a, b) => a.index - b.index);
    setVisible((prev) =>
      prev.length === next.length &&
      prev.every(
        (p, i) =>
          p.index === next[i].index &&
          p.opacity === next[i].opacity &&
          p.size === next[i].size
      )
        ? prev // unchanged — skip the React re-render entirely
        : next
    );
  });

  return (
    <>
      {visible.map(({ index, opacity, size }) => (
        <LabelItem
          key={index}
          word={data.words[index].word}
          x={data.positions[index * 3]}
          y={data.positions[index * 3 + 1] + 1.0}
          z={data.positions[index * 3 + 2]}
          color={CLUSTER_COLORS[data.words[index].cluster % CLUSTER_COLORS.length]}
          opacity={opacity}
          size={size}
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
  size,
  emphasized,
}: {
  word: string;
  x: number;
  y: number;
  z: number;
  color: string;
  opacity: number;
  size: number;
  emphasized: boolean;
}) {
  return (
    <Billboard position={[x, y, z]}>
      <Text
        fontSize={(emphasized ? 1.5 : 1.05) * size}
        color={emphasized ? '#ffffff' : color}
        fillOpacity={emphasized ? 1 : opacity}
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

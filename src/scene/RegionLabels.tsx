import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import type { GraphData } from '../lib/data';
import { greedyPlace, type Rect } from '../lib/labelLayout';

const REGION_COLOR = '#c8d0ea'; // soft map-label grey-blue, not a cluster color
const OPACITY = 0.72;
const FONT = 6.5; // world units — big, so they read as region names at a distance
const MAX_PX = 34; // clamp apparent size so a nearby region name can't dominate
const REFRESH = 0.3; // seconds between screen-space replacements
const CHAR_ASPECT = 0.62; // approx glyph width / font size
const MAX_REGIONS = 16; // hard cap on labels shown at once

interface Placed {
  index: number;
  fontSize: number;
}

/**
 * Constellation-style region names (map-style "place labels"), shown in the
 * "regions" label mode (App toggles between these and the per-word labels).
 * Placed by throttled screen-space greedy non-overlap — like the word labels —
 * so they never pile on top of each other; only a spread, readable subset shows.
 */
export function RegionLabels({ data }: { data: GraphData }) {
  const camera = useThree((s) => s.camera);
  const viewport = useThree((s) => s.size);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const clock = useRef(0);
  const shown = useRef<Placed[]>([]);
  const projVec = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, delta) => {
    clock.current += delta;
    if (clock.current < REFRESH) return;
    clock.current = 0;

    const regions = data.regions;
    if (regions.length === 0) {
      if (shown.current.length) {
        shown.current = [];
        setPlaced([]);
      }
      return;
    }

    const fov = (camera as THREE.PerspectiveCamera).fov ?? 55;
    const ppu = viewport.height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));

    interface C extends Placed {
      score: number;
      rect: Rect;
      mustShow: boolean;
    }
    const cands: C[] = [];
    for (let i = 0; i < regions.length; i++) {
      const [x, y, z] = regions[i].position;
      const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
      if (d < 1e-3) continue;
      let px = (FONT * ppu) / d;
      let fontSize = FONT;
      if (px > MAX_PX) {
        fontSize *= MAX_PX / px;
        px = MAX_PX;
      }
      projVec.set(x, y, z).project(camera);
      if (projVec.z > 1) continue; // behind camera
      const sx = (projVec.x * 0.5 + 0.5) * viewport.width;
      const sy = (1 - (projVec.y * 0.5 + 0.5)) * viewport.height;
      const w = px * CHAR_ASPECT * regions[i].word.length;
      const rect: Rect = { x0: sx - w / 2, x1: sx + w / 2, y0: sy - px * 0.6, y1: sy + px * 0.6 };
      if (rect.x1 < 0 || rect.x0 > viewport.width || rect.y1 < 0 || rect.y0 > viewport.height) {
        continue; // off-screen
      }
      const sticky = shown.current.some((p) => p.index === i) ? 1.3 : 1; // reduce flicker
      cands.push({ index: i, fontSize, score: px * sticky, rect, mustShow: false });
    }

    const accepted = greedyPlace(cands, MAX_REGIONS)
      .map((c) => ({ index: c.index, fontSize: Math.round(c.fontSize * 10) / 10 }))
      .sort((a, b) => a.index - b.index);

    const same =
      accepted.length === shown.current.length &&
      accepted.every((p, i) => p.index === shown.current[i].index && p.fontSize === shown.current[i].fontSize);
    shown.current = accepted;
    if (!same) setPlaced(accepted);
  });

  return (
    <>
      {placed.map(({ index, fontSize }) => (
        <Billboard key={data.regions[index].word} position={data.regions[index].position}>
          <Text
            fontSize={fontSize}
            color={REGION_COLOR}
            fillOpacity={OPACITY}
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.12}
            outlineWidth={0.03}
            outlineColor="#05050c"
          >
            {data.regions[index].word.toUpperCase()}
          </Text>
        </Billboard>
      ))}
    </>
  );
}

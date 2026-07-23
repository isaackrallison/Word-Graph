import { useState } from 'react';
import { Billboard, Text } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import type { GraphData } from '../lib/data';

const REGION_COLOR = '#c8d0ea'; // soft map-label grey-blue, not a cluster color
const FONT = 6.5; // world units — big, so they read as region names at a distance
const MAX_OPACITY = 0.6;
const FADE_NEAR = 150; // camera-to-center distance where regions fully fade out
const FADE_FAR = 265; // …and where they reach full strength (overview)

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Constellation-style region names (map-style "place labels"). They fade in as
 * the camera pulls back to an overview and fade out as you dive into the cloud,
 * where the per-word labels (scene/Labels.tsx) take over — a simple semantic
 * zoom. Opacity is quantized so this only re-renders on a visible step change.
 */
export function RegionLabels({ data }: { data: GraphData }) {
  const camera = useThree((s) => s.camera);
  const [opacity, setOpacity] = useState(0);

  useFrame(() => {
    const d = camera.position.length(); // distance to cloud center (origin)
    const t = clamp01((d - FADE_NEAR) / (FADE_FAR - FADE_NEAR));
    const q = Math.round(t * MAX_OPACITY * 20) / 20; // quantize to 0.05*MAX steps
    setOpacity((prev) => (prev === q ? prev : q));
  });

  if (data.regions.length === 0 || opacity <= 0) return null;
  return (
    <>
      {data.regions.map((r) => (
        <Billboard key={r.word} position={r.position}>
          <Text
            fontSize={FONT}
            color={REGION_COLOR}
            fillOpacity={opacity}
            anchorX="center"
            anchorY="middle"
            letterSpacing={0.12}
            outlineWidth={0.03}
            outlineColor="#05050c"
          >
            {r.word.toUpperCase()}
          </Text>
        </Billboard>
      ))}
    </>
  );
}

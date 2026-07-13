import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Billboard, Line, Text } from '@react-three/drei';
import type { AddedWord } from '../types';
import type { GraphData } from '../lib/data';
import { ADDED_WORD_COLOR, ADDED_WORD_GLOW } from '../lib/palette';
import { makeGlowTexture } from './WordCloud';

const FLIGHT_SECONDS = 1.4;

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

interface NewWordProps {
  added: AddedWord;
  data: GraphData;
  /** Where the entrance animation starts (roughly the camera position at add time). */
  spawn: [number, number, number];
  animate: boolean;
}

/** A user-added word: glowing marker + always-on label + lines to its neighbors. */
export function NewWord({ added, data, spawn, animate }: NewWordProps) {
  const texture = useMemo(makeGlowTexture, []);
  const group = useRef<THREE.Group>(null);
  const t = useRef(animate ? 0 : 1);
  const [arrived, setArrived] = useState(!animate);
  const spawnVec = useMemo(() => new THREE.Vector3(...spawn), [spawn]);
  const targetVec = useMemo(() => new THREE.Vector3(...added.position), [added.position]);

  useFrame((_, delta) => {
    if (!group.current) return;
    if (t.current < 1) {
      t.current = Math.min(1, t.current + delta / FLIGHT_SECONDS);
      group.current.position.lerpVectors(spawnVec, targetVec, easeInOutCubic(t.current));
      if (t.current >= 1) setArrived(true);
    }
    // Gentle pulse once in place.
    const pulse = arrived ? 1 + 0.12 * Math.sin(performance.now() / 350) : 1.4 - 0.4 * t.current;
    group.current.scale.setScalar(pulse);
  });

  return (
    <>
      <group ref={group} position={animate ? spawn : added.position}>
        <sprite scale={[5, 5, 1]}>
          <spriteMaterial
            map={texture}
            color={ADDED_WORD_GLOW}
            transparent
            opacity={0.75}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
        <mesh>
          <sphereGeometry args={[0.35, 16, 16]} />
          <meshBasicMaterial color={ADDED_WORD_COLOR} />
        </mesh>
        <Billboard position={[0, 1.4, 0]}>
          <Text
            fontSize={1.9}
            color={ADDED_WORD_COLOR}
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.06}
            outlineColor="#060610"
          >
            {added.word}
          </Text>
        </Billboard>
      </group>
      {arrived &&
        added.neighbors.map((n) => (
          <Line
            key={n.index}
            points={[
              added.position,
              [
                data.positions[n.index * 3],
                data.positions[n.index * 3 + 1],
                data.positions[n.index * 3 + 2],
              ],
            ]}
            color={ADDED_WORD_GLOW}
            transparent
            opacity={0.28}
            lineWidth={1.5}
          />
        ))}
    </>
  );
}

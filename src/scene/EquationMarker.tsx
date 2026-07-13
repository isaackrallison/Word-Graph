import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { GraphData } from '../lib/data';
import type { Neighbor } from '../lib/project';
import { makeGlowTexture } from './WordCloud';

const EQUATION_COLOR = '#9085e9'; // palette violet — distinct from added-word cyan

interface EquationMarkerProps {
  position: [number, number, number];
  candidates: Neighbor[];
  data: GraphData;
}

/** Ephemeral marker at the algebra point, with lines to the top candidates. */
export function EquationMarker({ position, candidates, data }: EquationMarkerProps) {
  const texture = useMemo(makeGlowTexture, []);
  const group = useRef<THREE.Group>(null);

  useFrame(() => {
    group.current?.scale.setScalar(1 + 0.15 * Math.sin(performance.now() / 300));
  });

  return (
    <>
      <group ref={group} position={position}>
        <sprite scale={[4, 4, 1]}>
          <spriteMaterial
            map={texture}
            color={EQUATION_COLOR}
            transparent
            opacity={0.8}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
        <mesh>
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      </group>
      {candidates.slice(0, 3).map((n) => (
        <Line
          key={n.index}
          points={[
            position,
            [
              data.positions[n.index * 3],
              data.positions[n.index * 3 + 1],
              data.positions[n.index * 3 + 2],
            ],
          ]}
          color={EQUATION_COLOR}
          transparent
          opacity={0.35}
          lineWidth={1.5}
        />
      ))}
    </>
  );
}

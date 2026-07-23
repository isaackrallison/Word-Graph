import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import type { GraphData } from '../lib/data';
import { makeGlowTexture } from './WordCloud';

const TRAIL_COLOR = '#8ff0ff'; // bright cyan — distinct from neighbor gold / equation violet
const SPEED = 2.5; // nodes traversed per second by the pulse

/**
 * A "star trail": the polyline through a semantic path's stepping-stone words
 * (see lib/path.ts), with a glowing pulse that travels along it. Endpoints get
 * bigger nodes. Labels for the path words are forced on by App.
 */
export function PathTrail({ path, data }: { path: number[]; data: GraphData }) {
  const texture = useMemo(makeGlowTexture, []);
  const pts = useMemo(
    () =>
      path.map(
        (i) =>
          new THREE.Vector3(data.positions[i * 3], data.positions[i * 3 + 1], data.positions[i * 3 + 2])
      ),
    [path, data]
  );
  const pulse = useRef<THREE.Group>(null);
  const u = useRef(0);

  useFrame((_, delta) => {
    if (pts.length < 2 || !pulse.current) return;
    u.current = (u.current + delta * SPEED) % (pts.length - 1);
    const seg = Math.floor(u.current);
    pulse.current.position.lerpVectors(pts[seg], pts[seg + 1], u.current - seg);
  });

  if (pts.length < 2) return null;
  return (
    <>
      <Line points={pts} color={TRAIL_COLOR} transparent opacity={0.55} lineWidth={2} />
      {pts.map((p, i) => (
        <mesh key={path[i]} position={p}>
          <sphereGeometry args={[i === 0 || i === pts.length - 1 ? 0.75 : 0.4, 12, 12]} />
          <meshBasicMaterial color={TRAIL_COLOR} />
        </mesh>
      ))}
      <group ref={pulse}>
        <sprite scale={[4, 4, 1]}>
          <spriteMaterial
            map={texture}
            color={TRAIL_COLOR}
            transparent
            opacity={0.9}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      </group>
    </>
  );
}

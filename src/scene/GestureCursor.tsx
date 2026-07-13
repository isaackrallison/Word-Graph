import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { ADDED_WORD_GLOW } from '../lib/palette';
import { makeGlowTexture } from './WordCloud';

const POINTS_NAME = 'word-cloud'; // set on the WordCloud <points>

/** Raycast a normalized screen position against the word cloud. */
function pick(
  scene: THREE.Scene,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  pos: { x: number; y: number }
): { index: number | null; point: THREE.Vector3 | null } {
  const cloud = scene.getObjectByName(POINTS_NAME);
  if (!cloud) return { index: null, point: null };
  raycaster.params.Points.threshold = 0.8;
  raycaster.setFromCamera(new THREE.Vector2(pos.x * 2 - 1, -(pos.y * 2 - 1)), camera);
  const hit = raycaster.intersectObject(cloud, false)[0];
  return { index: hit?.index ?? null, point: hit?.point ?? null };
}

interface GestureCursorProps {
  /** Normalized [0,1] screen position (y down), or null when no cursor. */
  cursor: { x: number; y: number } | null;
  /** Increment + position → perform a select (pinch-tap). */
  select: { seq: number; x: number; y: number } | null;
  onHover(index: number | null): void;
  onSelect(index: number): void;
}

/** Drives hover/select from the gesture cursor via the same raycast the mouse
 *  uses, and renders a glowing cursor dot in the scene. */
export function GestureCursor({ cursor, select, onHover, onSelect }: GestureCursorProps) {
  const { scene, camera } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const texture = useMemo(makeGlowTexture, []);
  const sprite = useRef<THREE.Sprite>(null);
  const handledSeq = useRef(0);

  // Hover + cursor dot placement.
  useEffect(() => {
    if (!cursor) {
      onHover(null);
      return;
    }
    const { index, point } = pick(scene, camera, raycaster, cursor);
    onHover(index);
    if (sprite.current) {
      if (point) {
        sprite.current.position.copy(point);
      } else {
        // no word under the cursor — float the dot 40 units along the ray
        sprite.current.position
          .copy(raycaster.ray.origin)
          .addScaledVector(raycaster.ray.direction, 40);
      }
    }
  }, [cursor, scene, camera, raycaster, onHover]);

  // Pinch-tap select.
  useEffect(() => {
    if (!select || select.seq === handledSeq.current) return;
    handledSeq.current = select.seq;
    const { index } = pick(scene, camera, raycaster, select);
    if (index !== null) onSelect(index);
  }, [select, scene, camera, raycaster, onSelect]);

  if (!cursor) return null;
  return (
    <sprite ref={sprite} scale={[2.2, 2.2, 1]}>
      <spriteMaterial
        map={texture}
        color={ADDED_WORD_GLOW}
        transparent
        opacity={0.85}
        depthWrite={false}
        depthTest={false}
        blending={THREE.AdditiveBlending}
      />
    </sprite>
  );
}

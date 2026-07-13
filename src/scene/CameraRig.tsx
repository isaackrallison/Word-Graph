import { forwardRef, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

/**
 * All camera motion goes through this rig — mouse/touch via OrbitControls,
 * gestures via the imperative handle (orbitBy/dollyBy/flyTo).
 */
export interface CameraRigHandle {
  flyTo(target: [number, number, number], distance?: number): void;
  /** Rotate around the current target by yaw/pitch radians. */
  orbitBy(dyaw: number, dpitch: number): void;
  /** Multiply the camera↔target distance (clamped to min/max). */
  dollyBy(factor: number): void;
  /** Mark user activity (e.g. a hand cursor) so idle auto-rotate holds off. */
  noteActivity(): void;
}

const IDLE_SECONDS = 14;
const MIN_DISTANCE = 4;
const MAX_DISTANCE = 520;

interface CameraRigProps {
  /** Disable pointer input (mock-hand mode gives the mouse to the gesture pipeline). */
  pointerEnabled?: boolean;
}

export const CameraRig = forwardRef<CameraRigHandle, CameraRigProps>(function CameraRig(
  { pointerEnabled = true },
  ref
) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const camera = useThree((s) => s.camera);
  const flight = useRef<{ target: THREE.Vector3; camGoal: THREE.Vector3 } | null>(null);
  const lastInteraction = useRef(0);
  const dragging = useRef(false);
  const elapsed = useRef(0);

  useImperativeHandle(ref, () => {
    const spherical = new THREE.Spherical();
    const offset = new THREE.Vector3();

    const applySpherical = (mutate: (s: THREE.Spherical) => void) => {
      const controls = controlsRef.current;
      if (!controls) return;
      flight.current = null; // gesture input interrupts any flight
      lastInteraction.current = elapsed.current;
      offset.copy(camera.position).sub(controls.target);
      spherical.setFromVector3(offset);
      mutate(spherical);
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.05, Math.PI - 0.05);
      spherical.radius = THREE.MathUtils.clamp(spherical.radius, MIN_DISTANCE, MAX_DISTANCE);
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical));
      controls.update();
    };

    return {
      flyTo(target, distance = 15) {
        const t = new THREE.Vector3(...target);
        // Keep the current viewing direction; just move closer to the target.
        const dir = camera.position.clone().sub(t);
        if (dir.lengthSq() < 1e-6) dir.set(0, 0.3, 1);
        dir.normalize();
        flight.current = { target: t, camGoal: t.clone().addScaledVector(dir, distance) };
      },
      orbitBy(dyaw, dpitch) {
        applySpherical((s) => {
          s.theta -= dyaw;
          s.phi -= dpitch;
        });
      },
      dollyBy(factor) {
        applySpherical((s) => {
          s.radius *= factor;
        });
      },
      noteActivity() {
        lastInteraction.current = elapsed.current;
      },
    };
  });

  useFrame((_, delta) => {
    elapsed.current += delta;
    const controls = controlsRef.current;
    if (!controls) return;

    if (flight.current) {
      const k = 1 - Math.exp(-3.2 * delta);
      camera.position.lerp(flight.current.camGoal, k);
      controls.target.lerp(flight.current.target, k);
      if (camera.position.distanceTo(flight.current.camGoal) < 0.25) flight.current = null;
    }

    controls.autoRotate =
      !dragging.current && elapsed.current - lastInteraction.current > IDLE_SECONDS;
    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enabled={pointerEnabled}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      minDistance={4}
      maxDistance={220}
      autoRotateSpeed={0.35}
      onStart={() => {
        dragging.current = true;
        lastInteraction.current = elapsed.current;
        flight.current = null; // user input interrupts any flight
      }}
      onEnd={() => {
        dragging.current = false;
        lastInteraction.current = elapsed.current;
      }}
      makeDefault
    />
  );
});

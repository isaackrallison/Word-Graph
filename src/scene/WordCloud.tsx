import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { GraphData } from '../lib/data';
import { CLUSTER_COLORS } from '../lib/palette';

/** Soft radial glow sprite used for every point. */
export function makeGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface WordCloudProps {
  data: GraphData;
  onHover: (index: number | null) => void;
  onSelect: (index: number) => void;
}

export function WordCloud({ data, onHover, onSelect }: WordCloudProps) {
  const texture = useMemo(makeGlowTexture, []);

  const colors = useMemo(() => {
    const arr = new Float32Array(data.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < data.count; i++) {
      c.set(CLUSTER_COLORS[data.words[i].cluster % CLUSTER_COLORS.length]);
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    return arr;
  }, [data]);

  const material = useMemo(() => {
    const m = new THREE.PointsMaterial({
      map: texture,
      vertexColors: true,
      size: 1.0,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    // Cap the on-screen sprite size — otherwise points a few units from the
    // camera balloon into huge blurry blobs in dense regions.
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        'gl_PointSize *= ( scale / - mvPosition.z );',
        'gl_PointSize = min( gl_PointSize * ( scale / - mvPosition.z ), 22.0 );'
      );
    };
    return m;
  }, [texture]);

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(e.index ?? null);
  };

  return (
    <points
      name="word-cloud"
      onPointerMove={handleMove}
      onPointerOut={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (e.index !== undefined) onSelect(e.index);
      }}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <primitive object={material} attach="material" />
    </points>
  );
}

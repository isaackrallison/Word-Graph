import { useEffect, useRef, type RefObject } from 'react';
import type { GestureState, HandFrame } from '../gesture/types';
import { isMockHand } from '../gesture/useGestures';

// Landmark pairs for the hand-skeleton overlay.
const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17], // pinky + palm edge
];

const STATE_LABEL: Record<GestureState, string> = {
  idle: 'show a hand',
  cursor: '✋ cursor',
  orbit: '🤏 orbiting',
  zoom: '🤏🤏 zooming',
};

interface GesturePanelProps {
  enabled: boolean;
  starting: boolean;
  state: GestureState;
  error: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  frameRef: RefObject<HandFrame | null>;
  onToggle(): void;
}

export function GesturePanel({
  enabled,
  starting,
  state,
  error,
  videoRef,
  frameRef,
  onToggle,
}: GesturePanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Skeleton overlay: draw the latest frame's landmarks over the preview.
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const frame = frameRef.current;
      if (!frame) return;
      const { width: w, height: h } = canvas;
      for (const hand of frame.hands) {
        const l = hand.landmarks;
        ctx.strokeStyle = 'rgba(125, 211, 252, 0.9)';
        ctx.lineWidth = 1.5;
        for (const [a, b] of BONES) {
          ctx.beginPath();
          ctx.moveTo(l[a].x * w, l[a].y * h);
          ctx.lineTo(l[b].x * w, l[b].y * h);
          ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        for (const p of l) {
          ctx.beginPath();
          ctx.arc(p.x * w, p.y * h, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [enabled, frameRef]);

  return (
    <div className="gesture-panel">
      {enabled && !isMockHand() && (
        <div className="gesture-preview">
          {/* landmarks are pre-mirrored, so mirror the video to match */}
          <video ref={videoRef} muted playsInline />
          <canvas ref={canvasRef} width={224} height={168} />
          <span className="gesture-state">{STATE_LABEL[state]}</span>
        </div>
      )}
      {enabled && isMockHand() && (
        <p className="gesture-mock-hint">
          mock hand: move mouse = cursor · hold click = pinch · shift = second hand
          <span className="gesture-state">{STATE_LABEL[state]}</span>
        </p>
      )}
      <button className="gesture-toggle" onClick={onToggle} disabled={starting}>
        {starting ? 'starting camera…' : enabled ? '✕ stop gestures' : '✋ enable gestures'}
      </button>
      {error && <p className="gesture-error">{error}</p>}
    </div>
  );
}

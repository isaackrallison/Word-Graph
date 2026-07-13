import { useCallback, useEffect, useRef, useState } from 'react';
import type { HandSource } from './HandSource';
import { MediaPipeSource } from './MediaPipeSource';
import { MouseMockSource } from './MouseMockSource';
import { GestureMachine } from './gestures';
import type { GestureState, HandFrame } from './types';

export interface GestureHandlers {
  onOrbit(dx: number, dy: number): void;
  onDolly(factor: number): void;
  onCursor(pos: { x: number; y: number } | null): void;
  onSelect(pos: { x: number; y: number }): void;
}

export const isMockHand = () =>
  new URLSearchParams(window.location.search).has('mockhand');

/** Owns the hand source + gesture machine. Enable via toggle(); the video
 *  element (rendered by GesturePanel when enabled) receives the webcam feed. */
export function useGestures(handlers: GestureHandlers) {
  const [enabled, setEnabled] = useState(false);
  const [starting, setStarting] = useState(false);
  const [state, setState] = useState<GestureState>('idle');
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HandFrame | null>(null); // latest frame, for the skeleton overlay
  const sourceRef = useRef<HandSource | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const source: HandSource = isMockHand() ? new MouseMockSource() : new MediaPipeSource();
    const machine = new GestureMachine((e) => {
      const h = handlersRef.current;
      switch (e.type) {
        case 'orbit':
          h.onOrbit(e.dx, e.dy);
          break;
        case 'dolly':
          h.onDolly(e.factor);
          break;
        case 'cursor':
          h.onCursor({ x: e.x, y: e.y });
          break;
        case 'cursorEnd':
          h.onCursor(null);
          break;
        case 'select':
          h.onSelect({ x: e.x, y: e.y });
          break;
        case 'state':
          setState(e.state);
          break;
      }
    });
    source.onFrame = (f) => {
      frameRef.current = f;
      machine.frame(f);
    };
    sourceRef.current = source;
    setStarting(true);
    setError(null);
    source
      .start(videoRef.current)
      .catch((err: Error) => {
        setError(
          err.name === 'NotAllowedError'
            ? 'Camera permission denied — allow camera access and try again.'
            : `Couldn't start hand tracking: ${err.message}`
        );
        setEnabled(false);
      })
      .finally(() => setStarting(false));

    return () => {
      source.stop();
      sourceRef.current = null;
      frameRef.current = null;
      handlersRef.current.onCursor(null);
      setState('idle');
    };
  }, [enabled]);

  const toggle = useCallback(() => setEnabled((e) => !e), []);

  return { enabled, starting, state, error, toggle, videoRef, frameRef };
}

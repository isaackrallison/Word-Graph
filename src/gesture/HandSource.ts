import type { HandFrame } from './types';

/** A stream of hand frames. MediaPipeSource tracks a real webcam;
 *  MouseMockSource fakes a hand with the mouse for dev/testing. */
export interface HandSource {
  onFrame: ((frame: HandFrame) => void) | null;
  /** `video` is where a webcam source attaches its stream (also the preview). */
  start(video: HTMLVideoElement | null): Promise<void>;
  stop(): void;
}

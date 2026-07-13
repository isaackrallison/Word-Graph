import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { HandSource } from './HandSource';
import type { HandFrame } from './types';

/** Webcam + MediaPipe HandLandmarker → HandFrame stream.
 *  Landmarks are mirrored (x → 1−x) so they're in selfie/screen space. */
export class MediaPipeSource implements HandSource {
  onFrame: ((frame: HandFrame) => void) | null = null;
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private raf = 0;
  private lastVideoTime = -1;
  private stopped = false;

  async start(video: HTMLVideoElement | null): Promise<void> {
    if (!video) throw new Error('MediaPipeSource needs a video element');

    // start() awaits three times; stop() can arrive during any of them.
    // Check after each acquisition so a mid-startup stop releases everything
    // instead of leaving the webcam running behind a disabled UI.
    const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    if (this.stopped) return;
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: '/mediapipe/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });
    if (this.stopped) {
      this.stop();
      return;
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    if (this.stopped) {
      this.stop();
      return;
    }
    video.srcObject = this.stream;
    await video.play();
    if (this.stopped) {
      this.stop();
      return;
    }

    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (!this.landmarker || video.readyState < 2) return;
      if (video.currentTime === this.lastVideoTime) return; // no new frame
      this.lastVideoTime = video.currentTime;

      const res = this.landmarker.detectForVideo(video, performance.now());
      this.onFrame?.({
        hands: res.landmarks.map((lm) => ({
          landmarks: lm.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })),
        })),
        t: performance.now(),
      });
    };
    loop();
  }

  stop(): void {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.lastVideoTime = -1;
  }
}

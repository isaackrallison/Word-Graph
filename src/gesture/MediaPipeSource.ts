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

  async start(video: HTMLVideoElement | null): Promise<void> {
    if (!video) throw new Error('MediaPipeSource needs a video element');

    const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
    this.landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: '/mediapipe/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    });

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
      audio: false,
    });
    video.srcObject = this.stream;
    await video.play();

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
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.landmarker?.close();
    this.landmarker = null;
    this.lastVideoTime = -1;
  }
}

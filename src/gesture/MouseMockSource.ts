// Dev/test hand source (?mockhand=1): the mouse acts as one hand through the
// REAL gesture machine — mouse position = hand position, button held = pinch,
// Shift adds a second pinching hand mirrored around screen center (for zoom).
import type { HandSource } from './HandSource';
import type { HandData, HandFrame, Point3 } from './types';

function syntheticHand(cx: number, cy: number, pinched: boolean): HandData {
  const p = (x: number, y: number): Point3 => ({ x, y, z: 0 });
  const landmarks: Point3[] = Array.from({ length: 21 }, () => p(cx, cy));
  landmarks[0] = p(cx, cy + 0.08);
  landmarks[5] = p(cx - 0.05, cy);
  landmarks[17] = p(cx + 0.05, cy);
  if (!pinched) {
    landmarks[4] = p(cx - 0.04, cy - 0.04);
    landmarks[8] = p(cx + 0.04, cy + 0.04);
  }
  return { landmarks };
}

export class MouseMockSource implements HandSource {
  onFrame: ((frame: HandFrame) => void) | null = null;
  private raf = 0;
  private x = 0.5;
  private y = 0.5;
  private down = false;
  private shift = false;
  private abort = new AbortController();

  async start(): Promise<void> {
    const opts = { signal: this.abort.signal };
    window.addEventListener(
      'pointermove',
      (e) => {
        this.x = e.clientX / window.innerWidth;
        this.y = e.clientY / window.innerHeight;
        this.shift = e.shiftKey;
      },
      opts
    );
    window.addEventListener('pointerdown', (e) => {
      this.down = true;
      this.shift = e.shiftKey;
    }, opts);
    window.addEventListener('pointerup', () => (this.down = false), opts);
    window.addEventListener('keydown', (e) => e.key === 'Shift' && (this.shift = true), opts);
    window.addEventListener('keyup', (e) => e.key === 'Shift' && (this.shift = false), opts);

    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const hands = [syntheticHand(this.x, this.y, this.down)];
      if (this.shift) {
        // mirrored second hand → moving away from center spreads the pair
        hands.push(syntheticHand(1 - this.x, 1 - this.y, this.down));
      }
      this.onFrame?.({ hands, t: performance.now() });
    };
    loop();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.abort.abort();
  }
}

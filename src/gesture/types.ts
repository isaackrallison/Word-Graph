// Shared gesture types. Landmark coordinates are normalized [0,1] video
// coords, already mirrored so +x = user's right on screen.

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** 21 MediaPipe hand landmarks. Indices used here:
 *  0 wrist · 4 thumb tip · 5 index MCP · 8 index tip · 17 pinky MCP */
export interface HandData {
  landmarks: Point3[];
}

export interface HandFrame {
  hands: HandData[];
  t: number; // ms timestamp
}

export type GestureState = 'idle' | 'cursor' | 'orbit' | 'zoom';

export type GestureEvent =
  | { type: 'orbit'; dx: number; dy: number } // normalized screen-fraction deltas
  | { type: 'dolly'; factor: number } // multiply camera distance by this
  | { type: 'cursor'; x: number; y: number } // normalized [0,1], y down
  | { type: 'cursorEnd' }
  | { type: 'select'; x: number; y: number } // pinch-tap at this screen position
  | { type: 'state'; state: GestureState };

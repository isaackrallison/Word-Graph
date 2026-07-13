// Vendors MediaPipe hand-tracking assets into public/mediapipe/ so the app
// works offline (kiosk): the wasm fileset from node_modules and the
// hand_landmarker model from Google's model zoo.
//
//   npm run fetch-mediapipe

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';

const WASM_SRC = 'node_modules/@mediapipe/tasks-vision/wasm';
const OUT_DIR = 'public/mediapipe';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';
const MODEL_PATH = `${OUT_DIR}/hand_landmarker.task`;

async function main() {
  mkdirSync(`${OUT_DIR}/wasm`, { recursive: true });

  for (const f of readdirSync(WASM_SRC)) {
    copyFileSync(`${WASM_SRC}/${f}`, `${OUT_DIR}/wasm/${f}`);
  }
  console.log(`copied wasm fileset (${readdirSync(WASM_SRC).length} files)`);

  if (existsSync(MODEL_PATH) && statSync(MODEL_PATH).size > 1_000_000) {
    console.log('hand_landmarker.task already present — skipping download');
    return;
  }
  console.log('downloading hand_landmarker.task…');
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`model download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(MODEL_PATH, buf);
  console.log(`saved ${MODEL_PATH} (${(buf.length / 1e6).toFixed(1)} MB)`);
}

main();

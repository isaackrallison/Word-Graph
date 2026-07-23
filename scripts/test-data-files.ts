// Sanity checks on the generated public/data files — catches a broken or
// half-finished precompute before the app ships it. Skips (successfully)
// when the data hasn't been generated.
//   npx tsx scripts/test-data-files.ts

import { existsSync, readFileSync } from 'node:fs';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const DIR = 'public/data';
if (!existsSync(`${DIR}/meta.json`)) {
  console.log('no public/data — run `npm run precompute` first (skipping)');
  process.exit(0);
}

const meta = JSON.parse(readFileSync(`${DIR}/meta.json`, 'utf8'));
const words = JSON.parse(readFileSync(`${DIR}/words.json`, 'utf8')) as { w: string; c: number }[];
const quant = new Int16Array(readFileSync(`${DIR}/coords.i16`).buffer.slice(0));
const layout = new Float32Array(readFileSync(`${DIR}/layout.f32`).buffer.slice(0));
const proj = new Float32Array(readFileSync(`${DIR}/projection.bin`).buffer.slice(0));

const { count, dims, pcaDims, coordScales, cloudRadius } = meta;

check('meta counts are sane', count > 0 && dims === 1536 && pcaDims > 0);
check('words.json length matches meta', words.length === count, `${words.length} vs ${count}`);
check('coords.i16 shape matches', quant.length === count * pcaDims);
check('layout.f32 shape matches', layout.length === count * 3);
check('projection.bin shape matches', proj.length === dims + pcaDims * dims);
check('coordScales present for every dim', Array.isArray(coordScales) && coordScales.length === pcaDims);
check('coordScales all positive finite', coordScales.every((s: number) => Number.isFinite(s) && s > 0));

check('cluster ids within palette range', words.every((w) => w.c >= 0 && w.c < 8));
check('word list has no duplicates', new Set(words.map((w) => w.w)).size === words.length);
check('all words are non-empty lowercase', words.every((w) => /^[a-z]+$/.test(w.w)));

let layoutOk = true;
let maxAbs = 0;
for (let i = 0; i < layout.length; i++) {
  if (!Number.isFinite(layout[i])) layoutOk = false;
  maxAbs = Math.max(maxAbs, Math.abs(layout[i]));
}
check('layout values all finite', layoutOk);
check('layout normalized to cloudRadius', Math.abs(maxAbs - cloudRadius) < 1, `max |v| = ${maxAbs.toFixed(1)}`);

let projOk = true;
for (let i = 0; i < proj.length; i++) if (!Number.isFinite(proj[i])) projOk = false;
check('projection values all finite', projOk);

// Quantization uses the full int16 range in at least one dim (scales were fit).
let sawSaturated = false;
for (let i = 0; i < quant.length; i++) if (Math.abs(quant[i]) === 32767) sawSaturated = true;
check('quantization uses the full int16 range', sawSaturated);

// Region anchors (optional file, but validate when present).
if (existsSync(`${DIR}/regions.json`)) {
  const regions = JSON.parse(readFileSync(`${DIR}/regions.json`, 'utf8')) as {
    w: string;
    x: number;
    y: number;
    z: number;
  }[];
  const wordSet = new Set(words.map((w) => w.w));
  check('regions.json non-empty', regions.length > 0, `${regions.length} regions`);
  check('region names are real words', regions.every((r) => wordSet.has(r.w)));
  check('region names are unique', new Set(regions.map((r) => r.w)).size === regions.length);
  check(
    'region positions within cloud',
    regions.every(
      (r) =>
        [r.x, r.y, r.z].every(Number.isFinite) &&
        Math.max(Math.abs(r.x), Math.abs(r.y), Math.abs(r.z)) <= cloudRadius + 1
    )
  );
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

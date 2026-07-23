// Loads the precomputed data files from public/data/. Scene positions come
// from the precomputed UMAP 3-D layout; the raw 300-dim word2vec coords are used
// for similarity (nearest neighbors and new-word placement) — no PCA, so a typed
// word's vector from /api/embed lands directly in this space.

export interface WordEntry {
  word: string;
  cluster: number;
}

/** A map-style "constellation" region: a name at a scene-space centroid. */
export interface Region {
  word: string;
  position: [number, number, number];
}

export interface GraphData {
  words: WordEntry[];
  count: number;
  dims: number; // word2vec dims (300) — coords are the raw vectors, no PCA
  coords: Float32Array; // count x dims, row-major (dequantized)
  positions: Float32Array; // count x 3 scene positions (UMAP layout, scene units)
  cloudRadius: number; // scene half-extent the layout is normalized to
  regions: Region[]; // named region anchors for map-style labels (may be empty)
}

async function fetchBuffer(url: string, onChunk?: (bytes: number) => void): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status}`);
  if (!res.body || !onChunk) return res.arrayBuffer();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    onChunk(value.length);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out.buffer;
}

export async function loadGraphData(
  onProgress?: (fraction: number) => void
): Promise<GraphData> {
  const meta = (await fetch('/data/meta.json').then((r) => r.json())) as {
    dims: number;
    count: number;
    coordScales: number[];
    cloudRadius: number;
  };
  const { dims, count, coordScales, cloudRadius } = meta;

  // Expected byte totals are known from meta — drive a real progress bar for
  // the big binary files (words.json is a rounding error next to coords.i16).
  const totalBytes = count * dims * 2 + count * 3 * 4;
  let received = 0;
  const onChunk = (bytes: number) => {
    received += bytes;
    onProgress?.(Math.min(received / totalBytes, 1));
  };

  const [wordsRaw, coordsBuf, layoutBuf, regionsRaw] = await Promise.all([
    fetch('/data/words.json').then((r) => r.json()) as Promise<{ w: string; c: number }[]>,
    fetchBuffer('/data/coords.i16', onChunk),
    fetchBuffer('/data/layout.f32', onChunk),
    // Optional — an older data build may not have it; degrade to no regions.
    fetch('/data/regions.json')
      .then((r) => (r.ok ? (r.json() as Promise<{ w: string; x: number; y: number; z: number }[]>) : []))
      .catch(() => []),
  ]);
  const quant = new Int16Array(coordsBuf);
  const positions = new Float32Array(layoutBuf);
  if (
    quant.length !== count * dims ||
    coordScales?.length !== dims ||
    positions.length !== count * 3
  ) {
    throw new Error('data files are inconsistent — re-run `npm run precompute`');
  }

  // Dequantize the int16 word2vec coords (per-dimension scales from meta.json).
  const coords = new Float32Array(quant.length);
  for (let i = 0; i < count; i++) {
    const row = i * dims;
    for (let j = 0; j < dims; j++) coords[row + j] = quant[row + j] * coordScales[j];
  }

  return {
    words: (wordsRaw as { w: string; c: number }[]).map(({ w, c }) => ({ word: w, cluster: c })),
    count,
    dims,
    coords,
    positions,
    cloudRadius,
    regions: (regionsRaw as { w: string; x: number; y: number; z: number }[]).map((r) => ({
      word: r.w,
      position: [r.x, r.y, r.z] as [number, number, number],
    })),
  };
}

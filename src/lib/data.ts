// Loads the precomputed data files from public/data/. Scene positions come
// from the precomputed UMAP 3-D layout; the 50-dim PCA coords are used for
// similarity (nearest neighbors and new-word placement).

export interface WordEntry {
  word: string;
  cluster: number;
}

export interface GraphData {
  words: WordEntry[];
  count: number;
  dims: number; // raw embedding dims (1536)
  pcaDims: number; // reduced dims (192)
  coords: Float32Array; // count x pcaDims, row-major (dequantized)
  mean: Float32Array; // dims
  components: Float32Array; // pcaDims x dims, row-major
  positions: Float32Array; // count x 3 scene positions (UMAP layout, scene units)
  cloudRadius: number; // scene half-extent the layout is normalized to
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
    pcaDims: number;
    count: number;
    coordScales: number[];
    cloudRadius: number;
  };
  const { dims, pcaDims, count, coordScales, cloudRadius } = meta;

  // Expected byte totals are known from meta — drive a real progress bar for
  // the big binary files (words.json is a rounding error next to coords.i16).
  const totalBytes = count * pcaDims * 2 + count * 3 * 4 + (dims + pcaDims * dims) * 4;
  let received = 0;
  const onChunk = (bytes: number) => {
    received += bytes;
    onProgress?.(Math.min(received / totalBytes, 1));
  };

  const [wordsRaw, coordsBuf, projBuf, layoutBuf] = await Promise.all([
    fetch('/data/words.json').then((r) => r.json()) as Promise<{ w: string; c: number }[]>,
    fetchBuffer('/data/coords.i16', onChunk),
    fetchBuffer('/data/projection.bin', onChunk),
    fetchBuffer('/data/layout.f32', onChunk),
  ]);
  const quant = new Int16Array(coordsBuf);
  const proj = new Float32Array(projBuf);
  const positions = new Float32Array(layoutBuf);
  const mean = proj.slice(0, dims);
  const components = proj.slice(dims);
  if (
    quant.length !== count * pcaDims ||
    coordScales?.length !== pcaDims ||
    components.length !== pcaDims * dims ||
    positions.length !== count * 3
  ) {
    throw new Error('data files are inconsistent — re-run `npm run precompute`');
  }

  // Dequantize the int16 PCA coords (per-dimension scales from meta.json).
  const coords = new Float32Array(quant.length);
  for (let i = 0; i < count; i++) {
    const row = i * pcaDims;
    for (let j = 0; j < pcaDims; j++) coords[row + j] = quant[row + j] * coordScales[j];
  }

  return {
    words: (wordsRaw as { w: string; c: number }[]).map(({ w, c }) => ({ word: w, cluster: c })),
    count,
    dims,
    pcaDims,
    coords,
    mean,
    components,
    positions,
    cloudRadius,
  };
}

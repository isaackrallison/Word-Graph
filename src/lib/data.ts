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
  pcaDims: number; // reduced dims (50)
  coords: Float32Array; // count x pcaDims, row-major (dequantized)
  mean: Float32Array; // dims
  components: Float32Array; // pcaDims x dims, row-major
  positions: Float32Array; // count x 3 scene positions (UMAP layout, scene units)
  cloudRadius: number; // scene half-extent the layout is normalized to
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to load ${url}: ${res.status}`);
  return res.arrayBuffer();
}

export async function loadGraphData(): Promise<GraphData> {
  const [meta, wordsRaw, coordsBuf, projBuf, layoutBuf] = await Promise.all([
    fetch('/data/meta.json').then((r) => r.json()),
    fetch('/data/words.json').then((r) => r.json()) as Promise<{ w: string; c: number }[]>,
    fetchBuffer('/data/coords.i16'),
    fetchBuffer('/data/projection.bin'),
    fetchBuffer('/data/layout.f32'),
  ]);

  const { dims, pcaDims, count, coordScales, cloudRadius } = meta as {
    dims: number;
    pcaDims: number;
    count: number;
    coordScales: number[];
    cloudRadius: number;
  };
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

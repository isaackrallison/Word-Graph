"""Reduction pipeline: embeddings → PCA(50) → k-means(8) → UMAP-3D → public/data/.

Reads the binary cache written by scripts/embed.ts and produces everything the
app loads at runtime. NumPy/sklearn/umap-learn handle 100k x 1536 in minutes.

Outputs (public/data/):
  words.json      [{w, c}] in coord order
  coords.i16      N x 50 int16, per-dim quantized PCA coords (scales in meta)
  layout.f32      N x 3 float32 scene positions from UMAP (normalized)
  projection.bin  float32: mean(1536) ++ components(50 x 1536) row-major
  meta.json       dims, pcaDims, count, coordScales, layout tag, …
"""

import json
import time

import numpy as np

EMBED_DIMS = 1536
PCA_DIMS = 192
K_CLUSTERS = 8
CLOUD_RADIUS = 100.0  # scene half-extent (larger than the 1k version — 100x the points)
OUT = "public/data"

t0 = time.time()
log = lambda msg: print(f"[{time.time() - t0:6.1f}s] {msg}", flush=True)

words = json.load(open("scripts/.cache/embed-words.json"))["words"]
X = np.fromfile("scripts/.cache/embeddings.f32", dtype=np.float32).reshape(-1, EMBED_DIMS)
assert len(X) == len(words), f"cache mismatch: {len(X)} vectors vs {len(words)} words"
log(f"loaded {len(X)} embeddings")

# --- PCA via covariance eigendecomposition ---
mean = X.mean(axis=0)
Xc = (X - mean).astype(np.float32)
cov = (Xc.T @ Xc) / len(Xc)
evals, evecs = np.linalg.eigh(cov.astype(np.float64))
order = np.argsort(evals)[::-1]
components = evecs[:, order[:PCA_DIMS]].T.astype(np.float32)  # PCA_DIMS x 1536
coords = Xc @ components.T  # N x 50
explained50 = float(evals[order[:PCA_DIMS]].sum() / evals.sum())
explained3 = float(evals[order[:3]].sum() / evals.sum())
log(f"PCA done — 50d explains {explained50 * 100:.1f}%")

# --- k-means for cluster colors ---
from sklearn.cluster import MiniBatchKMeans

labels = MiniBatchKMeans(K_CLUSTERS, random_state=42, n_init=10).fit_predict(coords)
log("k-means done")

# --- UMAP 3-D layout (cosine, multithreaded) ---
import umap

emb3 = umap.UMAP(
    n_components=3, n_neighbors=15, min_dist=0.15, spread=1.2, metric="cosine", verbose=True
).fit_transform(coords)
log("UMAP done")

# --- write outputs ---
import os

os.makedirs(OUT, exist_ok=True)

emb3 = emb3 - emb3.mean(axis=0)
emb3 = emb3 * (CLOUD_RADIUS / np.abs(emb3).max())
emb3.astype(np.float32).tofile(f"{OUT}/layout.f32")

scales = np.abs(coords).max(axis=0) / 32767.0
quant = np.round(coords / scales).astype(np.int16)
quant.tofile(f"{OUT}/coords.i16")

proj = np.concatenate([mean.astype(np.float32).ravel(), components.ravel()])
proj.tofile(f"{OUT}/projection.bin")

json.dump(
    [{"w": w, "c": int(c)} for w, c in zip(words, labels)],
    open(f"{OUT}/words.json", "w"),
    separators=(",", ":"),
)

json.dump(
    {
        "dims": EMBED_DIMS,
        "pcaDims": PCA_DIMS,
        "count": len(words),
        "model": "text-embedding-3-small",
        "layout": "umap-3d",
        "cloudRadius": CLOUD_RADIUS,
        "coordScales": [float(s) for s in scales],
        "explainedVariance3d": explained3,
        "explainedVariance50d": explained50,
    },
    open(f"{OUT}/meta.json", "w"),
)
log("wrote public/data/")

# --- sanity: 50-dim cosine neighbors + 3-D layout preservation on a sample ---
norms = np.linalg.norm(coords, axis=1, keepdims=True)
unit = coords / np.maximum(norms, 1e-9)
widx = {w: i for i, w in enumerate(words)}
for probe in ["cat", "pizza", "sad", "computer", "galaxy"]:
    i = widx.get(probe)
    if i is None:
        continue
    sims = unit @ unit[i]
    top = np.argsort(sims)[::-1][1:6]
    print(f"{probe} → {', '.join(words[j] for j in top)}")

rng = np.random.default_rng(0)
sample = rng.choice(len(words), 500, replace=False)
overlap = 0.0
for i in sample:
    sims = unit @ unit[i]
    sims[i] = -np.inf
    true10 = set(np.argpartition(sims, -10)[-10:])
    d3 = ((emb3 - emb3[i]) ** 2).sum(axis=1)
    d3[i] = np.inf
    near10 = set(np.argpartition(d3, 10)[:10])
    overlap += len(true10 & near10) / 10
print(f"3-D neighbor preservation (500-word sample, top-10): {overlap / len(sample) * 100:.1f}%")

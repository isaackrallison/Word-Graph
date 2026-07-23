"""Reduction pipeline: word2vec vectors → k-means(8) → UMAP-3D → public/data/.

Reads the binary cache written by scripts/embed_word2vec.py and produces
everything the app loads at runtime. NumPy/sklearn/umap-learn handle the
~66k x 300 word2vec vectors in seconds.

No PCA: at 300 dims the raw word2vec vectors ARE the shipped similarity space
(coords.i16, ~38MB int16) — the app does cosine directly on them, and a typed
word's vector from /api/embed lands in the same space with no projection. A
measured bake-off (scripts/tune_umap.py + tune_umap_raw.py, scored against the
raw-300 neighbor truth) showed raw-300 input beats a PCA-192 reduction at every
UMAP setting, and picked n_neighbors=8, min_dist=0.0 — recall@10 ≈ 29% (up from
~25% at the old nn=10/md=0.05) with global structure intact.

Outputs (public/data/):
  words.json      [{w, c}] in coord order
  coords.i16      N x 300 int16, per-dim quantized word2vec coords (scales in meta)
  layout.f32      N x 3 float32 scene positions from UMAP (normalized)
  meta.json       dims, count, coordScales, layout tag, …
"""

import json
import time

import numpy as np

EMBED_DIMS = 300  # word2vec-google-news-300
K_CLUSTERS = 8
UMAP_N_NEIGHBORS = 8
UMAP_MIN_DIST = 0.0
CLOUD_RADIUS = 100.0  # scene half-extent
OUT = "public/data"

t0 = time.time()
log = lambda msg: print(f"[{time.time() - t0:6.1f}s] {msg}", flush=True)

# Vocabulary = scripts/wordlist.txt (real-word filtered). Keep only the cached
# embeddings whose word is still in the vocabulary — no re-embedding needed,
# since the wordlist is a subset of what's already cached. Cache order is
# preserved so all output files stay index-aligned.
keep = set(open("scripts/wordlist.txt").read().split())
cached = json.load(open("scripts/.cache/embed-words.json"))["words"]
X_all = np.fromfile("scripts/.cache/embeddings.f32", dtype=np.float32).reshape(-1, EMBED_DIMS)
assert len(X_all) == len(cached), f"cache mismatch: {len(X_all)} vectors vs {len(cached)} words"
mask = np.array([w in keep for w in cached])
words = [w for w, m in zip(cached, mask) if m]
coords = X_all[mask]  # N x 300 — the raw word2vec similarity space (no PCA)
log(
    f"loaded {len(cached)} cached embeddings; kept {len(words)} "
    f"(dropped {len(cached) - len(words)} non-vocab words; "
    f"{len(keep) - len(words)} wordlist words have no cached embedding — skipped this build)"
)

# --- k-means for cluster colors ---
# Cluster on L2-NORMALIZED vectors (cosine k-means): raw word2vec norms are very
# skewed, so Euclidean k-means on the raw vectors collapses — a few high-norm
# outliers become singleton clusters and ~97% of words fall into one blob (one
# color). Normalizing matches the cosine similarity the app uses everywhere.
from sklearn.cluster import MiniBatchKMeans

unit = coords / np.maximum(np.linalg.norm(coords, axis=1, keepdims=True), 1e-9)
labels = MiniBatchKMeans(K_CLUSTERS, random_state=42, n_init=10).fit_predict(unit)
log("k-means done")

# --- UMAP 3-D layout (cosine, multithreaded) ---
import umap

emb3 = umap.UMAP(
    n_components=3, n_neighbors=UMAP_N_NEIGHBORS, min_dist=UMAP_MIN_DIST, spread=1.0,
    metric="cosine", random_state=42, verbose=True
).fit_transform(coords)
log("UMAP done")

# --- layout quality: top-10 neighbor recall of the 3-D layout vs the raw-300
# word2vec space (the KPI from scripts/eval_layout.py; persisted to meta so it's
# tracked, not just printed. Computed on a fixed 500-word sample, neighbors over
# all N). `unit` was already computed above for k-means. ---
rng = np.random.default_rng(0)
sample = rng.choice(len(words), min(500, len(words)), replace=False)
overlap = 0.0
for i in sample:
    sims = unit @ unit[i]
    sims[i] = -np.inf
    true10 = set(np.argpartition(sims, -10)[-10:])
    d3 = ((emb3 - emb3[i]) ** 2).sum(axis=1)
    d3[i] = np.inf
    near10 = set(np.argpartition(d3, 10)[:10])
    overlap += len(true10 & near10) / 10
recall10_3d = float(overlap / len(sample))
log(f"3-D neighbor recall@10 = {recall10_3d * 100:.1f}%")

# --- write outputs ---
import os

os.makedirs(OUT, exist_ok=True)

emb3 = emb3 - emb3.mean(axis=0)
emb3 = emb3 * (CLOUD_RADIUS / np.abs(emb3).max())
emb3.astype(np.float32).tofile(f"{OUT}/layout.f32")

# Quantize the raw word2vec coords to int16 (per-dim scale). The app dequantizes
# with these scales; measured lossless for neighbor rankings.
scales = np.abs(coords).max(axis=0) / 32767.0
quant = np.round(coords / scales).astype(np.int16)
quant.tofile(f"{OUT}/coords.i16")

json.dump(
    [{"w": w, "c": int(c)} for w, c in zip(words, labels)],
    open(f"{OUT}/words.json", "w"),
    separators=(",", ":"),
)

# --- region anchors for map-style "constellation" labels ---
# k-means on the *3-D layout* (not the raw space), so each region is a contiguous
# blob on screen, named by its most frequent content word. See regions_util.py.
from regions_util import compute_regions

regions = compute_regions(emb3, words)
json.dump(regions, open(f"{OUT}/regions.json", "w"), separators=(",", ":"))
log(f"wrote {len(regions)} region anchors")

json.dump(
    {
        "dims": EMBED_DIMS,
        "count": len(words),
        "model": "word2vec-google-news-300",
        "layout": "umap-3d",
        "umapNeighbors": UMAP_N_NEIGHBORS,
        "umapMinDist": UMAP_MIN_DIST,
        "cloudRadius": CLOUD_RADIUS,
        "coordScales": [float(s) for s in scales],
        "recall10_3d": recall10_3d,
    },
    open(f"{OUT}/meta.json", "w"),
)
log("wrote public/data/")

# --- sanity: cosine neighbors for a few probe words ---
widx = {w: i for i, w in enumerate(words)}
for probe in ["cat", "pizza", "sad", "computer", "galaxy"]:
    i = widx.get(probe)
    if i is None:
        continue
    sims = unit @ unit[i]
    top = np.argsort(sims)[::-1][1:6]
    print(f"{probe} → {', '.join(words[j] for j in top)}")

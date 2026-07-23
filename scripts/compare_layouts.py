"""Reducer bake-off: run candidate 3-D layouts head-to-head on the shipped
PCA-192 coords, then score each with scripts/eval_layout.py.

This is the search that chose reduce.py's UMAP params. Findings (recall@10, full-N):
    umap nn15 md0.15 (old)  38%     pacmap-3d              16-22%
    umap nn10 md0.05 (WIN)  44%     densmap                24%
    umap nn8  md0.0         46%*    (*higher local recall but global structure
    umap nn5  md0.0         45%*     starts fragmenting — R_NX/continuity drop)
PaCMAP/densMAP both lost at n_components=3 (PaCMAP even warns 3-D is untested).

Runs on dequantized coords.i16 (near-lossless) so no 614MB embedding cache is
needed. Each layout uses an identical seed + reduce.py's center/scale-to-radius
normalization. Outputs → scripts/.cache/layout_<name>.f32; eval with:

    ./.venv/bin/python scripts/eval_layout.py scripts/.cache/layout_<name>.f32
"""

import json
import time

import numpy as np

DATA = "public/data"
CACHE = "scripts/.cache"
CLOUD_RADIUS = 100.0
SEED = 42

t0 = time.time()
log = lambda m: print(f"[{time.time() - t0:6.1f}s] {m}", flush=True)


def normalize(emb3):
    emb3 = emb3 - emb3.mean(axis=0)
    return (emb3 * (CLOUD_RADIUS / np.abs(emb3).max())).astype(np.float32)


def load_coords():
    meta = json.load(open(f"{DATA}/meta.json"))
    n, d = meta["count"], meta["pcaDims"]
    scales = np.asarray(meta["coordScales"], dtype=np.float32)
    quant = np.fromfile(f"{DATA}/coords.i16", dtype=np.int16).reshape(n, d)
    return quant.astype(np.float32) * scales, meta


def umap_layout(coords, n_neighbors, min_dist, spread=1.0, densmap=False):
    import umap

    emb = umap.UMAP(
        n_components=3, n_neighbors=n_neighbors, min_dist=min_dist, spread=spread,
        metric="cosine", densmap=densmap, random_state=SEED,
    ).fit_transform(coords)
    return normalize(emb)


def pacmap_layout(coords, n_neighbors=15, apply_pca=True):
    import pacmap

    emb = pacmap.PaCMAP(
        n_components=3, n_neighbors=n_neighbors, distance="angular",
        apply_pca=apply_pca, random_state=SEED,
    ).fit_transform(coords, init="pca")
    return normalize(emb)


# The candidate grid. The winner (umap_nn10_md05) is what reduce.py ships.
CANDIDATES = {
    "umap_old": lambda c: umap_layout(c, 15, 0.15, spread=1.2),
    "umap_nn10_md05": lambda c: umap_layout(c, 10, 0.05),  # ← shipped
    "umap_nn8_md0": lambda c: umap_layout(c, 8, 0.0),
    "umap_nn5_md0": lambda c: umap_layout(c, 5, 0.0),
    "densmap": lambda c: umap_layout(c, 15, 0.15, densmap=True),
    "pacmap": lambda c: pacmap_layout(c, 15),
    "pacmap_nopca": lambda c: pacmap_layout(c, 15, apply_pca=False),
}


def main():
    coords, meta = load_coords()
    log(f"loaded PCA-{meta['pcaDims']} coords ({len(coords)} words)")
    for name, fn in CANDIDATES.items():
        s = time.time()
        fn(coords).tofile(f"{CACHE}/layout_{name}.f32")
        log(f"{name}: {time.time() - s:.1f}s → {CACHE}/layout_{name}.f32")


if __name__ == "__main__":
    main()

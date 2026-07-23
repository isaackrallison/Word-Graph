"""UMAP hyperparameter sweep for the word2vec layout.

Fits a grid of UMAP configs on the shipped PCA-192 coords (coords.i16), scores
each with scripts/eval_layout.py's metrics against the same PCA-192 reference the
app uses, and prints a ranked table. word2vec's neighborhoods pack tighter than
OpenAI's, so the old nn10/md0.05 pick (recall@10 ≈ 26%) may not be optimal.

Saves each layout to scripts/.cache/layout_tune_<name>.f32 so the winner can be
re-evaluated with the full eval_layout.py and, if chosen, copied into reduce.py.

    ./.venv/bin/python scripts/tune_umap.py
"""

import time

import numpy as np
import umap
from sklearn.manifold import trustworthiness

from compare_layouts import load_coords, normalize
from eval_layout import coranking_rnx_auc, recall_at_k

CACHE = "scripts/.cache"
SEED = 42
QUERY_SAMPLE = 2000
SUB_SAMPLE = 4000
EVAL_SEED = 0

t0 = time.time()
log = lambda m: print(f"[{time.time() - t0:6.1f}s] {m}", flush=True)

# (n_neighbors, min_dist). The current ship is (10, 0.05).
GRID = [
    (5, 0.0),
    (8, 0.0),
    (10, 0.0),
    (10, 0.05),  # ← current
    (15, 0.0),
    (15, 0.1),
    (25, 0.0),
    (40, 0.0),
]


def fit(coords, nn, md):
    emb = umap.UMAP(
        n_components=3, n_neighbors=nn, min_dist=md, spread=1.0,
        metric="cosine", random_state=SEED,
    ).fit_transform(coords)
    return normalize(emb)


def main():
    coords, meta = load_coords()
    n = meta["count"]
    unit = coords / np.maximum(np.linalg.norm(coords, axis=1, keepdims=True), 1e-9)
    log(f"loaded PCA-{meta['pcaDims']} coords ({n} words); sweeping {len(GRID)} configs")

    rng = np.random.default_rng(EVAL_SEED)
    qsample = rng.choice(n, min(QUERY_SAMPLE, n), replace=False)
    ssample = rng.choice(n, min(SUB_SAMPLE, n), replace=False)

    rows = []
    for nn, md in GRID:
        s = time.time()
        lay = fit(coords, nn, md)
        name = f"nn{nn}_md{str(md).replace('.', '')}"
        lay.tofile(f"{CACHE}/layout_tune_{name}.f32")
        rec = recall_at_k(unit, lay, (1, 10, 50), qsample)
        R, L = unit[ssample], lay[ssample]
        trust = trustworthiness(R, L, n_neighbors=10, metric="cosine") * 100
        cont = trustworthiness(L, R, n_neighbors=10, metric="cosine") * 100
        auc, _ = coranking_rnx_auc(unit, lay, ssample)
        rows.append((nn, md, rec[1], rec[10], rec[50], trust, cont, auc))
        log(f"nn={nn:<3} md={md:<5} r@10={rec[10]:5.1f}%  RNX={auc:.3f}  ({time.time()-s:.0f}s)")

    rows.sort(key=lambda r: r[3], reverse=True)  # by recall@10
    print("\n=== UMAP sweep (word2vec PCA-192 ref) — sorted by recall@10 ===")
    print(f"{'nn':>4} {'min_dist':>9} {'r@1':>7} {'r@10':>7} {'r@50':>7} "
          f"{'trust':>7} {'cont':>7} {'R_NX':>7}")
    for nn, md, r1, r10, r50, tr, co, auc in rows:
        star = "  <- current" if (nn, md) == (10, 0.05) else ""
        print(f"{nn:>4} {md:>9} {r1:6.1f}% {r10:6.1f}% {r50:6.1f}% "
              f"{tr:6.1f}% {co:6.1f}% {auc:7.3f}{star}")
    best = rows[0]
    print(f"\nbest recall@10: nn={best[0]} min_dist={best[1]} → {best[3]:.1f}%")


if __name__ == "__main__":
    main()

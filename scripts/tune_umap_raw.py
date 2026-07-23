"""Does dropping PCA help? Fit UMAP on the raw 300-d word2vec vectors and score
against the raw-300 neighbor truth — then compare to the PCA-192-input layouts
from tune_umap.py, scored against the SAME raw-300 reference (apples-to-apples).

Ground truth here is raw word2vec cosine neighbors: that's what the app would
preserve if we ship raw 300-d coords and skip PCA. Reads the aligned raw vectors
from scripts/.cache/embeddings.f32 (same row order as public/data/words.json).

Run AFTER tune_umap.py (it reads that run's layout_tune_*.f32 files):
    ./.venv/bin/python scripts/tune_umap_raw.py
"""

import glob
import os
import time

import numpy as np
import umap
from sklearn.manifold import trustworthiness

from compare_layouts import normalize
from eval_layout import coranking_rnx_auc, recall_at_k

CACHE = "scripts/.cache"
EMB = f"{CACHE}/embeddings.f32"
DIM = 300
SEED = 42
QUERY_SAMPLE = 2000
SUB_SAMPLE = 4000
EVAL_SEED = 0

GRID = [(5, 0.0), (8, 0.0), (10, 0.0), (10, 0.05), (15, 0.0), (25, 0.0)]

t0 = time.time()
log = lambda m: print(f"[{time.time() - t0:6.1f}s] {m}", flush=True)


def fit(X, nn, md):
    emb = umap.UMAP(
        n_components=3, n_neighbors=nn, min_dist=md, spread=1.0,
        metric="cosine", random_state=SEED,
    ).fit_transform(X)
    return normalize(emb)


def score(unit, lay, qsample, ssample):
    rec = recall_at_k(unit, lay, (1, 10, 50), qsample)
    R, L = unit[ssample], lay[ssample]
    trust = trustworthiness(R, L, n_neighbors=10, metric="cosine") * 100
    cont = trustworthiness(L, R, n_neighbors=10, metric="cosine") * 100
    auc, _ = coranking_rnx_auc(unit, lay, ssample)
    return rec[1], rec[10], rec[50], trust, cont, auc


def main():
    X = np.fromfile(EMB, dtype=np.float32).reshape(-1, DIM)
    n = len(X)
    # raw-300 cosine reference = the true word2vec neighbor structure
    unit = X / np.maximum(np.linalg.norm(X, axis=1, keepdims=True), 1e-9)
    log(f"raw-300 reference: {n} words x {DIM} dims")

    rng = np.random.default_rng(EVAL_SEED)
    qsample = rng.choice(n, min(QUERY_SAMPLE, n), replace=False)
    ssample = rng.choice(n, min(SUB_SAMPLE, n), replace=False)

    rows = []  # (label, r1, r10, r50, trust, cont, auc)

    # --- new: UMAP fit on raw 300-d input ---
    for nn, md in GRID:
        s = time.time()
        lay = fit(X, nn, md)
        lay.tofile(f"{CACHE}/layout_raw_nn{nn}_md{str(md).replace('.', '')}.f32")
        rows.append((f"raw300  nn{nn} md{md}", *score(unit, lay, qsample, ssample)))
        log(f"raw300 nn={nn} md={md}: r@10={rows[-1][2]:.1f}%  ({time.time()-s:.0f}s)")

    # --- existing PCA-192-input layouts, scored vs the SAME raw-300 truth ---
    for path in sorted(glob.glob(f"{CACHE}/layout_tune_*.f32")):
        lay = np.fromfile(path, dtype=np.float32).reshape(-1, 3)
        if len(lay) != n:
            continue
        tag = os.path.basename(path).replace("layout_tune_", "").replace(".f32", "")
        rows.append((f"pca192  {tag}", *score(unit, lay, qsample, ssample)))
        log(f"scored pca192 {tag}: r@10={rows[-1][2]:.1f}%")

    rows.sort(key=lambda r: r[2], reverse=True)  # recall@10
    print("\n=== layouts vs RAW-300 word2vec truth — sorted by recall@10 ===")
    print(f"{'layout':<22} {'r@1':>7} {'r@10':>7} {'r@50':>7} {'trust':>7} {'cont':>7} {'R_NX':>7}")
    for label, r1, r10, r50, tr, co, auc in rows:
        print(f"{label:<22} {r1:6.1f}% {r10:6.1f}% {r50:6.1f}% {tr:6.1f}% {co:6.1f}% {auc:7.3f}")


if __name__ == "__main__":
    main()

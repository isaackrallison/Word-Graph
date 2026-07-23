"""Measure how faithfully a 3-D layout preserves the high-dim neighbor structure.

Compares a scene layout (N x 3, e.g. public/data/layout.f32) against the PCA-192
reference space the app uses for all similarity math (dequantized from
public/data/coords.i16). Reports:

  recall@k   full-N: mean overlap of a word's true top-k cosine neighbors (in
             PCA-192) with its k nearest points in the 3-D layout. recall@10 is
             the headline number and matches the print in reduce.py.
  trust/cont trustworthiness & continuity at k=10 (Venna & Kaski) — false- and
             missed-neighbor penalties, on a fixed subsample.
  R_NX AUC   area under the R_NX(k) curve (Lee & Verleysen, log-k weighted) from
             a co-ranking matrix — one scalar summarizing local→global quality.

Reference space and both subsamples are seeded, so runs are reproducible and two
layouts are directly comparable. Point it at any layout file to A/B a reducer:

    ./.venv/bin/python scripts/eval_layout.py                         # public/data/layout.f32
    ./.venv/bin/python scripts/eval_layout.py scripts/.cache/pacmap.f32
"""

import json
import sys
import time

import numpy as np
from sklearn.manifold import trustworthiness

DATA = "public/data"
QUERY_SAMPLE = 2000  # words used as recall queries (neighbors searched over all N)
SUB_SAMPLE = 4000  # subsample for co-ranking / trustworthiness (O(M^2))
RECALL_KS = (1, 10, 50)
TC_K = 10  # k for trustworthiness / continuity
SEED = 0

t0 = time.time()
log = lambda m: print(f"[{time.time() - t0:5.1f}s] {m}", flush=True)


def load_reference():
    """Dequantize coords.i16 → the PCA-192 space, L2-normalized for cosine."""
    meta = json.load(open(f"{DATA}/meta.json"))
    n, d = meta["count"], meta["pcaDims"]
    scales = np.asarray(meta["coordScales"], dtype=np.float32)
    quant = np.fromfile(f"{DATA}/coords.i16", dtype=np.int16).reshape(n, d)
    coords = quant.astype(np.float32) * scales
    unit = coords / np.maximum(np.linalg.norm(coords, axis=1, keepdims=True), 1e-9)
    return unit, meta


def load_layout(path, n):
    lay = np.fromfile(path, dtype=np.float32).reshape(-1, 3)
    assert len(lay) == n, f"{path}: {len(lay)} rows vs {n} reference words"
    return lay


def recall_at_k(unit, lay, ks, sample):
    """Full-N: for each query, |topk_cosine(ref) ∩ topk_euclid(layout)| / k."""
    kmax = max(ks)
    hits = {k: 0.0 for k in ks}
    for i in sample:
        sims = unit @ unit[i]
        sims[i] = -np.inf
        true_order = np.argpartition(sims, -kmax)[-kmax:]
        true_order = true_order[np.argsort(sims[true_order])[::-1]]

        d3 = ((lay - lay[i]) ** 2).sum(axis=1)
        d3[i] = np.inf
        lay_order = np.argpartition(d3, kmax)[:kmax]
        lay_order = lay_order[np.argsort(d3[lay_order])]

        for k in ks:
            hits[k] += len(set(true_order[:k]) & set(lay_order[:k])) / k
    return {k: hits[k] / len(sample) * 100 for k in ks}


def coranking_rnx_auc(unit, lay, sub):
    """R_NX(k) AUC over a subsample. R_NX rescales Q_NX to chance-baseline; the
    AUC uses log-k weighting so local and global scales count equally."""
    R = unit[sub]
    L = lay[sub]
    m = len(sub)
    # High-dim rank of every pair (cosine dist), low-dim rank (euclidean).
    dh = 1.0 - (R @ R.T)
    dl = ((L[:, None, :] - L[None, :, :]) ** 2).sum(-1)
    np.fill_diagonal(dh, np.inf)  # self sorts last → gets top rank, excluded below
    np.fill_diagonal(dl, np.inf)
    rho = dh.argsort(axis=1).argsort(axis=1) + 1  # 1-based rank; self == m
    r = dl.argsort(axis=1).argsort(axis=1) + 1
    off = ~np.eye(m, dtype=bool)  # drop self pairs → neighbor ranks are 1..m-1

    # Co-ranking matrix Q[k-1, l-1] = #pairs with high-rank k, low-rank l.
    Q = np.zeros((m - 1, m - 1), dtype=np.int64)
    np.add.at(Q, (rho[off] - 1, r[off] - 1), 1)

    # Q_NX(k): fraction of k-neighborhoods preserved; R_NX rescales vs chance.
    qnx = np.zeros(m - 1)
    csum = 0
    for k in range(1, m):
        # add the L-shaped border of the top-left k x k block
        csum += Q[k - 1, :k].sum() + Q[:k, k - 1].sum() - Q[k - 1, k - 1]
        qnx[k - 1] = csum / (k * m)
    ks = np.arange(1, m)
    valid = ks < m - 1  # k=m-1 has a zero denominator
    rnx = np.full(m - 1, np.nan)
    rnx[valid] = ((m - 1) * qnx[valid] - ks[valid]) / (m - 1 - ks[valid])
    # AUC with 1/k weighting (Lee & Verleysen 2015): local & global scales equal.
    w = 1.0 / ks
    auc = float((rnx[valid] * w[valid]).sum() / w[valid].sum())
    return auc, rnx


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else f"{DATA}/layout.f32"
    unit, meta = load_reference()
    n = meta["count"]
    lay = load_layout(path, n)
    log(f"loaded ref PCA-{meta['pcaDims']} ({n} words) + layout {path}")

    rng = np.random.default_rng(SEED)
    qsample = rng.choice(n, min(QUERY_SAMPLE, n), replace=False)
    rec = recall_at_k(unit, lay, RECALL_KS, qsample)
    log("recall done")

    ssample = rng.choice(n, min(SUB_SAMPLE, n), replace=False)
    R, L = unit[ssample], lay[ssample]
    # trustworthiness wants a metric on the *reference*; cosine on unit vecs.
    trust = trustworthiness(R, L, n_neighbors=TC_K, metric="cosine") * 100
    cont = trustworthiness(L, R, n_neighbors=TC_K, metric="cosine") * 100
    log("trust/continuity done")
    auc, _ = coranking_rnx_auc(unit, lay, ssample)
    log("R_NX AUC done")

    print("\n=== layout quality:", path, "===")
    for k in RECALL_KS:
        print(f"  recall@{k:<3d} (full-N, {len(qsample)} queries): {rec[k]:5.1f}%")
    print(f"  trustworthiness@{TC_K} (n={len(ssample)}):   {trust:5.1f}%")
    print(f"  continuity@{TC_K}     (n={len(ssample)}):   {cont:5.1f}%")
    print(f"  R_NX AUC (log-k weighted):        {auc:5.3f}   (0=chance, 1=perfect)")


if __name__ == "__main__":
    main()

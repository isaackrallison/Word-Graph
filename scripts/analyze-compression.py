"""Quantify how much each compression step distorts the similarity math.

Compares top-10 nearest neighbors against the full 1536-dim ground truth for:
  - PCA-k float32 (truncation error) for several k
  - PCA-k int16-quantized (truncation + quantization)
Plus the classic algebra queries in each space.

    ./.venv/bin/python scripts/analyze-compression.py
"""

import json

import numpy as np

X = np.fromfile("scripts/.cache/embeddings.f32", dtype=np.float32).reshape(-1, 1536)
words = json.load(open("scripts/.cache/embed-words.json"))["words"]
widx = {w: i for i, w in enumerate(words)}
N = len(words)
print(f"{N} words loaded")

mean = X.mean(axis=0)
Xc = X - mean
cov = (Xc.T @ Xc) / N
evals, evecs = np.linalg.eigh(cov.astype(np.float64))
order = np.argsort(evals)[::-1]

def unit(M):
    return M / np.maximum(np.linalg.norm(M, axis=-1, keepdims=True), 1e-12)

full_u = unit(Xc)  # ground truth space (centered, like PCA with all dims)

def topk(space_u, qvec, k=10, exclude=()):
    sims = space_u @ (qvec / max(np.linalg.norm(qvec), 1e-12))
    for e in exclude:
        sims[e] = -np.inf
    return list(np.argsort(sims)[::-1][:k])

rng = np.random.default_rng(7)
sample = rng.choice(N, 250, replace=False)

# ground truth top-10 for the sample
truth = {}
for i in sample:
    truth[int(i)] = set(topk(full_u, Xc[i], 11, exclude=[int(i)]))

def evaluate(k_dims, quantize):
    comp = evecs[:, order[:k_dims]].T.astype(np.float32)  # k x 1536
    coords = Xc @ comp.T
    if quantize:
        scales = np.abs(coords).max(axis=0) / 32767.0
        coords = np.round(coords / scales).astype(np.int16).astype(np.float32) * scales
    cu = unit(coords)
    overlap = 0.0
    for i in sample:
        got = set(topk(cu, coords[int(i)], 11, exclude=[int(i)]))
        overlap += len(got & truth[int(i)]) / 10
    ev = float(evals[order[:k_dims]].sum() / evals.sum())
    tag = f"PCA-{k_dims}{' int16' if quantize else ' float'}"
    print(f"{tag:>16}: top-10 overlap vs full space = {overlap / len(sample) * 100:5.1f}%   (variance kept {ev*100:4.1f}%)")
    return coords, cu

for k in [50, 96, 128, 192, 256]:
    evaluate(k, False)
print()
c50q, _ = evaluate(50, True)
c128q, _ = evaluate(128, True)
c192q, _ = evaluate(192, True)

# --- algebra queries across spaces ---
def algebra(space_coords, terms_signs, k=5):
    q = np.zeros(space_coords.shape[1], dtype=np.float64)
    ex = []
    for w, s in terms_signs:
        q += s * space_coords[widx[w]]
        ex.append(widx[w])
    su = unit(space_coords)
    idxs = topk(su, q, k + 6, exclude=ex)
    out = []
    for i in idxs:
        wrd = words[i]
        if any(wrd == t or wrd == t + "s" or wrd + "s" == t for t, _ in terms_signs):
            continue
        out.append(wrd)
        if len(out) == k:
            break
    return out

QUERIES = [
    [("king", 1), ("man", -1), ("woman", 1)],
    [("paris", 1), ("france", -1), ("japan", 1)],
    [("sushi", 1), ("japan", -1), ("italy", 1)],
    [("puppy", 1), ("dog", -1), ("cat", 1)],
    [("berlin", 1), ("germany", -1), ("spain", 1)],
]

comp128 = evecs[:, order[:128]].T.astype(np.float32)
c128 = Xc @ comp128.T
comp50 = evecs[:, order[:50]].T.astype(np.float32)
c50 = Xc @ comp50.T

print("\nalgebra: full-1536  |  PCA-50  |  PCA-128")
for q in QUERIES:
    expr = " ".join(("+" if s > 0 else "-") + w for w, s in q).lstrip("+")
    a = algebra(Xc, q)
    b = algebra(c50, q)
    c = algebra(c128, q)
    print(f"  {expr}")
    print(f"    full : {', '.join(a)}")
    print(f"    50d  : {', '.join(b)}")
    print(f"    128d : {', '.join(c)}")

"""Regenerate public/data/regions.json from the shipped layout — fast, no PCA/
UMAP and no 614MB embedding cache. Uses the same logic reduce.py bakes in
(scripts/regions_util.py), so the output matches a full rebuild. Handy for
iterating on region naming (the STOPWORDS list) without re-reducing.

    ./.venv/bin/python scripts/make_regions.py
"""

import json

import numpy as np

from regions_util import compute_regions

DATA = "public/data"

words = [e["w"] for e in json.load(open(f"{DATA}/words.json"))]
emb3 = np.fromfile(f"{DATA}/layout.f32", dtype=np.float32).reshape(-1, 3)
assert len(emb3) == len(words), f"{len(emb3)} positions vs {len(words)} words"

regions = compute_regions(emb3, words)
json.dump(regions, open(f"{DATA}/regions.json", "w"), separators=(",", ":"))
print(f"wrote {len(regions)} regions:\n  " + ", ".join(r["w"] for r in regions))

"""Embed scripts/wordlist.txt from the Google News word2vec vectors.

Replaces the OpenAI step (old scripts/embed.ts) — word2vec is a fixed lookup
table, so this is a pure local dictionary lookup: no API key, fully offline.
Streams the 3.6 GB binary once (via mmap, low memory) and writes:

  scripts/.cache/embeddings.f32   N x 300 float32, wordlist order (build input)
  scripts/.cache/embed-words.json words found, same order + model tag
  api/w2v/w2v.i16                 M x 300 int16, runtime lookup store
  api/w2v/w2v-vocab.json          {dim, scale, words[]} — row = index

The runtime store is the top RUNTIME_VOCAB most-frequent word2vec entries
(the .bin is frequency-ordered) unioned with every wordlist word that was
found, so the live /api/embed endpoint can place typed words & algebra terms
offline. Words outside this vocab get a "not in vocabulary" response.

Run via `npm run precompute` (this → reduce.py).
"""

import json
import mmap
import os
import time

import numpy as np

DIM = 300
MODEL = "word2vec-google-news-300"
BIN = "scripts/.cache/GoogleNews-vectors-negative300.bin"
CACHE_DIR = "scripts/.cache"
API_DIR = "api/w2v"
RUNTIME_VOCAB = 100_000  # top-frequency entries shipped for live lookup

t0 = time.time()
log = lambda msg: print(f"[{time.time() - t0:6.1f}s] {msg}", flush=True)

if not os.path.exists(BIN):
    raise SystemExit(f"missing {BIN} — download GoogleNews-vectors-negative300.bin first")

wordlist = open("scripts/wordlist.txt").read().split()
wordset = set(wordlist)
log(f"{len(wordlist)} wordlist words; scanning {BIN} ({os.path.getsize(BIN) / 1e9:.1f} GB)")

# --- single streaming pass over the frequency-ordered binary ---
# Format: ASCII "count dim\n" header, then per entry: word bytes, one space,
# then DIM little-endian float32 (no separator between entries).
row_bytes = DIM * 4
wl_vecs: dict[str, np.ndarray] = {}       # wordlist word -> vector (full precision)
runtime_words: list[str] = []              # runtime vocab in frequency order
runtime_vecs: list[np.ndarray] = []
runtime_seen: set[str] = set()

with open(BIN, "rb") as fh:
    mm = mmap.mmap(fh.fileno(), 0, access=mmap.ACCESS_READ)
    nl = mm.find(b"\n")
    count, hdr_dim = map(int, mm[:nl].split())
    assert hdr_dim == DIM, f"expected {DIM}-dim vectors, header says {hdr_dim}"
    pos = nl + 1
    for i in range(count):
        sp = mm.find(b" ", pos)
        token = mm[pos:sp].decode("utf-8", "ignore")
        pos = sp + 1
        low = token.lower()
        want_wl = low in wordset and low not in wl_vecs
        want_rt = len(runtime_seen) < RUNTIME_VOCAB and low not in runtime_seen
        if want_wl or want_rt:
            vec = np.frombuffer(mm[pos : pos + row_bytes], dtype="<f4").copy()
            if want_wl:
                wl_vecs[low] = vec
            if want_rt:
                runtime_seen.add(low)
                runtime_words.append(low)
                runtime_vecs.append(vec)
        pos += row_bytes
        # A trailing newline may follow each vector in some dumps — skip it.
        if pos < len(mm) and mm[pos : pos + 1] == b"\n":
            pos += 1
        if (i + 1) % 500_000 == 0:
            log(f"  scanned {i + 1:,}/{count:,} — found {len(wl_vecs)}/{len(wordset)} wordlist")
    mm.close()

# Ensure every found wordlist word is also in the runtime store (superset), so
# the galaxy's own words are always live-queryable even if they're rare.
for w, v in wl_vecs.items():
    if w not in runtime_seen:
        runtime_seen.add(w)
        runtime_words.append(w)
        runtime_vecs.append(v)

log(
    f"found {len(wl_vecs)}/{len(wordset)} wordlist words "
    f"({len(wordset) - len(wl_vecs)} OOV); runtime vocab = {len(runtime_words)}"
)

# --- build-time output: embeddings.f32 + embed-words.json (reduce.py input) ---
os.makedirs(CACHE_DIR, exist_ok=True)
found = [w for w in wordlist if w in wl_vecs]  # wordlist order, deduped by wl_vecs
X = np.stack([wl_vecs[w] for w in found]).astype(np.float32)
X.tofile(f"{CACHE_DIR}/embeddings.f32")
json.dump({"model": MODEL, "words": found}, open(f"{CACHE_DIR}/embed-words.json", "w"))
log(f"wrote {X.shape[0]} x {X.shape[1]} embeddings.f32")

# --- runtime output: quantized int16 store + vocab index ---
os.makedirs(API_DIR, exist_ok=True)
R = np.stack(runtime_vecs).astype(np.float32)
scale = float(np.abs(R).max() / 32767.0)
np.round(R / scale).astype(np.int16).tofile(f"{API_DIR}/w2v.i16")
json.dump(
    {"dim": DIM, "scale": scale, "words": runtime_words},
    open(f"{API_DIR}/w2v-vocab.json", "w"),
    separators=(",", ":"),
)
log(f"wrote runtime store api/w2v/w2v.i16 ({R.nbytes // 2 // 1_000_000} MB int16)")

# Ship the blocklist alongside the store so /api/embed rejects typed profanity
# too (not just the galaxy). Same file scripts/wordlist.py + reduce.py use.
import shutil

if os.path.exists("scripts/blocklist.txt"):
    shutil.copyfile("scripts/blocklist.txt", f"{API_DIR}/blocklist.txt")
    log("copied blocklist.txt → api/w2v/")

# Word Galaxy

~66,000 English words embedded with **word2vec** and arranged in an explorable
3-D universe. Fly around with mouse, keyboard, or **bare hands** (webcam gesture
tracking); type any word to watch it fly into place among its semantic
neighbors; do word algebra (`king - man + woman` → *queen*).

Built with Vite + React + react-three-fiber. Embeddings: Google News
`word2vec-google-news-300` (300-dim). A fixed lookup table — no API key, fully
offline. No PCA: the raw 300-dim vectors ship to the browser int16-quantized
(~38MB) and power all similarity math client-side directly. Layout: UMAP-3D
(`n_neighbors=8, min_dist=0`) over those raw vectors.

## Setup

```sh
npm install
npm run fetch-mediapipe            # vendors hand-tracking wasm + model → public/mediapipe/

# one-time data build (fully offline — no API key)
./.venv/bin/pip install numpy scikit-learn umap-learn wordfreq spylls   # python 3.11+ venv

# fetch the word2vec vectors (~3.6 GB, gitignored → scripts/.cache/)
curl -fSL -o scripts/.cache/GoogleNews-vectors-negative300.bin \
  https://huggingface.co/NathaNn1111/word2vec-google-news-negative-300-bin/resolve/main/GoogleNews-vectors-negative300.bin

# vendor a Hunspell en_US dictionary for the real-word filter (→ scripts/dict/)
mkdir -p scripts/dict
curl -fsSL -o scripts/dict/en_US.aff https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/en/index.aff
curl -fsSL -o scripts/dict/en_US.dic https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/en/index.dic

npm run wordlist                   # → scripts/wordlist.txt (top real English words)
npm run precompute                 # word2vec lookup + PCA/k-means/UMAP → public/data/

npm run dev                        # http://localhost:5173
```

`/api/embed` places typed words & algebra terms by looking them up in a shipped
word2vec bundle (`api/w2v/`, ~76 MB, built by `precompute`) — no network. It
runs as a Vercel function in production and is mounted into the Vite dev server
automatically, so `npm run dev` is all you need locally. A word outside the
bundled ~128k-word vocab responds 400 (word2vec has no subword fallback).

## Using it

- **drag** to orbit · **scroll** to zoom · **click** a word to fly to it
- **click a word** to see gold links to its true top-10 semantic neighbors
  (wherever the 3-D layout scattered them)
- **zoom out** for a map: ~36 constellation region names fade in; dive in and
  per-word labels take over
- type a word — known words are visited, novel words are embedded live and
  placed at their semantic position with lines to their nearest neighbors
- type an equation like `king - man + woman`
- draw a **star trail** between two words: `cat -> democracy` (or `cat to
  democracy`) steps through the words along the line between them
- **✋ enable gestures**: open hand = cursor, pinch-drag = orbit, quick
  pinch-tap = select, two-hand pinch spread/squeeze = zoom
- `?mockhand=1` simulates a hand with the mouse (click = pinch, shift =
  second hand) — used by the automated tests, handy for development

## Development

```sh
npm test          # all unit suites (gestures, algebra, projection, labels, api, data files)
npm run build     # production build
```

Debug URL flags: `?nolabels=1`, `?nocloud=1`, `?noeffects=1` (perf bisection).

### Layout quality

The 3-D layout is scored, not guessed. `scripts/eval_layout.py` reports top-k
neighbor recall (full-N), trustworthiness/continuity, and an R_NX AUC for any
`layout.f32` against the raw-300 word2vec space; `scripts/tune_umap.py` and
`scripts/tune_umap_raw.py` sweep UMAP params (PCA-input vs raw-input) scored
against that same raw-300 truth. That sweep is why the layout skips PCA and uses
UMAP with `n_neighbors=8, min_dist=0` — raw-300 input beat a PCA-192 reduction
at every setting, and nn=8/md=0 gave recall@10 ≈ 29% (vs ~25% at the old
nn=10/md=0.05) with global structure intact. The shipped recall is persisted to
`meta.json` as `recall10_3d`.

```sh
./.venv/bin/python scripts/eval_layout.py            # score public/data/layout.f32
./.venv/bin/python scripts/make_regions.py           # regenerate region labels only
```

## Data pipeline

```
realwords.py       is_real_word() — Hunspell (en_US) spell-check, keeps inflections
wordlist.py        wordfreq candidates → real-word filter → scripts/wordlist.txt
embed_word2vec.py  word2vec lookup → scripts/.cache/embeddings.f32
                   + runtime bundle api/w2v/{w2v.i16, w2v-vocab.json}
reduce.py          filter cache to wordlist.txt · int16-quantize the raw 300-d
                   coords · k-means-8 colors · UMAP-3D layout · region anchors
                   → public/data/{words.json, coords.i16, layout.f32,
                     regions.json, meta.json}
regions_util.py    compute_regions() — k-means on the 3-D layout, named by most
                   frequent content word (shared by reduce.py + make_regions.py)
```

Positions come from UMAP (neighbor-faithful, not variance-faithful); the raw
300-d word2vec coords (shipped int16-quantized) are the source of truth for
similarity, and a typed word's vector from `/api/embed` lands in that same space
directly — no projection step.

To re-tighten the vocabulary (e.g. after tweaking the real-word filter), just
rebuild — the word2vec lookup re-scans the local vectors in seconds, no network:

```sh
npm run wordlist       # regenerate the filtered scripts/wordlist.txt
npm run precompute     # re-embed from the local .bin + rebuild public/data/
```

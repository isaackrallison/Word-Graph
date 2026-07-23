# Word Galaxy

100,000 English words embedded by an LLM and arranged in an explorable 3-D
universe. Fly around with mouse, keyboard, or **bare hands** (webcam gesture
tracking); type any word to watch it fly into place among its semantic
neighbors; do word algebra (`king - man + woman` → *queen*).

Built with Vite + React + react-three-fiber. Embeddings: OpenAI
`text-embedding-3-small`. Layout: UMAP-3D over a 192-dim PCA of the raw
embeddings (PCA coords ship to the browser int16-quantized and power all
similarity math client-side).

## Setup

```sh
npm install
npm run fetch-mediapipe            # vendors hand-tracking wasm + model → public/mediapipe/

# one-time data build (needs OPENAI_API_KEY in .env.local; costs < 1¢)
./.venv/bin/pip install numpy scikit-learn umap-learn wordfreq spylls   # python 3.11+ venv

# vendor a Hunspell en_US dictionary for the real-word filter (→ scripts/dict/)
mkdir -p scripts/dict
curl -fsSL -o scripts/dict/en_US.aff https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/en/index.aff
curl -fsSL -o scripts/dict/en_US.dic https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/en/index.dic

npm run wordlist                   # → scripts/wordlist.txt (top real English words)
npm run precompute                 # embed (resumable) + PCA/k-means/UMAP → public/data/

npm run dev                        # http://localhost:5173
```

`/api/embed` runs as a Vercel function in production and is mounted into the
Vite dev server automatically, so `npm run dev` is all you need locally.

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

`scripts/analyze-compression.py` reproduces the PCA-dimension fidelity
measurements (needs the local embeddings cache in `scripts/.cache/`).

### Layout quality

The 3-D layout is scored, not guessed. `scripts/eval_layout.py` reports top-k
neighbor recall (full-N), trustworthiness/continuity, and an R_NX AUC for any
`layout.f32` against the PCA-192 space; `scripts/compare_layouts.py` bakes off
candidate reducers. That bake-off is why the layout uses UMAP with
`n_neighbors=10, min_dist=0.05` (recall@10 ≈ 44%, up from 38%) — PaCMAP and
densMAP both scored worse in 3-D. The shipped recall is persisted to
`meta.json` as `recall10_3d`.

```sh
./.venv/bin/python scripts/eval_layout.py            # score public/data/layout.f32
./.venv/bin/python scripts/make_regions.py           # regenerate region labels only
```

## Data pipeline

```
realwords.py    is_real_word() — Hunspell (en_US) spell-check, keeps inflections
wordlist.py     wordfreq candidates → real-word filter → scripts/wordlist.txt
embed.ts        OpenAI embeddings → scripts/.cache/embeddings.f32 (resumable)
reduce.py       filter cache to wordlist.txt · PCA-192 (+ int16 quantization)
                · k-means-8 colors · UMAP-3D layout · region anchors
                → public/data/{words.json, coords.i16, layout.f32,
                  projection.bin, regions.json, meta.json}
regions_util.py compute_regions() — k-means on the 3-D layout, named by most
                frequent content word (shared by reduce.py + make_regions.py)
```

Positions come from UMAP (neighbor-faithful, not variance-faithful); the
192-dim PCA coords are the source of truth for similarity — measured at 92%
top-10 neighbor agreement with the full 1536-dim space.

To re-tighten the vocabulary against an **already-cached** set of embeddings
(e.g. after tweaking the real-word filter), rebuild without re-embedding:

```sh
npm run wordlist                       # regenerate the filtered scripts/wordlist.txt
./.venv/bin/python scripts/reduce.py   # rebuild public/data/ from the cache — no OpenAI
```

Do **not** run `npm run precompute` for this — `embed.ts` sees the shrunk
wordlist as a stale cache and re-embeds everything. `reduce.py` reads the cache
directly and simply drops the rows no longer in the vocabulary.

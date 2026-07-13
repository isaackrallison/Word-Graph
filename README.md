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
./.venv/bin/pip install numpy scikit-learn umap-learn wordfreq   # python 3.11+ venv
npm run wordlist                   # → scripts/wordlist.txt (top-100k words)
npm run precompute                 # embed (resumable) + PCA/k-means/UMAP → public/data/

npm run dev                        # http://localhost:5173
```

`/api/embed` runs as a Vercel function in production and is mounted into the
Vite dev server automatically, so `npm run dev` is all you need locally.

## Using it

- **drag** to orbit · **scroll** to zoom · **click** a word to fly to it
- type a word — known words are visited, novel words are embedded live and
  placed at their semantic position with lines to their nearest neighbors
- type an equation like `king - man + woman`
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

## Data pipeline

```
wordlist.py     wordfreq top-100k clean English words
embed.ts        OpenAI embeddings → scripts/.cache/embeddings.f32 (resumable)
reduce.py       PCA-192 (+ int16 quantization) · k-means-8 colors · UMAP-3D layout
                → public/data/{words.json, coords.i16, layout.f32, projection.bin, meta.json}
```

Positions come from UMAP (neighbor-faithful, not variance-faithful); the
192-dim PCA coords are the source of truth for similarity — measured at 92%
top-10 neighbor agreement with the full 1536-dim space.

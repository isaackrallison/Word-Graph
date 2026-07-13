import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { loadGraphData, type GraphData } from './lib/data';
import { nearestNeighbors, placeByNeighbors, projectEmbedding } from './lib/project';
import { SCENE_BACKGROUND } from './lib/palette';
import type { AddedWord } from './types';
import { WordCloud } from './scene/WordCloud';
import { Labels } from './scene/Labels';
import { CameraRig, type CameraRigHandle } from './scene/CameraRig';
import { NewWord } from './scene/NewWord';
import { Effects, Starfield } from './scene/Effects';
import { GestureCursor } from './scene/GestureCursor';
import { isMockHand, useGestures } from './gesture/useGestures';
import { WordInput } from './ui/WordInput';
import { AddedWords } from './ui/AddedWords';
import { GesturePanel } from './ui/GesturePanel';

const ORBIT_GAIN = 3.5; // screen-fraction pinch-drag → radians

const debugFlags = new URLSearchParams(window.location.search); // perf bisection: nocloud, nolabels, noeffects

const STORAGE_KEY = 'word-graph-added-v2'; // v2: 100k-word corpus, new PCA basis

/** Entrance animation start: outside the cloud, along the word's own direction. */
function spawnFor(position: [number, number, number]): [number, number, number] {
  const len = Math.hypot(...position) || 1;
  const k = (len + 80) / len;
  return [position[0] * k, position[1] * k, position[2] * k];
}

export default function App() {
  const [data, setData] = useState<GraphData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [added, setAdded] = useState<AddedWord[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const rigRef = useRef<CameraRigHandle>(null);
  const sessionWords = useRef(new Set<string>()); // words added this session → animate
  const restored = useRef(false);

  const [gestureCursor, setGestureCursor] = useState<{ x: number; y: number } | null>(null);
  const [gestureSelect, setGestureSelect] = useState<{ seq: number; x: number; y: number } | null>(
    null
  );
  const selectSeq = useRef(0);
  const gestures = useGestures({
    onOrbit: (dx, dy) => rigRef.current?.orbitBy(dx * ORBIT_GAIN, dy * ORBIT_GAIN),
    onDolly: (f) => rigRef.current?.dollyBy(f),
    onCursor: setGestureCursor,
    onSelect: ({ x, y }) => setGestureSelect({ seq: ++selectSeq.current, x, y }),
  });

  useEffect(() => {
    loadGraphData().then(setData, (err: Error) => setLoadError(err.message));
  }, []);

  // Restore previously added words (vec only is stored; the rest is derived).
  useEffect(() => {
    if (!data || restored.current) return;
    restored.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as {
        word: string;
        vec: number[];
      }[];
      setAdded(
        saved
          .filter((s) => Array.isArray(s.vec) && s.vec.length === data.pcaDims)
          .map(({ word, vec }) => {
            const v = new Float32Array(vec);
            const neighbors = nearestNeighbors(v, data, 5).map((n) => ({
              ...n,
              word: data.words[n.index].word,
            }));
            return { word, vec, position: placeByNeighbors(neighbors, data), neighbors };
          })
      );
    } catch {
      // corrupt storage — start fresh
    }
  }, [data]);

  useEffect(() => {
    if (!restored.current) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(added.map(({ word, vec }) => ({ word, vec })))
    );
  }, [added]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    document.body.style.cursor = hovered !== null ? 'pointer' : '';
  }, [hovered]);

  const flyToIndex = useCallback(
    (index: number) => {
      if (!data) return;
      setFocusIndex(index);
      rigRef.current?.flyTo(
        [data.positions[index * 3], data.positions[index * 3 + 1], data.positions[index * 3 + 2]],
        14
      );
    },
    [data]
  );

  const addWord = useCallback(
    async (raw: string) => {
      if (!data || busy) return;
      const word = raw.trim().toLowerCase();
      if (!word) return;

      const existing = added.find((a) => a.word === word);
      if (existing) {
        rigRef.current?.flyTo(existing.position, 14);
        return;
      }
      const seedIndex = data.words.findIndex((w) => w.word === word);
      if (seedIndex >= 0) {
        flyToIndex(seedIndex);
        return;
      }

      setBusy(true);
      try {
        const res = await fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ word }),
        });
        const body = (await res.json()) as { embedding?: number[]; error?: string };
        if (!res.ok || !body.embedding) {
          setToast(body.error ?? 'Something went wrong — try again.');
          return;
        }
        const vec = projectEmbedding(body.embedding, data);
        const neighbors = nearestNeighbors(vec, data, 5).map((n) => ({
          ...n,
          word: data.words[n.index].word,
        }));
        const position = placeByNeighbors(neighbors, data);
        sessionWords.current.add(word);
        setAdded((prev) => [...prev, { word, vec: Array.from(vec), position, neighbors }]);
        setFocusIndex(null);
        setTimeout(() => rigRef.current?.flyTo(position, 16), 500);
      } catch {
        setToast('Network error — is the API running?');
      } finally {
        setBusy(false);
      }
    },
    [data, busy, added, flyToIndex]
  );

  const removeWord = useCallback((word: string) => {
    setAdded((prev) => prev.filter((a) => a.word !== word));
    sessionWords.current.delete(word);
  }, []);

  // Labels that must stay visible: focused word + the latest word's neighbors.
  const forced = useMemo(() => {
    const set = new Set<number>();
    if (focusIndex !== null) set.add(focusIndex);
    const last = added[added.length - 1];
    if (last) for (const n of last.neighbors) set.add(n.index);
    return [...set];
  }, [focusIndex, added]);

  if (loadError) {
    return (
      <div className="overlay-screen">
        <h1>Word Galaxy</h1>
        <p className="error-text">
          Couldn't load embedding data ({loadError}).
          <br />
          Run <code>npm run precompute</code> first to generate <code>public/data/</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="app">
      <Canvas
        camera={{ position: [0, 34, 230], fov: 55, near: 0.1, far: 2600 }}
        gl={{ antialias: true }}
        raycaster={{
          params: {
            Points: { threshold: 0.8 },
            Mesh: {},
            Line: { threshold: 1 },
            LOD: {},
            Sprite: {},
          },
        }}
        onPointerMissed={() => setFocusIndex(null)}
      >
        <color attach="background" args={[SCENE_BACKGROUND]} />
        <fog attach="fog" args={[SCENE_BACKGROUND, 230, 1100]} />
        <Starfield />
        {data && (
          <>
            {!debugFlags.has('nocloud') && (
              <WordCloud data={data} onHover={setHovered} onSelect={flyToIndex} />
            )}
            {!debugFlags.has('nolabels') && (
              <Labels data={data} hovered={hovered} forced={forced} />
            )}
            {added.map((a) => (
              <NewWord
                key={a.word}
                added={a}
                data={data}
                spawn={spawnFor(a.position)}
                animate={sessionWords.current.has(a.word)}
              />
            ))}
            <GestureCursor
              cursor={gestureCursor}
              select={gestureSelect}
              onHover={setHovered}
              onSelect={flyToIndex}
            />
          </>
        )}
        <CameraRig ref={rigRef} pointerEnabled={!(gestures.enabled && isMockHand())} />
        {!debugFlags.has('noeffects') && <Effects />}
      </Canvas>

      <header className="title">
        <h1>WORD GALAXY</h1>
        <p>100,000 words embedded by an LLM, arranged in 3-D with UMAP</p>
      </header>

      <p className="hint">drag to orbit · scroll to zoom · click a word to visit it</p>

      <GesturePanel
        enabled={gestures.enabled}
        starting={gestures.starting}
        state={gestures.state}
        error={gestures.error}
        videoRef={gestures.videoRef}
        frameRef={gestures.frameRef}
        onToggle={gestures.toggle}
      />
      <WordInput busy={busy} disabled={!data} onSubmit={addWord} />
      <AddedWords
        added={added}
        onSelect={(a) => rigRef.current?.flyTo(a.position, 14)}
        onRemove={removeWord}
      />

      {!data && !loadError && (
        <div className="overlay-screen">
          <h1>Word Galaxy</h1>
          <p>loading the galaxy…</p>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

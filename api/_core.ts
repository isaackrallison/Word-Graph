// Shared logic for the embed endpoint — used by both the Vercel function
// (api/embed.ts) and the Vite dev-server middleware (vite.config.ts).
//
// Embeddings come from a local word2vec lookup store (api/w2v/, built by
// scripts/embed_word2vec.py) — no API key, no network. word2vec is a fixed
// dictionary, so a word outside the shipped vocab has no vector: we surface
// that as OutOfVocabError rather than inventing one (no subword fallback).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const EMBED_MODEL = 'word2vec-google-news-300';

/** Thrown when a word isn't in the word2vec vocabulary. */
export class OutOfVocabError extends Error {
  constructor(public word: string) {
    super(`"${word}" isn't in the word2vec vocabulary.`);
    this.name = 'OutOfVocabError';
  }
}

/** Normalize and validate user input: 1-3 lowercase words, letters/hyphens/apostrophes. */
export function validateWord(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const word = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!word || word.length > 40) return null;
  if (!/^[a-z][a-z' -]*[a-z]$|^[a-z]$/.test(word)) return null;
  if (word.split(' ').length > 3) return null;
  return word;
}

// --- word2vec store (loaded once, lazily) ---
interface Store {
  dim: number;
  scale: number;
  index: Map<string, number>;
  vecs: Int16Array;
}
let store: Store | null = null;

function load(): Store {
  if (store) return store;
  const dir = fileURLToPath(new URL('./w2v/', import.meta.url));
  const vocab = JSON.parse(readFileSync(`${dir}w2v-vocab.json`, 'utf8')) as {
    dim: number;
    scale: number;
    words: string[];
  };
  const buf = readFileSync(`${dir}w2v.i16`);
  const vecs = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
  const index = new Map<string, number>();
  vocab.words.forEach((w, i) => index.set(w, i));
  store = { dim: vocab.dim, scale: vocab.scale, index, vecs };
  return store;
}

/** Row index for a word, trying phrase/hyphen → underscore variants. */
function lookup(s: Store, word: string): number | undefined {
  for (const cand of [word, word.replace(/ /g, '_'), word.replace(/-/g, '_')]) {
    const i = s.index.get(cand);
    if (i !== undefined) return i;
  }
  return undefined;
}

export function embedWord(word: string): number[] {
  const s = load();
  const row = lookup(s, word);
  if (row === undefined) throw new OutOfVocabError(word);
  const out = new Array<number>(s.dim);
  const base = row * s.dim;
  for (let j = 0; j < s.dim; j++) out[j] = s.vecs[base + j] * s.scale;
  return out;
}

/** Embed up to a few words (word-algebra terms); throws on the first miss. */
export function embedWords(words: string[]): number[][] {
  return words.map((w) => embedWord(w));
}

// Simple per-IP sliding-window rate limit (in-memory; resets on cold start).
const hits = new Map<string, number[]>();
export function rateLimited(ip: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) return true;
  list.push(now);
  hits.set(ip, list);
  return false;
}

// Word algebra: parse "king - man + woman", combine term vectors in the
// 50-dim PCA space, and rank the nearest words. The PCA projection is linear,
// so client-side algebra on projected coords equals projecting the raw-space
// algebra exactly — seed terms cost zero API calls.

import type { GraphData } from './data';
import { nearestNeighbors, type Neighbor } from './project';
import type { AddedWord } from '../types';

export interface Term {
  word: string;
  sign: 1 | -1;
}

const WORD_RE = /^[a-z][a-z']*$/;

/**
 * Parse an equation like "king - man + woman" (operators must be
 * space-separated; unicode minus accepted). Returns null when the input is
 * not an equation (no operators) so the caller falls through to add-word.
 * Throws with a user-facing message for malformed equations.
 */
export function parseExpression(input: string): Term[] | null {
  const tokens = input.trim().toLowerCase().replace(/−/g, '-').split(/\s+/).filter(Boolean);
  if (!tokens.some((t) => t === '+' || t === '-')) return null;

  const terms: Term[] = [];
  let sign: 1 | -1 | null = 1; // implicit + before the first term
  for (const tok of tokens) {
    if (tok === '+' || tok === '-') {
      if (sign !== null) throw new Error('Two operators in a row — try: king - man + woman');
      sign = tok === '+' ? 1 : -1;
    } else {
      if (sign === null) throw new Error('Missing + or - between words');
      if (!WORD_RE.test(tok)) throw new Error(`"${tok}" isn't a word I can use`);
      terms.push({ word: tok, sign });
      sign = null;
    }
  }
  if (sign !== null) throw new Error('Equation ends with an operator');
  if (terms.length < 2) throw new Error('An equation needs at least two words');
  if (terms.length > 4) throw new Error('Keep it to four words or fewer');
  return terms;
}

/** Signed sum of term vectors. */
export function combine(vecs: Float32Array[], signs: (1 | -1)[]): Float32Array {
  const out = new Float32Array(vecs[0].length);
  for (let t = 0; t < vecs.length; t++) {
    for (let j = 0; j < out.length; j++) out[j] += signs[t] * vecs[t][j];
  }
  return out;
}

/** True if `candidate` is one of the input terms or a trivial variant of one. */
function isTermVariant(candidate: string, termWords: Set<string>): boolean {
  if (termWords.has(candidate)) return true;
  for (const t of termWords) {
    if (candidate === `${t}s` || candidate === `${t}es` || `${candidate}s` === t || `${candidate}es` === t) {
      return true;
    }
  }
  return false;
}

/** Nearest words to the equation point, minus the terms themselves. */
export function equationNeighbors(
  vec: Float32Array,
  data: GraphData,
  termWords: string[],
  k = 6
): Neighbor[] {
  const exclude = new Set(termWords);
  // Over-fetch so filtering still leaves k results.
  const raw = nearestNeighbors(vec, data, k + termWords.length + 4);
  return raw.filter((n) => !isTermVariant(data.words[n.index].word, exclude)).slice(0, k);
}

/**
 * Resolve each term to its 50-dim vector: seed word → slice of data.coords;
 * user-added word → stored vec; otherwise embed via `embedBatch`.
 */
export async function resolveTermVecs(
  terms: Term[],
  data: GraphData,
  wordIndex: Map<string, number>,
  added: AddedWord[],
  embedBatch: (words: string[]) => Promise<Map<string, Float32Array>>
): Promise<Float32Array[]> {
  const missing: string[] = [];
  for (const t of terms) {
    if (wordIndex.has(t.word)) continue;
    if (added.some((a) => a.word === t.word)) continue;
    missing.push(t.word);
  }
  const fetched = missing.length > 0 ? await embedBatch(missing) : new Map<string, Float32Array>();

  return terms.map((t) => {
    const idx = wordIndex.get(t.word);
    if (idx !== undefined) {
      return data.coords.slice(idx * data.pcaDims, (idx + 1) * data.pcaDims);
    }
    const saved = added.find((a) => a.word === t.word);
    if (saved) return new Float32Array(saved.vec);
    const vec = fetched.get(t.word);
    if (!vec) throw new Error(`Couldn't get a vector for "${t.word}"`);
    return vec;
  });
}

// POST /api/embed
//   { word: string }      → { word, embedding: number[300] }        (word2vec)
//   { words: string[] }   → { embeddings: { word, embedding }[] }   (≤4, algebra terms)
// A word outside the shipped word2vec vocab responds 400 (no subword fallback).
// Runs as a Vercel Node function in production and is mounted as dev-server
// middleware by vite.config.ts, so the handler sticks to plain Node req/res.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { embedWord, embedWords, OutOfVocabError, rateLimited, validateWord } from './_core.ts';

function readBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined) return Promise.resolve(req.body); // Vercel pre-parses
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export default async function handler(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  if (rateLimited(ip)) return json(res, 429, { error: 'Slow down — try again in a minute.' });

  const body = (await readBody(req)) as { word?: unknown; words?: unknown };

  try {
    if (Array.isArray(body?.words)) {
      if (body.words.length === 0 || body.words.length > 4) {
        return json(res, 400, { error: 'Equations take one to four words.' });
      }
      const words = body.words.map(validateWord);
      if (words.some((w) => w === null)) {
        return json(res, 400, { error: 'Every term must be a single word (letters only).' });
      }
      const embeddings = embedWords(words as string[]);
      return json(res, 200, {
        embeddings: (words as string[]).map((w, i) => ({ word: w, embedding: embeddings[i] })),
      });
    }

    const word = validateWord(body?.word);
    if (!word) return json(res, 400, { error: 'Enter a single word (letters only).' });
    const embedding = embedWord(word);
    return json(res, 200, { word, embedding });
  } catch (err) {
    // A word outside the shipped word2vec vocab isn't a server fault — 400.
    if (err instanceof OutOfVocabError) return json(res, 400, { error: err.message });
    console.error('embed failed:', err);
    return json(res, 502, { error: 'Embedding service unavailable.' });
  }
}

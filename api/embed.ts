// POST /api/embed  { word: string } → { word, embedding: number[1536] }
// Runs as a Vercel Node function in production and is mounted as dev-server
// middleware by vite.config.ts, so the handler sticks to plain Node req/res.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { embedWord, rateLimited, validateWord } from './_core.ts';

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

  const body = (await readBody(req)) as { word?: unknown };
  const word = validateWord(body?.word);
  if (!word) return json(res, 400, { error: 'Enter a single word (letters only).' });

  try {
    const embedding = await embedWord(word);
    return json(res, 200, { word, embedding });
  } catch (err) {
    console.error('embed failed:', err);
    return json(res, 502, { error: 'Embedding service unavailable.' });
  }
}

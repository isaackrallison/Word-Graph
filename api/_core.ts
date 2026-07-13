// Shared logic for the embed endpoint — used by both the Vercel function
// (api/embed.ts) and the Vite dev-server middleware (vite.config.ts).
import OpenAI from 'openai';

export const EMBED_MODEL = 'text-embedding-3-small';

/** Normalize and validate user input: 1-3 lowercase words, letters/hyphens/apostrophes. */
export function validateWord(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const word = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!word || word.length > 40) return null;
  if (!/^[a-z][a-z' -]*[a-z]$|^[a-z]$/.test(word)) return null;
  if (word.split(' ').length > 3) return null;
  return word;
}

export async function embedWord(word: string): Promise<number[]> {
  const client = new OpenAI();
  const res = await client.embeddings.create({ model: EMBED_MODEL, input: word });
  return res.data[0].embedding;
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

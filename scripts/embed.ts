// Embeds scripts/wordlist.txt with OpenAI and writes a binary cache:
//   scripts/.cache/embeddings.f32   N x 1536 float32, wordlist order
//   scripts/.cache/embed-words.json words in the same order + model tag
// Resumable: progress is appended batch-by-batch, so re-running continues
// where it left off. Run via `npm run precompute` (embed → reduce.py).

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import OpenAI from 'openai';

const EMBED_MODEL = 'text-embedding-3-small';
const EMBED_DIMS = 1536;
const BATCH = 2048;
const CACHE_DIR = 'scripts/.cache';
const EMB_FILE = `${CACHE_DIR}/embeddings.f32`;
const WORDS_FILE = `${CACHE_DIR}/embed-words.json`;

function loadEnvLocal() {
  if (process.env.OPENAI_API_KEY) return;
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^OPENAI_API_KEY\s*=\s*"?([^"\n]+)"?/);
      if (m) process.env.OPENAI_API_KEY = m[1].trim();
    }
  }
}

async function main() {
  loadEnvLocal();
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set (put it in .env.local)');
    process.exit(1);
  }

  const words = readFileSync('scripts/wordlist.txt', 'utf8').trim().split('\n');
  console.log(`${words.length} words to embed`);
  mkdirSync(CACHE_DIR, { recursive: true });

  // Resume: the cache is valid if it matches a prefix of the current wordlist.
  let done = 0;
  if (existsSync(EMB_FILE) && existsSync(WORDS_FILE)) {
    const cached = JSON.parse(readFileSync(WORDS_FILE, 'utf8')) as {
      model: string;
      words: string[];
    };
    const bytes = readFileSync(EMB_FILE).length;
    const rows = Math.floor(bytes / (EMBED_DIMS * 4));
    if (
      cached.model === EMBED_MODEL &&
      rows === cached.words.length &&
      cached.words.every((w, i) => words[i] === w)
    ) {
      done = rows;
      console.log(`resuming from ${done} cached embeddings`);
    } else {
      console.log('cache is stale — starting over');
      writeFileSync(EMB_FILE, Buffer.alloc(0));
    }
  } else {
    writeFileSync(EMB_FILE, Buffer.alloc(0));
  }

  const client = new OpenAI();
  for (let i = done; i < words.length; i += BATCH) {
    const batch = words.slice(i, i + BATCH);
    const res = await client.embeddings.create({ model: EMBED_MODEL, input: batch });
    const buf = new Float32Array(batch.length * EMBED_DIMS);
    res.data.forEach((d, j) => buf.set(d.embedding, j * EMBED_DIMS));
    appendFileSync(EMB_FILE, Buffer.from(buf.buffer));
    writeFileSync(
      WORDS_FILE,
      JSON.stringify({ model: EMBED_MODEL, words: words.slice(0, i + batch.length) })
    );
    console.log(`embedded ${Math.min(i + BATCH, words.length)} / ${words.length}`);
  }
  console.log('embedding complete');
}

main();

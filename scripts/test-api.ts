// Unit tests for the embed API: input validation, rate limiting, and the
// handler's rejection paths (everything that returns before the word2vec
// lookup — no store load needed).
//   npx tsx scripts/test-api.ts

import { rateLimited, validateWord } from '../api/_core.ts';
import handler from '../api/embed.ts';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// --- validateWord ---
{
  check('accepts a plain word', validateWord('galaxy') === 'galaxy');
  check('lowercases and trims', validateWord('  GaLaXy ') === 'galaxy');
  check('collapses inner whitespace', validateWord('ice   cream') === 'ice cream');
  check("keeps apostrophes and hyphens", validateWord("o'clock") === "o'clock" && validateWord('t-shirt') === 't-shirt');
  check('accepts single letter', validateWord('a') === 'a');
  check('rejects empty', validateWord('') === null && validateWord('   ') === null);
  check('rejects numbers/symbols', validateWord('h4ck') === null && validateWord('a;b') === null);
  check('rejects over 3 words', validateWord('one two three four') === null);
  check('rejects over 40 chars', validateWord('a'.repeat(41)) === null);
  check('rejects non-strings', validateWord(42) === null && validateWord(null) === null && validateWord(['a']) === null);
  check('rejects leading/trailing punctuation', validateWord("'word") === null && validateWord('word-') === null);
}

// --- rateLimited: sliding window per ip ---
{
  const ip = `test-${Date.now()}`;
  let blockedAt = -1;
  for (let i = 1; i <= 25; i++) {
    if (rateLimited(ip) && blockedAt === -1) blockedAt = i;
  }
  check('allows 20/minute then blocks', blockedAt === 21, `blocked at call ${blockedAt}`);
  check('other ips unaffected', !rateLimited(`${ip}-other`));
}

// --- handler rejection paths (mock req/res, no network) ---
interface MockRes {
  statusCode: number;
  body: Record<string, unknown>;
}
async function call(method: string, body: unknown, ip = `h-${Math.random()}`): Promise<MockRes> {
  const req = {
    method,
    body,
    headers: {},
    socket: { remoteAddress: ip },
  } as never;
  const out: MockRes = { statusCode: 0, body: {} };
  const res = {
    statusCode: 200,
    setHeader() {},
    end(payload: string) {
      out.statusCode = this.statusCode;
      out.body = JSON.parse(payload);
    },
  } as never;
  await handler(req, res);
  return out;
}

{
  check('rejects GET', (await call('GET', {})).statusCode === 405);
  check('rejects missing word', (await call('POST', {})).statusCode === 400);
  check('rejects invalid word', (await call('POST', { word: '12345' })).statusCode === 400);
  check('rejects empty words array', (await call('POST', { words: [] })).statusCode === 400);
  check('rejects 5-term words array', (await call('POST', { words: ['a', 'b', 'c', 'd', 'e'] })).statusCode === 400);
  check('rejects words array with junk term', (await call('POST', { words: ['king', 'm4n'] })).statusCode === 400);

  const ip = `flood-${Date.now()}`;
  let status = 0;
  for (let i = 0; i < 21; i++) status = (await call('POST', { word: '!!' }, ip)).statusCode;
  check('rate limit returns 429', status === 429);
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

"""Generate scripts/wordlist.txt: the N most frequent English words.

Uses the wordfreq package (multi-corpus frequency data), filtered to clean
lowercase alphabetic words — effectively "the dictionary as people use it".

    npm run wordlist
"""

import re
from wordfreq import top_n_list

N = 100_000
KEEP_SINGLE = {"a", "i"}
WORD_RE = re.compile(r"^[a-z]+$")

candidates = top_n_list("en", 400_000, wordlist="large")
words = []
seen = set()
for w in candidates:
    if not WORD_RE.match(w):
        continue
    if len(w) == 1 and w not in KEEP_SINGLE:
        continue
    if w in seen:
        continue
    seen.add(w)
    words.append(w)
    if len(words) >= N:
        break

with open("scripts/wordlist.txt", "w") as f:
    f.write("\n".join(words) + "\n")

print(f"wrote {len(words)} words (of {len(candidates)} candidates)")
print("first:", ", ".join(words[:10]))
print("around 50k:", ", ".join(words[50_000:50_010]))
print("last:", ", ".join(words[-10:]))

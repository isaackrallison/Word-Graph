"""Generate scripts/wordlist.txt: the N most frequent *real* English words.

Uses the wordfreq package (multi-corpus frequency data), filtered to clean
lowercase alphabetic words and then to actual dictionary words via a Hunspell
spell-check (see realwords.is_real_word). wordfreq is a frequency list, not a
dictionary, so the spell-check is what drops proper nouns, foreign words,
abbreviations, and misspellings that would otherwise clutter the galaxy.

On top of the spell-check, two hand rules kill the abbreviations that a
dictionary still lets through:
  * consonant-only tokens (no vowel, counting y) are initialisms/units —
    cls, mr, ltd, blvd, rpm, tsp — while real words like gym/fly/rhythm keep
    their y and survive;
  * one- and two-letter tokens are dropped unless they're a clear common
    word (see CLEAR_SHORT), removing vs/pm/km/jr/dc but keeping to/of/be/…

    npm run wordlist
"""

import re
from wordfreq import top_n_list

from realwords import is_real_word

N = 100_000
WORD_RE = re.compile(r"^[a-z]+$")
VOWELS = set("aeiouy")  # y counts, so gym/fly/rhythm are not "consonant-only"

# The only 1- and 2-letter tokens worth keeping — clear, common English words.
CLEAR_SHORT = {
    "a", "i",
    "am", "an", "as", "at", "be", "by", "do", "go", "he", "hi", "if", "in",
    "is", "it", "me", "my", "no", "of", "oh", "on", "or", "ox", "so", "to",
    "up", "us", "we",
}

candidates = top_n_list("en", 400_000, wordlist="large")
words = []
seen = set()
for w in candidates:
    if not WORD_RE.match(w):
        continue
    if w in seen:
        continue
    if not (set(w) & VOWELS):  # consonant-only → abbreviation/initialism
        continue
    if len(w) <= 2 and w not in CLEAR_SHORT:
        continue
    if not is_real_word(w):
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

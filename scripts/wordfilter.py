"""Quality filters applied on top of the Hunspell real-word check.

Two things the dictionary can't catch, both bad for a public exhibit:
  * BLOCKLIST — profanity, slurs, explicit terms, Roman numerals, and
    abbreviations. These are real words / valid tokens, so only a curated list
    removes them. Edit scripts/blocklist.txt to tune. Used by wordlist.py
    (future regens) and reduce.py (the shipping gate — rebuilds without needing
    a re-embed).
  * inflection dedup — word2vec gives cats/cat near-identical vectors, so
    plurals and verb forms whose base word is already present just clutter the
    map with near-duplicates. dedupe_inflections() drops the inflected form.

Semantic-shift plurals (news→new, arms→arm) get caught too; add them to
scripts/keeplist.txt (one word per line) to protect specific words.
"""

import os

_DIR = os.path.dirname(__file__)


def _load(name: str) -> set[str]:
    path = os.path.join(_DIR, name)
    if not os.path.exists(path):
        return set()
    return set(open(path).read().split())


BLOCKLIST = _load("blocklist.txt")
KEEPLIST = _load("keeplist.txt")  # words to protect from inflection dedup


def _base_forms(w: str):
    """Yield plausible base lemmas for an inflected form of `w`."""
    n = len(w)
    if w.endswith("ies") and n > 4:
        yield w[:-3] + "y"  # cities → city
    if w.endswith("es") and n > 3:
        yield w[:-2]  # boxes → box
        yield w[:-1]  # bakes → bake
    if w.endswith("s") and not w.endswith("ss") and n > 3:
        yield w[:-1]  # cats → cat
    if w.endswith("ing") and n > 5:
        yield w[:-3]  # jumping → jump
        yield w[:-3] + "e"  # making → make
        if w[-4] == w[-5]:
            yield w[:-4]  # running → run
    if w.endswith("ed") and n > 4:
        yield w[:-2]  # jumped → jump
        yield w[:-1]  # used → use
        if w[-3] == w[-4]:
            yield w[:-3]  # stopped → stop


def dedupe_inflections(
    words: list[str], protect: set[str] | None = None
) -> tuple[list[str], list[str]]:
    """Drop inflected forms whose base word is present. Returns (kept, dropped).

    `protect` (plus scripts/keeplist.txt) is never dropped — used to shield the
    most-frequent words, whose plurals are often distinct concepts (news, states,
    arms, means) rather than redundant inflections.
    """
    present = set(words)
    shield = KEEPLIST | (protect or set())
    kept, dropped = [], []
    for w in words:
        if w in shield:
            kept.append(w)
            continue
        if any(b != w and b in present for b in _base_forms(w)):
            dropped.append(w)
        else:
            kept.append(w)
    return kept, dropped

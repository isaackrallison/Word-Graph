"""Shared "is this a real English word?" test.

Backed by a Hunspell en_US dictionary (via spylls), so it accepts normal
inflections — cats, running, happier — while rejecting proper nouns (stored
capitalized, so a lowercase lookup fails), foreign words, abbreviations, and
misspellings. Used by wordlist.py to turn the wordfreq frequency list into an
actual dictionary vocabulary.

The dictionary files live in scripts/dict/ (en_US.aff + en_US.dic); see README.
"""

from functools import lru_cache

from spylls.hunspell import Dictionary

DICT_PREFIX = "scripts/dict/en_US"  # expects en_US.aff + en_US.dic

_dic = None


def _dictionary() -> Dictionary:
    global _dic
    if _dic is None:
        _dic = Dictionary.from_files(DICT_PREFIX)
    return _dic


@lru_cache(maxsize=None)
def is_real_word(word: str) -> bool:
    """True if `word` is a valid (lowercase) English word or inflection."""
    return _dictionary().lookup(word)

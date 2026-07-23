"""Map-style "constellation" region anchors for the galaxy overview.

Clusters the 3-D layout into contiguous regions and names each by its most
frequent *content* word — function words (the, he, more, without, …) are the
most frequent members of almost every region but make terrible place names, so
they're skipped. Shared by scripts/reduce.py and scripts/make_regions.py so the
logic can't drift.
"""

import numpy as np
from sklearn.cluster import MiniBatchKMeans

# Function words / ultra-generic tokens: the most frequent members of nearly
# every semantic region, but empty as region names. Skipped when naming.
STOPWORDS = set(
    """
    the a an and or but if then else of to in on at by for with from into onto over
    under above below up down off out about around through across along past near
    as between without within among amongst toward towards upon against beyond whilst
    is are was were be been being am do does did have has had having will would can
    could should may might must shall not no nor only own same so than too very just
    also even still back well i you he she it we they me him her us them my your his
    its our their mine yours hers ours theirs this that these those here there where
    when why how what which who whom whose all any both each few more most other some
    such little much many lot lots one two three first next last new old good bad big
    small great get got go going gone went come came take took make made see saw seen
    say said says know knew known think thought want wanted like liked need needed
    use used way ways thing things time way day days people person now yet ever never
    always often again once because while whether though although unless until since
    after before during ago soon later already almost enough instead perhaps maybe
    per via etc let lets able really quite rather thus hence
    """.split()
)

# Region names are shown large in an exhibit/kiosk context — keep them safe.
# (Only affects which word *titles* a region; the words still live in the cloud.)
PROFANITY = set(
    "fuck fucking fucked shit shitty ass asshole bitch cunt dick cock pussy "
    "damn bastard whore slut porn sex sexy nude naked".split()
)
STOPWORDS |= PROFANITY


def compute_regions(emb3: np.ndarray, words: list[str], n_regions: int = 36, seed: int = 1):
    """k-means on the 3-D layout → [{w, x, y, z}] region anchors. `emb3` must be
    the final (normalized) scene positions and `words` frequency-ordered."""
    rlabels = MiniBatchKMeans(n_regions, random_state=seed, n_init=10).fit_predict(emb3)
    regions = []
    used = set()
    for r in range(n_regions):
        members = np.where(rlabels == r)[0]  # ascending → members[0] most frequent
        if len(members) == 0:
            continue
        rep = None
        for m in members:  # most frequent content word not already a region name
            w = words[int(m)]
            if w not in STOPWORDS and w not in used:
                rep = int(m)
                break
        if rep is None:
            rep = int(members[0])
        used.add(words[rep])
        c = emb3[members].mean(axis=0)
        regions.append({"w": words[rep], "x": float(c[0]), "y": float(c[1]), "z": float(c[2])})
    return regions

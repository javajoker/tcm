"""The admission records of the pattern library (task PM-21; docs/post-mvp/design/library-expansion.md §4, §9).

`scripts/kb/admission.py` holds the checklist; this file holds what the checklist cannot derive from the other data:

* ORIGINAL — the 23 patterns written before the checklist existed. Only these can be **waived**.
* WAIVERS — a known gap of the original library on one row, with its reason. A waiver that is no longer needed fails the build, so the list can only get shorter.
* MARGIN_EXCEPTIONS — two patterns whose typical patients are closer than the 20-point margin, and why that stands (three questions must still separate them: row A6).
* NO_RELEASE_FORMULA — a pattern none of whose formulas is tier A, so a release shows none. The tier is computed from the herbs and never edited; the declaration is checked against it.
* NEEDS_EXAM — patterns that cannot reach the 40-point band from the inquiry alone (checked against the scores).
* TEXTBOOK_SOURCES — a textbook or modern source per pattern, as a path under `reference/` (row A2).
* RED_FLAG_BOUNDARY — per pattern, the red flags that must stand in front of it (row A10; a physician's decision).

A new pattern is never waived: it meets every row, or it does not enter.
"""
from __future__ import annotations

ORIGINAL = ("EX1", "EX2", "EX3", "EX4", "SP1", "SP2", "SP3", "SP4", "SP5", "SP6", "LV1", "LV2", "LV3", "LV4", "HT1", "HT2", "HT3", "LG1", "LG2", "KD1", "KD2", "QB1", "QB2")

MARGIN_EXCEPTIONS = [
    {"patterns": ["HT2", "KD1"],
     "reason": "Disharmony between heart and kidney is kidney yin deficiency with heart fire, so the two typical patients share most of the picture. K-07 requires, and the question-bank test checks, "
               "that at least three questions separate them; the clinical reviewer decides whether the weights should move them further apart."},
]

_TIER_B = "All of its formulas are tier B (computed from the herbs: a high blood-activating share or an interaction flag), which a release does not show."
_TIER_C = "All of its formulas are tier C (computed from the herbs: a strong herb, a high bitter-cold share, or a formula outside the first set), which a release does not show."
_THEN = " A release shows its diet, points and lifestyle and the result page says so; whether another formula should serve it is the pharmacy and clinical reviewers' decision (design §8)."

NO_RELEASE_FORMULA = [
    {"pattern": "EX1", "reason": _TIER_C + _THEN},
    {"pattern": "LV1", "reason": _TIER_B + _THEN},
    {"pattern": "LV2", "reason": _TIER_C + _THEN},
    {"pattern": "LV4", "reason": _TIER_B + _THEN},
    {"pattern": "KD2", "reason": _TIER_C + _THEN},
    {"pattern": "QB1", "reason": _TIER_B + _THEN},
    {"pattern": "QB2", "reason": _TIER_B + _THEN},
]

NEEDS_EXAM = ["EX3", "HT2", "KD1", "SP6"]

TEXTBOOK_SOURCES: list[dict] = []

RED_FLAG_BOUNDARY: list[dict] = []

WAIVERS = [
    {"row": "A2", "patterns": list(ORIGINAL),
     "reason": "The original library was written from the SOP and its quotations. No textbook or modern source is recorded for any pattern, and some patterns have no quotation of their own. "
               "Naming and checking a second source per pattern is a finding for the clinical reviewer (review pack: Citations), recorded here so that the gap can only shrink."},
    {"row": "A7", "patterns": ["EX3", "HT2", "KD1", "SP6"],
     "reason": "These four cannot reach the 40-point band from the inquiry alone (they are declared in needs_exam). Their golden seeds are the inquiry's answers only, derived mechanically from the "
               "question bank, and include no tongue or pulse finding. Golden cases are left as they are until the seed derivation learns to answer the examination screens."},
    {"row": "A8", "patterns": ["HT1"],
     "reason": "Its only tier-A formula, F_GUIPI (Gui Pi Tang), is partially verified (K-14): the source text lists eight herbs and the app the common ten-herb form. The pharmacy reviewer decides which form to keep."},
    {"row": "A10", "patterns": list(ORIGINAL),
     "reason": "The red-flag boundary of a pattern was never recorded as data. The assessment shows the notice for every red flag whatever the pattern, but the physician has not listed which flags must "
               "stand in front of which pattern. The dossier lists the flags nearby for the reviewer."},
    {"row": "A11", "patterns": [p for p in ORIGINAL if p != "SP1"],
     "reason": "The safety vignettes replay the typical patient of one pattern (SP1) and a few of others, and only SP1's include a red flag and a population gate. A vignette with a red flag and one gated "
               "by a population are required of every pattern admitted from now on."},
]

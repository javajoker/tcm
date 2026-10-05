"""Build data/safety/name-fold.json: the characters of the names an allergy can match whose Simplified form differs (PM-33).

The safety rules match an allergy against herb and food names in the data's own script (Traditional). A person may type either script, so the matcher
folds both sides to one script with this table before it compares. The table is generated from the names themselves — every character of a herb name or
alias, a formula's herb name, or a food — with OpenCC's character table (t2s), so a new name brings its characters along and nothing is maintained by hand.
Folding is many-to-one (乾 and 幹 both become 干): a fold can only make two names look alike, never tell two apart, so it can only add matches. For an
allergy that is the safe direction.
"""
from __future__ import annotations

import json

from opencc import OpenCC

from .common import DATA, dump

_t2s = OpenCC("t2s")


def _cjk(c: str) -> bool:
    return "㐀" <= c <= "鿿" or "\U00020000" <= c <= "\U0002fa1f"


def _from_disk(rel: str) -> dict:
    return json.loads((DATA / rel).read_text(encoding="utf-8"))


def names(load=_from_disk) -> set[str]:
    """Every name the safety rules compare an allergy with (the engine's `herbNameSet`, the food names of the patterns and of the guidance)."""
    out: set[str] = set()
    for h in load("herbs/herbs.json")["items"]:
        out.add(h["name"]["zh-Hant"])
        out.update(h.get("aliases") or [])
    for f in load("formulas/formulas.json")["items"]:
        out.update(c["name"] for c in f["composition"])
    for p in load("diagnosis/patterns.json")["items"]:
        out.update(p["treatment"]["foods"])
    out.update(load("treatment/guidance.json")["foods"])
    return out


def fold_table(texts: set[str]) -> dict[str, str]:
    """Traditional character → Simplified character, for the characters of `texts` that change. Only a one-for-one change belongs in the table."""
    table: dict[str, str] = {}
    for c in sorted({c for t in texts for c in t if _cjk(c)}):
        s = _t2s.convert(c)
        if s != c and len(s) == 1:
            table[c] = s
    return table


def encode(table: dict[str, str]) -> list[str]:
    """`53C3:53C2` per character, sorted. Code points in hex keep the file free of Chinese text: it is a table for the matcher, not text for a reader, so it does not pass
    through the Simplified display dictionary, and a pair is one line in a diff."""
    return [f"{ord(a):04X}:{ord(table[a]):04X}" for a in sorted(table)]


def main() -> None:
    table = fold_table(names())
    dump(DATA / "safety" / "name-fold.json", {
        "_meta": {"description": "Characters of the herb and food names that have a different Simplified form, so that an allergy typed in either script is matched (PM-33). "
                                 "Generated from the names by scripts/kb/build_name_fold.py (OpenCC t2s, one character for one); do not edit by hand.",
                  "schema": 1, "status": "derived", "count": len(table),
                  "format": "each entry is the code point (hex) of a character of the data and of its Simplified form: 53C3:53C2 is U+53C3 to U+53C2"},
        "fold": encode(table),
    })
    print(f"name-fold: {len(table)} characters")


if __name__ == "__main__":
    main()

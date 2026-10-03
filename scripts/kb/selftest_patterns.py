"""Self-test of the pattern weight tables with the scoring model of SOP §8.3.

For every pattern we simulate a typical patient (all symptoms with weight ≥ 2 present at moderate severity,
nothing else) and check that the pattern ranks in the top 3 of all 23 — otherwise its evidence table cannot
discriminate it. Also exposes `score()` so docs/examples are computed from the data, not by hand.
"""
from __future__ import annotations

import json
import sys

from .common import DATA

SEV = {"light": 0.6, "moderate": 0.8, "severe": 1.0}
Q = {"inquiry": 1.0, "measured": 0.9, "guided": 0.7, "pulse": 0.5}


def quality(sid: str) -> float:
    return Q["guided"] if sid.startswith("T_") else Q["pulse"] if sid.startswith("P_") else Q["inquiry"]


def score(pattern: dict, present: dict[str, float | None]) -> float:
    """present: symptom id → severity factor (None = treated as moderate). Returns Pct."""
    pos = sum(w * (present[s] or SEV["moderate"]) * quality(s) for s, w in pattern["weights"].items() if s in present)
    neg = sum(v * quality(s) for s, v in pattern["against"].items() if s in present)
    m = sum(pattern["weights"].values())
    pct = max(0.0, pos - neg) / m * 100
    if not any(r in present for r in pattern["required_any"]):
        pct *= 0.5
    return pct


def main() -> int:
    patterns = json.loads((DATA / "diagnosis" / "patterns.json").read_text(encoding="utf-8"))["items"]
    problems, report = [], []
    for p in patterns:
        patient = {s: SEV["moderate"] for s, w in p["weights"].items() if w >= 2}
        ranked = sorted(((score(q, patient), q["id"]) for q in patterns), reverse=True)
        pos = [pid for _, pid in ranked].index(p["id"]) + 1
        own = dict((pid, sc) for sc, pid in ranked)[p["id"]]
        report.append((p["id"], pos, round(own, 1), [(pid, round(sc, 1)) for sc, pid in ranked[:3]]))
        if pos > 3:
            problems.append(f"{p['id']} ranks #{pos} for its own typical patient (score {own:.1f})")
    for pid, pos, own, top in report:
        print(f"  {pid}: rank {pos}  own {own}  top3 {top}")
    if problems:
        print("PATTERN SELF-TEST FAILED:")
        for x in problems:
            print(" -", x)
        return 1
    print(f"pattern self-test: all {len(patterns)} patterns rank in the top 3 for their own typical patient")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Self-test of the pattern weight tables with the scoring model of SOP §9.2 (implemented in oracle.py).

For every pattern we simulate a typical patient (all symptoms with weight ≥ 2 present at moderate severity,
nothing else) and check that the pattern ranks in the top 3 of all 23 — otherwise its evidence table cannot
discriminate it. The scoring itself lives in `oracle.py` and reads data/diagnosis/scoring-params.json.
"""
from __future__ import annotations

import sys

from . import oracle


def typical_patient(pattern: dict) -> dict:
    """Findings of the 'typical patient' of a pattern: every symptom with weight ≥ 2, present, moderate."""
    return {s: {"state": "present", "severity": "moderate"} for s, w in pattern["weights"].items() if w >= 2}


def main() -> int:
    patterns = oracle.load("diagnosis/patterns.json")["items"]
    problems, report = [], []
    for p in patterns:
        scores = oracle.pattern_scores(patterns, typical_patient(p))
        ranked = sorted(((sc, pid) for pid, sc in scores.items()), key=lambda t: (-t[0], t[1]))
        pos = [pid for _, pid in ranked].index(p["id"]) + 1
        own = scores[p["id"]]
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

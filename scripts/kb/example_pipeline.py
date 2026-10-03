"""Worked example of the SOP (§9.5, §10.6, §12.4–§12.5) run on the data in data/ with the oracle.

Every number in the SOP worked example is produced here, not by hand. The maths lives in `oracle.py`
(the executable specification of @tcm/engine); this script only builds the example patient and prints rounded results.
"""
from __future__ import annotations

import json
import math
import subprocess

from . import oracle
from .common import ROOT


def sev(level):
    return {"state": "present", "severity": level}


def main():
    patterns = oracle.load("diagnosis/patterns.json")["items"]
    formulas = {f["id"]: f for f in oracle.load("formulas/formulas.json")["items"]}
    herbs = {h["id"]: h for h in oracle.load("herbs/herbs.json")["items"]}

    # worked example patient
    findings = {"S_POSTPRANDIAL_BLOAT": sev("moderate"), "S_LOOSE_STOOL": sev("severe"), "S_FATIGUE": sev("moderate"),
                "S_LAZY_SPEAK": sev("light"), "S_POOR_APPETITE": sev("moderate"), "T_TOOTHMARK_EDGE": sev(None), "T_BODY_PALE": sev(None),
                "S_BODY_HEAVY": sev("light"), "S_NO_THIRST": sev(None)}
    scores = oracle.pattern_scores(patterns, findings)
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))[:5]
    print("top patterns:", [(k, round(v, 1)) for k, v in ranked])
    panel = oracle.noisy_or_panel(patterns, scores)
    print("panel:", {k: round(v, 3) for k, v in sorted(panel.items()) if abs(v) > 0.05})
    obs_w = oracle.wuxing_function(panel)
    print("W (five-phase function):", {e: round(v, 3) for e, v in obs_w.items()})
    print("八綱:", {k: round(v, 3) for k, v in oracle.bagang(panel).items()})

    ref = json.loads(subprocess.run(["node", "scripts/kb/example_reference.ts"], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    print("reference total:", ref["total"], "season", ref["season"])
    print("W − reference (personal offset):", {e: round(obs_w[e] - ref["total"][e], 3) for e in obs_w})
    align = {e: ("aligned" if abs(ref["total"][e]) >= 0.25 and obs_w[e] != 0 and math.copysign(1, ref["total"][e]) == math.copysign(1, obs_w[e]) else
                 "opposed" if abs(ref["total"][e]) >= 0.25 and obs_w[e] != 0 else "neutral") for e in obs_w}
    print("alignment:", align)

    rows = sorted((oracle.match_formula(panel, f) for f in formulas.values() if f.get("mvp", True)), key=lambda r: (-r["explained"], r["id"]))[:6]
    print("formula matching (explained fraction of the deviation):")
    for r in rows:
        print("  ", {**r, "k": round(r["k"], 2), "explained": round(r["explained"], 3)})
    top = formulas[rows[0]["id"]]
    pool = oracle.modification_pool(herbs)
    log, final_cost = oracle.greedy_modify(panel, top, herbs, pool, rows[0]["k"])
    print("greedy 加減 on", top["id"], ":", [(a, herbs[h]["name"]["zh-Hant"], round(gain, 3)) for a, h, gain in log], "residual cost",
          round(final_cost, 3), "vs base", round(oracle.cost(panel, {}), 3))


if __name__ == "__main__":
    main()

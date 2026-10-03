"""Export the parity fixture of @tcm/engine: inputs and full-precision expected outputs computed by the Python oracle (tech spec §7.4).

    .venv/bin/python -m scripts.kb.export_parity_cases          # writes packages/engine/test/fixtures/parity.json

Cases: the SOP worked example, the 23 'typical patient' cases, edge cases (nothing, all absent, all unsure, a single symptom), and N seeded
random finding sets over all 171 symptom codes. The fixture is regenerated whenever scoring-params.json or the KB changes; CI regenerates it and
fails on a diff, so the oracle and the TypeScript engine cannot silently diverge.
"""
from __future__ import annotations

import hashlib
import json
import random
import sys

from . import oracle
from .common import DATA, ROOT
from .selftest_patterns import typical_patient

OUT = ROOT / "packages" / "engine" / "test" / "fixtures" / "parity.json"
SEED = 20261004
RANDOM_CASES = 120
SEVERITIES = ["light", "moderate", "severe"]


def worked_example() -> dict:
    def f(sev=None):
        return {"state": "present", "severity": sev}
    return {"S_POSTPRANDIAL_BLOAT": f("moderate"), "S_LOOSE_STOOL": f("severe"), "S_FATIGUE": f("moderate"), "S_LAZY_SPEAK": f("light"), "S_POOR_APPETITE": f("moderate"),
            "T_TOOTHMARK_EDGE": f(), "T_BODY_PALE": f(), "S_BODY_HEAVY": f("light"), "S_NO_THIRST": f()}


def random_findings(rng: random.Random, symptom_ids: list[str]) -> dict:
    n = rng.randint(3, 22)
    findings = {}
    for sid in rng.sample(symptom_ids, n):
        state = rng.choices(["present", "absent", "unsure"], weights=[6, 2, 1])[0]
        finding: dict = {"state": state}
        if state == "present" and not sid.startswith(("T_", "P_")) and rng.random() < 0.8:
            finding["severity"] = rng.choice(SEVERITIES)
        if state == "present" and rng.random() < 0.15:
            finding["source"] = rng.choice(["inquiry", "measured", "guided", "pulse"])
        findings[sid] = finding
    return findings


def expected(findings: dict, ctx: dict) -> dict:
    p = ctx["params"]
    scores = oracle.pattern_scores(ctx["patterns"], findings, p)
    panel = oracle.noisy_or_panel(ctx["patterns"], scores, p)
    base = oracle.cost(panel, {}, p)
    ranked = []
    for f in ctx["formulas"]:
        m = oracle.match_formula(panel, f, p)
        ranked.append({"id": f["id"], "k": m["k"], "explained": m["explained"], "coreFit": oracle.core_fit(f, findings)})
    ranked.sort(key=lambda r: (-r["explained"], r["id"]))
    out = {"scores": scores, "elements": oracle.element_scores(ctx["elements"], findings, p), "panel": panel, "wuxingFunction": oracle.wuxing_function(panel, p), "bagang": oracle.bagang(panel, p), "costBase": base, "formulas": ranked}
    top = ranked[0]
    if base > 0 and top["explained"] > 0:
        formula = next(f for f in ctx["formulas"] if f["id"] == top["id"])
        log, final = oracle.greedy_modify(panel, formula, ctx["herbs"], ctx["pool"], top["k"], p)
        out["modification"] = {"formula": top["id"], "k": top["k"], "log": [[op, herb, gain] for op, herb, gain in log], "cost": final}
    return out


def build() -> dict:
    params = oracle.params()
    patterns = oracle.load("diagnosis/patterns.json")["items"]
    formulas = [f for f in oracle.load("formulas/formulas.json")["items"] if f.get("mvp", True)]
    herbs = {h["id"]: h for h in oracle.load("herbs/herbs.json")["items"]}
    symptom_ids = sorted(s["id"] for s in oracle.load("diagnosis/symptoms.json")["items"])
    elements = oracle.load("diagnosis/pattern-elements.json")["items"]
    ctx = {"params": params, "patterns": patterns, "elements": elements, "formulas": formulas, "herbs": herbs, "pool": oracle.modification_pool(herbs)}

    cases = [{"id": "worked-example", "findings": worked_example()}]
    cases += [{"id": f"typical-{p['id']}", "findings": typical_patient(p)} for p in patterns]
    cases += [{"id": "edge-empty", "findings": {}},
              {"id": "edge-all-absent", "findings": {s: {"state": "absent"} for s in symptom_ids}},
              {"id": "edge-all-unsure", "findings": {s: {"state": "unsure"} for s in symptom_ids}},
              {"id": "edge-single", "findings": {"S_FATIGUE": {"state": "present", "severity": "severe"}}},
              {"id": "edge-everything", "findings": {s: {"state": "present", "severity": "severe"} for s in symptom_ids}}]
    rng = random.Random(SEED)
    cases += [{"id": f"random-{i:03d}", "findings": random_findings(rng, symptom_ids)} for i in range(RANDOM_CASES)]
    for c in cases:
        c["expect"] = expected(c["findings"], ctx)

    digest = hashlib.sha256()
    for rel in ("diagnosis/scoring-params.json", "diagnosis/patterns.json", "diagnosis/pattern-elements.json", "formulas/formulas.json", "herbs/herbs.json", "diagnosis/symptoms.json"):
        digest.update((DATA / rel).read_bytes())
    return {"_meta": {"description": "Parity cases for @tcm/engine computed by scripts/kb/oracle.py at full precision. Regenerate with scripts.kb.export_parity_cases.",
                      "seed": SEED, "random_cases": RANDOM_CASES, "count": len(cases), "inputs_sha256": digest.hexdigest()}, "cases": cases}


def main() -> int:
    data = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n", encoding="utf-8")
    print(f"parity: {data['_meta']['count']} cases → {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

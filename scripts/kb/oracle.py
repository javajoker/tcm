"""Reference ("oracle") implementation of the diagnosis maths of SOP §9–§12, run on the data in data/.

It is the executable specification of @tcm/engine: the TypeScript engine must match it case by case (tech spec §7.4,
`export_parity_cases.py`). Every parameter comes from data/diagnosis/scoring-params.json (single source, tech spec T10).
All functions work at FULL precision; rounding is for display only (callers round when they print).

Findings use the engine's shape: {symptom_id: {"state": "present"|"absent"|"unsure", "severity": "light"|"moderate"|"severe"|None,
"source": "inquiry"|"measured"|"guided"|"pulse"|None}}. Only `present` findings add evidence; `absent` and `unsure` contribute nothing
to a score (the denominator Σw is fixed) — they differ in coverage and in what the questionnaire asks next.
"""
from __future__ import annotations

import json
import math
from collections import defaultdict
from functools import lru_cache

from .common import DATA

ORGANS = ["肝", "心", "脾", "肺", "腎", "膽", "小腸", "胃", "大腸", "膀胱"]
ORGAN_ELEMENT = {"肝": "木", "膽": "木", "心": "火", "小腸": "火", "脾": "土", "胃": "土", "肺": "金", "大腸": "金", "腎": "水", "膀胱": "水"}
ELEMENT_ZANG = {"木": "肝", "火": "心", "土": "脾", "金": "肺", "水": "腎"}
ELEMENT_FU = {"木": "膽", "火": "小腸", "土": "胃", "金": "大腸", "水": "膀胱"}


@lru_cache(maxsize=None)
def load(rel: str):
    return json.loads((DATA / rel).read_text(encoding="utf-8"))


def params() -> dict:
    return load("diagnosis/scoring-params.json")


# ── findings ────────────────────────────────────────────────────────────────

def present(state: str) -> bool:
    return state == "present"


def severity_factor(finding: dict, p: dict | None = None) -> float:
    sev = (p or params())["severity"]
    return sev[finding.get("severity") or "ungraded"]


def quality_of(symptom_id: str, finding: dict | None = None, p: dict | None = None) -> float:
    q = (p or params())["quality"]
    source = (finding or {}).get("source")
    if source is None:
        source = next((src for prefix, src in q["by_prefix"].items() if symptom_id.startswith(prefix)), q["default_source"])
    return q["by_source"][source]


def pattern_pct(pattern: dict, findings: dict, p: dict | None = None) -> float:
    """SOP §9.2: Pct = max(0, Σ w·sev·q − Σ v·q) ÷ Σ w × 100, × factor when no required_any symptom is present."""
    p = p or params()
    pos = neg = 0.0
    for sid, w in pattern["weights"].items():
        f = findings.get(sid)
        if f and present(f["state"]):
            pos += w * severity_factor(f, p) * quality_of(sid, f, p)
    for sid, v in pattern["against"].items():
        f = findings.get(sid)
        if f and present(f["state"]):
            neg += v * quality_of(sid, f, p)
    pct = max(0.0, pos - neg) / sum(pattern["weights"].values()) * 100
    if not any(findings.get(r) and present(findings[r]["state"]) for r in pattern["required_any"]):
        pct *= p["pattern"]["required_any_missing_factor"]
    return pct


def pattern_scores(patterns: list[dict], findings: dict, p: dict | None = None) -> dict[str, float]:
    return {pt["id"]: pattern_pct(pt, findings, p) for pt in patterns}


def element_pct(element: dict, findings: dict, p: dict | None = None) -> float:
    """證素 score (SOP §9.3): the pattern formula without the required_any rule (an element is a building block, not a diagnosis)."""
    p = p or params()
    pos = neg = 0.0
    for sid, w in element["weights"].items():
        f = findings.get(sid)
        if f and present(f["state"]):
            pos += w * severity_factor(f, p) * quality_of(sid, f, p)
    for sid, v in element["against"].items():
        f = findings.get(sid)
        if f and present(f["state"]):
            neg += v * quality_of(sid, f, p)
    return max(0.0, pos - neg) / sum(element["weights"].values()) * 100


def element_scores(elements: list[dict], findings: dict, p: dict | None = None) -> dict[str, float]:
    return {e["id"]: element_pct(e, findings, p) for e in elements}


# ── panel ───────────────────────────────────────────────────────────────────

def noisy_or_panel(patterns: list[dict], scores: dict[str, float], p: dict | None = None) -> dict[str, float]:
    """SOP §10.2. Each pattern with Pct ≥ floor projects degree = degree_max·Pct/100 onto the panel; overlapping contributions
    combine by noisy-OR per sign so that two patterns describing the same deficiency do not double-count."""
    cfg = (p or params())["panel"]
    top = cfg["degree_max"]
    pos, neg = defaultdict(list), defaultdict(list)
    for pt in patterns:
        pct = scores[pt["id"]]
        if pct < cfg["noisy_or_floor"]:
            continue
        d = top * pct / 100
        for dim, unit in pt["panel_projection_per_degree"].items():
            x = d * unit
            (pos if x > 0 else neg)[dim].append(abs(x))
    panel = {}
    for dim in sorted(set(pos) | set(neg)):
        up = top * (1 - math.prod(1 - min(x, top) / top for x in pos[dim])) if pos[dim] else 0.0
        dn = top * (1 - math.prod(1 - min(x, top) / top for x in neg[dim])) if neg[dim] else 0.0
        panel[dim] = up - dn
    return panel


def wuxing_function(panel: dict, p: dict | None = None) -> dict[str, float]:
    cfg = (p or params())["panel"]["wuxing_function"]
    w = {}
    for e, z in ELEMENT_ZANG.items():
        f = ELEMENT_FU[e]
        zq = (panel.get(f"{z}.qi", 0) + panel.get(f"{z}.yang", 0)) / 2
        fq = (panel.get(f"{f}.qi", 0) + panel.get(f"{f}.yang", 0)) / 2
        w[e] = cfg["zang"] * zq + cfg["fu"] * fq
    return w


def bagang(panel: dict, p: dict | None = None) -> dict[str, float]:
    """SOP §10.4: 八綱 derived scalars."""
    c = (p or params())["panel"]["bagang"]
    yang_def = sum(-v for k, v in panel.items() if k.endswith(".yang") and v < 0)
    yin_def = sum(-v for k, v in panel.items() if k.endswith(".yin") and v < 0)
    heat = panel.get("liuxie.火", 0) + panel.get("liuxie.暑", 0) - panel.get("liuxie.寒", 0) - c["yang_deficit_weight"] * yang_def + c["yin_deficit_weight"] * yin_def
    excess = sum(v for k, v in panel.items() if (k.split(".")[1] in ("qi", "blood", "yin", "yang", "stasis") and v > 0) or k.startswith("product."))
    deficit = sum(-v for k, v in panel.items() if k.split(".")[-1] in ("qi", "blood", "yin", "yang") and v < 0)
    return {
        "cold_heat": max(-1.0, min(1.0, heat / c["heat_divisor"])),
        "deficiency_excess": max(-1.0, min(1.0, (excess - deficit) / c["excess_divisor"])),
        "exterior": max(0.0, min(1.0, panel.get("bagang.exterior", 0) / c["exterior_divisor"])),
    }


# ── formula fit ─────────────────────────────────────────────────────────────

def weight_of(dim: str, p: dict | None = None) -> float:
    w = (p or params())["panel"]["dimension_weights"]
    kind = dim.split(".")[0]
    return w["organ"] if kind not in w else w[kind]


def herb_vec(herb: dict) -> dict[str, float]:
    v: dict[str, float] = defaultdict(float)
    for k, x in herb["effects"].items():
        v[k] += x
    for k, x in herb["harms"].items():
        v[k] += x
    return v


def formula_vec(f: dict) -> dict[str, float]:
    v: dict[str, float] = defaultdict(float)
    for k, x in f["panel_effect"].items():
        v[k] += x
    for k, x in f["panel_burden"].items():
        v[k] += x
    return v


def cost(dev: dict, t: dict, p: dict | None = None) -> float:
    """‖D + T‖²_w over the union of dimensions."""
    dims = sorted(set(dev) | set(t))
    return sum(weight_of(d, p) * (dev.get(d, 0) + t.get(d, 0)) ** 2 for d in dims)


def best_scale(dev: dict, e: dict, p: dict | None = None) -> float:
    """k* = argmin_k ‖D + k·E‖²_w = clip(−⟨D,E⟩_w / ⟨E,E⟩_w, 0, k_max)."""
    p = p or params()
    dims = sorted(set(dev) | set(e))
    num = -sum(weight_of(d, p) * dev.get(d, 0) * e.get(d, 0) for d in dims)
    den = sum(weight_of(d, p) * e.get(d, 0) ** 2 for d in dims)
    return 0.0 if den == 0 else max(0.0, min(p["formula"]["k_max"], num / den))


def match_formula(dev: dict, f: dict, p: dict | None = None) -> dict:
    p = p or params()
    e = formula_vec(f)
    k = best_scale(dev, e, p)
    base = cost(dev, {}, p)
    after = cost(dev, {d: k * x for d, x in e.items()}, p)
    return {"id": f["id"], "name": f["name"]["zh-Hant"], "k": k, "explained": (1 - after / base) if base else 0.0, "tier": f["tier"]}


def core_fit(formula: dict, findings: dict) -> float:
    """SOP §12.4 step 2: share of the formula's core indications the user has."""
    core = formula["core_indications"]
    return sum(1 for s in core if findings.get(s) and present(findings[s]["state"])) / len(core) if core else 0.0


def greedy_modify(dev: dict, f: dict, herbs: dict, pool: list[str], k: float, p: dict | None = None):
    """加減 (SOP §12.5): add up to max_add herbs from `pool` (as 佐, `add_share` of the effective weight) and remove up to
    max_remove herbs (never 君) when each step lowers the cost. Returns (log, final_cost) with log = [(op, herb_id, gain)]."""
    p = p or params()
    cfg = p["formula"]["modification"]
    comp = {c["herb"]: c["effective_weight"] for c in f["composition"]}
    roles = {c["herb"]: c["role"] for c in f["composition"]}

    def total(comp_w):
        v: dict[str, float] = defaultdict(float)
        for h in sorted(comp_w):
            for d, x in herb_vec(herbs[h]).items():
                v[d] += comp_w[h] * x
        return v

    cur = dict(comp)
    log: list[tuple[str, str, float]] = []
    cur_cost = cost(dev, {d: k * x for d, x in total(cur).items()}, p)
    for _ in range(cfg["max_add"]):
        best = None
        for h in pool:
            if h in cur:
                continue
            trial = {a: w * (1 - cfg["add_share"]) for a, w in cur.items()}
            trial[h] = cfg["add_share"]
            c = cost(dev, {d: k * x for d, x in total(trial).items()}, p)
            if best is None or c < best[0] or (c == best[0] and h < best[1]):
                best = (c, h, trial)
        if best and best[0] < cur_cost - cfg["min_gain"]:
            log.append(("add", best[1], cur_cost - best[0]))
            cur_cost, cur = best[0], best[2]
    removed = 0
    while removed < cfg["max_remove"]:
        best = None
        for h in sorted(cur):
            if roles.get(h) == "君":
                continue
            rest = {a: w for a, w in cur.items() if a != h}
            s = sum(rest.values())
            trial = {a: w / s for a, w in rest.items()}
            c = cost(dev, {d: k * x for d, x in total(trial).items()}, p)
            if best is None or c < best[0]:
                best = (c, h, trial)
        if best and best[0] < cur_cost - cfg["min_gain"]:
            log.append(("remove", best[1], cur_cost - best[0]))
            cur_cost, cur = best[0], best[2]
            removed += 1
        else:
            break
    return log, cur_cost


def modification_pool(herbs: dict) -> list[str]:
    """Candidate herbs for the residual 加減: curated, not toxic, pregnancy-safe (SOP §12.5). Sorted for determinism."""
    return sorted(h for h, rec in herbs.items() if rec["status"] == "curated-draft" and rec["pregnancy"] in ("ok", "ok-unreviewed") and not rec["toxic"])

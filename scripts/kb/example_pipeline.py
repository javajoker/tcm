"""Reference implementation (prototype) of the diagnosis maths specified in SOP §9–§12, run on the data in data/.

It exists for two reasons: (1) every number in the SOP worked example is produced here, not by hand; (2) it proves the
specified algorithms work on the real knowledge base (pattern scoring → panel → offsets → formula matching → 加減).
The production engine will be written in the app's language; this script is its executable specification/oracle.
"""
from __future__ import annotations

import json
import math
import subprocess
from collections import defaultdict

from .common import DATA, ROOT
from .selftest_patterns import SEV, quality

ORGANS = ["肝", "心", "脾", "肺", "腎", "膽", "小腸", "胃", "大腸", "膀胱"]
ORGAN_ELEMENT = {"肝": "木", "膽": "木", "心": "火", "小腸": "火", "脾": "土", "胃": "土", "肺": "金", "大腸": "金", "腎": "水", "膀胱": "水"}
ELEMENT_ZANG = {"木": "肝", "火": "心", "土": "脾", "金": "肺", "水": "腎"}
ELEMENT_FU = {"木": "膽", "火": "小腸", "土": "胃", "金": "大腸", "水": "膀胱"}
DIM_WEIGHT = {"organ": 1.0, "liuxie": 0.7, "product": 0.7, "bagang": 0.0}


def load(rel):
    return json.loads((DATA / rel).read_text(encoding="utf-8"))


def pattern_scores(patterns, present):
    out = {}
    for p in patterns:
        pos = sum(w * (present[s][0]) * quality(s) for s, w in p["weights"].items() if s in present)
        neg = sum(v * quality(s) for s, v in p["against"].items() if s in present)
        pct = max(0.0, pos - neg) / sum(p["weights"].values()) * 100
        if not any(r in present for r in p["required_any"]):
            pct *= 0.5
        out[p["id"]] = round(pct, 1)
    return out


def noisy_or_panel(patterns, scores, floor=20.0):
    """Observed panel: each pattern projects degree = 3·Pct/100 onto the panel; overlapping contributions combine by noisy-OR
    per sign so that two patterns that describe the same deficiency do not double-count."""
    pos, neg = defaultdict(list), defaultdict(list)
    for p in patterns:
        pct = scores[p["id"]]
        if pct < floor:
            continue
        d = 3 * pct / 100
        for dim, unit in p["panel_projection_per_degree"].items():
            x = d * unit
            (pos if x > 0 else neg)[dim].append(abs(x))
    panel = {}
    for dim in set(pos) | set(neg):
        up = 3 * (1 - math.prod(1 - min(x, 3) / 3 for x in pos[dim])) if pos[dim] else 0.0
        dn = 3 * (1 - math.prod(1 - min(x, 3) / 3 for x in neg[dim])) if neg[dim] else 0.0
        panel[dim] = round(up - dn, 3)
    return panel


def wuxing_function(panel):
    w = {}
    for e, z in ELEMENT_ZANG.items():
        f = ELEMENT_FU[e]
        zq = (panel.get(f"{z}.qi", 0) + panel.get(f"{z}.yang", 0)) / 2
        fq = (panel.get(f"{f}.qi", 0) + panel.get(f"{f}.yang", 0)) / 2
        w[e] = round(0.7 * zq + 0.3 * fq, 3)
    return w


def bagang(panel):
    yang_def = sum(-v for k, v in panel.items() if k.endswith(".yang") and v < 0)
    yin_def = sum(-v for k, v in panel.items() if k.endswith(".yin") and v < 0)
    heat = panel.get("liuxie.火", 0) + panel.get("liuxie.暑", 0) - panel.get("liuxie.寒", 0) - 0.5 * yang_def + 0.5 * yin_def
    excess = sum(v for k, v in panel.items() if (k.split(".")[1] in ("qi", "blood", "yin", "yang", "stasis") and v > 0) or k.startswith("product."))
    deficit = sum(-v for k, v in panel.items() if k.split(".")[-1] in ("qi", "blood", "yin", "yang") and v < 0)
    return {"cold_heat": round(max(-1, min(1, heat / 3)), 3), "deficiency_excess": round(max(-1, min(1, (excess - deficit) / 6)), 3),
            "exterior": round(max(0, min(1, panel.get("bagang.exterior", 0) / 3)), 3)}


def weight_of(dim):
    kind = dim.split(".")[0]
    return DIM_WEIGHT["organ"] if kind not in DIM_WEIGHT else DIM_WEIGHT[kind]


def herb_vec(herb):
    v = defaultdict(float)
    for k, x in herb["effects"].items():
        v[k] += x
    for k, x in herb["harms"].items():
        v[k] += x
    return v


def formula_vec(f):
    v = defaultdict(float)
    for k, x in f["panel_effect"].items():
        v[k] += x
    for k, x in f["panel_burden"].items():
        v[k] += x
    return v


def cost(dev, t):
    dims = set(dev) | set(t)
    return sum(weight_of(d) * (dev.get(d, 0) + t.get(d, 0)) ** 2 for d in dims)


def best_scale(dev, e, kmax=3.0):
    """k* = argmin_k ‖D + k·E‖²_w, clipped to [0, kmax] (closed form)."""
    dims = set(dev) | set(e)
    num = -sum(weight_of(d) * dev.get(d, 0) * e.get(d, 0) for d in dims)
    den = sum(weight_of(d) * e.get(d, 0) ** 2 for d in dims)
    return 0.0 if den == 0 else max(0.0, min(kmax, num / den))


def match_formula(dev, f):
    e = formula_vec(f)
    k = best_scale(dev, e)
    base = cost(dev, {})
    after = cost(dev, {d: k * x for d, x in e.items()})
    return {"id": f["id"], "name": f["name"]["zh-Hant"], "k": round(k, 2), "explained": round(1 - after / base, 3) if base else 0.0, "tier": f["tier"]}


def greedy_modify(dev, f, herbs, pool, k, max_add=2, max_remove=1, add_share=0.12):
    """加減: add up to `max_add` herbs from `pool` (as 佐) and remove up to `max_remove` herbs (never 君) when each step lowers the cost."""
    comp = {c["herb"]: c["effective_weight"] for c in f["composition"]}
    roles = {c["herb"]: c["role"] for c in f["composition"]}

    def total(comp_w):
        v = defaultdict(float)
        for h, w in comp_w.items():
            for d, x in herb_vec(herbs[h]).items():
                v[d] += w * x
        return v

    cur = dict(comp)
    log = []
    cur_cost = cost(dev, {d: k * x for d, x in total(cur).items()})
    for _ in range(max_add):
        best = None
        for h in pool:
            if h in cur:
                continue
            trial = {a: w * (1 - add_share) for a, w in cur.items()}
            trial[h] = add_share
            c = cost(dev, {d: k * x for d, x in total(trial).items()})
            if best is None or c < best[0]:
                best = (c, h, trial)
        if best and best[0] < cur_cost - 1e-6:
            log.append(("add", best[1], round(cur_cost - best[0], 3)))
            cur_cost, cur = best[0], best[2]
    removed = 0
    while removed < max_remove:
        best = None
        for h in list(cur):
            if roles.get(h) == "君":
                continue
            rest = {a: w for a, w in cur.items() if a != h}
            s = sum(rest.values())
            trial = {a: w / s for a, w in rest.items()}
            c = cost(dev, {d: k * x for d, x in total(trial).items()})
            if best is None or c < best[0]:
                best = (c, h, trial)
        if best and best[0] < cur_cost - 1e-6:
            log.append(("remove", best[1], round(cur_cost - best[0], 3)))
            cur_cost, cur = best[0], best[2]
            removed += 1
        else:
            break
    return log, round(cur_cost, 3)


def main():
    patterns = load("diagnosis/patterns.json")["items"]
    formulas = {f["id"]: f for f in load("formulas/formulas.json")["items"]}
    herbs = {h["id"]: h for h in load("herbs/herbs.json")["items"]}

    # worked example patient: (severity factor; None = moderate)
    present = {"S_POSTPRANDIAL_BLOAT": (SEV["moderate"],), "S_LOOSE_STOOL": (SEV["severe"],), "S_FATIGUE": (SEV["moderate"],),
               "S_LAZY_SPEAK": (SEV["light"],), "S_POOR_APPETITE": (SEV["moderate"],), "T_TOOTHMARK_EDGE": (1.0,), "T_BODY_PALE": (1.0,),
               "S_BODY_HEAVY": (SEV["light"],), "S_NO_THIRST": (1.0,)}
    scores = pattern_scores(patterns, present)
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])[:5]
    print("top patterns:", ranked)
    panel = noisy_or_panel(patterns, scores)
    print("panel:", {k: v for k, v in sorted(panel.items()) if abs(v) > 0.05})
    print("W (five-phase function):", wuxing_function(panel))
    print("八綱:", bagang(panel))

    ref = json.loads(subprocess.run(["node", "scripts/kb/example_reference.ts"], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    obs_w = wuxing_function(panel)
    print("reference total:", ref["total"], "season", ref["season"])
    print("W − reference (personal offset):", {e: round(obs_w[e] - ref["total"][e], 3) for e in obs_w})
    align = {e: ("aligned" if abs(ref["total"][e]) >= 0.25 and obs_w[e] != 0 and math.copysign(1, ref["total"][e]) == math.copysign(1, obs_w[e]) else
                 "opposed" if abs(ref["total"][e]) >= 0.25 and obs_w[e] != 0 else "neutral") for e in obs_w}
    print("alignment:", align)

    rows = sorted((match_formula(panel, f) for f in formulas.values() if f.get("mvp", True)), key=lambda r: -r["explained"])[:6]
    print("formula matching (explained fraction of the deviation):")
    for r in rows:
        print("  ", r)
    top = formulas[rows[0]["id"]]
    pool = [h for h in herbs if herbs[h]["status"] == "curated-draft" and herbs[h]["pregnancy"] in ("ok", "ok-unreviewed") and not herbs[h]["toxic"]]
    log, final_cost = greedy_modify(panel, top, herbs, pool, rows[0]["k"])
    print("greedy 加減 on", top["id"], ":", [(a, herbs[h]["name"]["zh-Hant"], gain) for a, h, gain in log], "residual cost", final_cost, "vs base", round(cost(panel, {}), 3))


if __name__ == "__main__":
    main()

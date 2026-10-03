"""Build the diagnosis data: symptoms, patterns (+ decomposed 證素), tongue, pulse, constitutions, red flags,
panel schema, treatment guidance, susceptibility and the yunqi texts."""
from __future__ import annotations

import json
import re
import subprocess
from collections import defaultdict

from .common import DATA, LIB, ROOT, dump, i18n, read_lib, submodule_commits, tw
from .curated import exam, panel, patterns as pat, symptoms, treatment
from .curated.formulas import FORMULAS

NATURE_ZH = {"風": "風", "寒": "寒", "火": "火熱", "暑": "暑", "濕": "濕", "燥": "燥", "痰": "痰", "飲": "飲", "瘀": "血瘀", "食積": "食積",
             "氣滯": "氣滯", "氣虛": "氣虛", "血虛": "血虛", "陰虛": "陰虛", "陽虛": "陽虛"}


def project(location: str, nature: str) -> dict[str, float]:
    """Per-unit-degree panel projection of one 證素 (location × nature)."""
    out: dict[str, float] = defaultdict(float)
    organs = panel.LOCATION_ORGANS[location]
    for tmpl, delta in panel.NATURE_PROJECTION[nature].items():
        if "{organ}" in tmpl:
            for o in organs:
                out[tmpl.replace("{organ}", o)] += delta
        else:
            out[tmpl] += delta
    if location in panel.EXTERIOR_LOCATIONS:
        out["bagang.exterior"] += 1.0
    return {k: round(v, 3) for k, v in sorted(out.items())}


def build_symptoms() -> dict:
    items = []
    for s in symptoms.SYMPTOMS:
        rec = dict(s)
        if s["kind"] == "tongue":
            cat, zone, meaning = exam.TONGUE_FEATURES[s["id"]]
            rec.update({"tongue": {"category": cat, "zone": zone, "meaning": meaning}})
        if s["kind"] == "pulse":
            rec["pulse"] = {"optional": True, "quality_coefficient": exam.PULSE_GUIDANCE["quality_coefficient"]}
        items.append(rec)
    dims: dict[str, int] = defaultdict(int)
    for s in items:
        dims[s["dimension"]] += 1
    return {"_meta": {"description": "Symptom / sign registry: 12 inquiry dimensions + tongue + pulse. English needs review.", "count": len(items), "by_dimension": dict(sorted(dims.items()))},
            "items": items}


def build_patterns(formula_ids: set[str], citation_ids: set[str]) -> tuple[dict, dict]:
    sym_ids = symptoms.SYMPTOM_IDS
    plist, elements = [], {}
    for p in pat.PATTERNS:
        for key in ("weights", "against"):
            unknown = set(p[key]) - sym_ids
            assert not unknown, f"{p['id']}.{key}: unknown symptoms {unknown}"
        assert set(p["required"]) <= sym_ids, p["id"]
        assert set(p["formulas"]) <= formula_ids, f"{p['id']}: unknown formula {set(p['formulas']) - formula_ids}"
        assert set(p["cites"]) <= citation_ids, f"{p['id']}: unknown citation {set(p['cites']) - citation_ids}"
        els, unit_projection = [], defaultdict(float)
        for loc, nature in p["elements"]:
            eid = f"PE_{loc}_{nature}"
            els.append(eid)
            proj = project(loc, nature)
            for k, v in proj.items():
                unit_projection[k] += v
            e = elements.setdefault(eid, {"id": eid, "location": loc, "nature": nature, "name": {"zh-Hant": f"{loc}{NATURE_ZH[nature]}", "en": None},
                                          "weights": {}, "against": {}, "patterns": [], "projection_per_degree": proj})
            e["patterns"].append(p["id"])
            for s, w in p["weights"].items():
                e["weights"][s] = max(e["weights"].get(s, 0), w)
            for s, v in p["against"].items():
                e["against"][s] = max(e["against"].get(s, 0), v)
        if any(loc in panel.EXTERIOR_LOCATIONS for loc, _ in p["elements"]):
            unit_projection["bagang.exterior"] = 1.0       # a pattern is "exterior" once, however many natures it has
        grp_formulas = p["formulas"]
        plist.append({
            "id": p["id"], "name": {"zh-Hant": p["zh"], "en": p["en"]}, "group": p["group"], "elements": els, "principle": p["principle"],
            "weights": dict(sorted(p["weights"].items())), "against": dict(sorted(p["against"].items())), "required_any": p["required"],
            "max_score": sum(p["weights"].values()), "tongue_pulse_note": p["tongue_pulse"],
            "panel_projection_per_degree": {k: round(v, 3) for k, v in sorted(unit_projection.items())},
            "formulas": grp_formulas, "citations": p["cites"],
            "treatment": dict(zip(("foods", "acupoints", "lifestyle"), treatment.GUIDANCE[p["id"]])),
            "status": "draft",
        })
    assert len(plist) == 23
    return ({"_meta": {"description": "23-pattern MVP library with weighted symptom evidence. Panel projection is per degree; degree = 3 × Pct / 100.",
                       "count": len(plist), "scoring": "Pct = Σ w·sev·q (present) − Σ v·q (against) ÷ Σ w × 100; required_any missing → ×0.5 (SOP §8.3)"},
             "items": plist},
            {"_meta": {"description": "Decomposed pattern elements (證素 = location × nature) with symptom weights taken as the maximum over the patterns that contain them. "
                                      "Used when no library pattern fits (compose from the top elements) and for formula modification.",
                       "count": len(elements)},
             "items": sorted(elements.values(), key=lambda e: e["id"])})


def build_tongue() -> dict:
    sym = {s["id"]: s for s in symptoms.SYMPTOMS}
    feats = []
    for fid, (cat, zone, meaning) in exam.TONGUE_FEATURES.items():
        feats.append({"id": fid, "name": {"zh-Hant": sym[fid]["zh-Hant"], "en": sym[fid]["en"]}, "category": cat, "zone": zone, "meaning": meaning})
    return {"_meta": {"description": "Tongue zones (classical per 《傷寒指掌》, textbook alternative alongside), zone-specific features and special signs.",
                      "zone_citation": "shanghan-zhizhang-tongue-zones", "guidance": exam.TONGUE_GUIDANCE,
                      "note": "Textbook zones (舌尖 心肺, 舌中 脾胃, 舌根 腎, 舌邊 肝膽) are not verified against the classics; the classical statement is verified."},
            "zones": exam.TONGUE_ZONES, "features": feats}


def build_pulse() -> dict:
    sym = {s["id"]: s for s in symptoms.SYMPTOMS}
    pulses = []
    for pid, zh, yy, group, feature, indications in exam.PULSES:
        assert sym[pid]["zh-Hant"] == f"{zh}脈", pid
        pulses.append({"id": pid, "name": {"zh-Hant": f"{zh}脈", "en": sym[pid]["en"]}, "yin_yang": yy, "group": group, "feature": feature, "indications": indications,
                       "source": {"book": "診家正眼" if pid == "P_HASTY" else "瀕湖脈學", "chapter": f"{zh}（{yy}）" if pid != "P_HASTY" else "疾脈（陽）", "verified_heading": True}})
    return {"_meta": {"description": "28 pulses: 27 from 《瀕湖脈學》 (chapter headings carry the yin/yang class) + 疾 from 《診家正眼》. Pulse is an OPTIONAL self-reported input.",
                      "guidance": exam.PULSE_GUIDANCE, "exclusive_groups": exam.PULSE_EXCLUSIVE},
            "positions": exam.PULSE_POSITIONS, "pulses": pulses}


def build_constitutions() -> dict:
    return {"_meta": {"description": "Nine constitutions (王琦). Questionnaire items are intentionally NOT included (licensing, SOP D6). `susceptibility` = risk (0–2) per pathogenic qi.",
                      "standard": "中醫體質分類與判定 (ZYYXH/T157-2009), scoring rule in SOP §6.3"},
            "items": [{"id": c["id"], "name": {"zh-Hant": c["zh"], "en": c["en"]}, "features": c["features"], "prior_nature": c["prior_nature"],
                       "susceptibility": c["susceptibility"], **({"caution": c["caution"]} if "caution" in c else {}), "status": "draft"} for c in exam.CONSTITUTIONS]}


def build_red_flags() -> dict:
    return {"_meta": {"description": "Red-flag and scope lists (draft, must be physician-reviewed). Levels: A emergency, B see a doctor within 24 h, C out of intended scope.",
                      "flow": "In every profile the matching notice is shown and acknowledged and the flow then continues (see data/config/scope-profiles.json)."},
            "items": [{"id": i, "level": lv, "text": i18n(zh, en)} for i, lv, zh, en in exam.RED_FLAGS]}


def build_panel_schema() -> dict:
    return {"_meta": {"description": "Panel (盤面) schema. All values are deviations from the average healthy person (zero). See docs/wuxing-algorithm.md §9 and SOP §8."},
            "organs": {"zang": panel.ZANG, "fu": panel.FU, "element_of": panel.ORGAN_ELEMENT},
            "channels": {"qi": "−3 deficient … +3 excess", "blood": "−3 … +3", "yin": "−3 … +3", "yang": "−3 … +3", "stasis": "0 … 3 (qi stagnation)"},
            "liuxie": panel.LIUXIE, "products": panel.PRODUCTS,
            "location_organs": panel.LOCATION_ORGANS, "exterior_locations": panel.EXTERIOR_LOCATIONS,
            "nature_projection": panel.NATURE_PROJECTION, "derived": panel.DERIVED,
            "offsets": {"primary": "observed − 0 (deviation from the average healthy person; drives diagnosis)",
                        "secondary": "observed − reference panel (docs/wuxing-algorithm.md §9.5; context only)"}}


def build_susceptibility() -> dict:
    return {"_meta": {"description": "Constitution × pathogenic-qi susceptibility, combined with the season and the year's climate. status: draft teaching-level rule."},
            "season_evil": {"春": ["風"], "夏": ["暑", "火"], "長夏": ["濕"], "秋": ["燥"], "冬": ["寒"]},
            "formula": "susceptibility(c, t) = Σ_e risk[c][e] × exposure_e(t),  exposure_e = 1.0 if e is the season's qi, plus the reference-panel climate[e] (docs/wuxing-algorithm.md §9.4)",
            "risk": {c["id"]: c["susceptibility"] for c in exam.CONSTITUTIONS},
            "citations": ["suwen-004-2", "suwen-003-6", "suwen-003-7", "suwen-003-8", "suwen-003-9", "lingshu-046-1"],
            "note": "《靈樞·五變》「同時得病，其病各異」: the same exposure produces different disease according to constitution."}


def build_guidance() -> dict:
    return {"_meta": {"description": "Self-acupressure points and diet/lifestyle guidance per pattern (draft)."},
            "acupoints": {n: {"code": c, "meridian": m, "pregnancy_avoid": preg} for n, (c, m, preg) in sorted(treatment.ACUPOINTS.items())},
            "food_pregnancy_caution": treatment.FOOD_PREGNANCY_CAUTION, "general": treatment.GENERAL}


def build_yunqi(tables: dict) -> dict:
    """Merge the engine's tables with the 民病 excerpts of 《素問·氣交變大論》 parsed from the original."""
    text = read_lib("raw/neijing/suwen/suwen_069.txt")
    keys = [("木", "太過"), ("火", "太過"), ("土", "太過"), ("金", "太過"), ("水", "太過"), ("木", "不及"), ("火", "不及"), ("土", "不及"), ("金", "不及"), ("水", "不及")]
    excerpts = {}
    for idx, (el, kind) in enumerate(keys, start=1):
        m = re.search(rf"岁{el}{'太过' if kind == '太過' else '不及'}[^。]*。[^。]*。", text)
        assert m, (el, kind)
        excerpts[f"{el}{kind}"] = {"citation": f"suwen-069-{idx}", "excerpt": tw(m.group(0).replace("\n", ""))[:160]}
    return {"_meta": {"description": "Wuyun liuqi tables (exported from @tcm/wuxing) plus 民病 excerpts parsed from 《素問·氣交變大論》. Classical doctrine, disputed predictive power: used only as a bounded prior.",
                      "sources": ["suwen-066-1", "suwen-066-2", "suwen-067-1", "suwen-069-1"]},
            **tables["yunqi"], "min_bing_excerpts": excerpts}


def main() -> None:
    cit = json.loads((DATA / "citations.json").read_text(encoding="utf-8"))
    citation_ids = {c["id"] for c in cit["items"]}
    formula_ids = {f["id"] for f in FORMULAS}

    dump(DATA / "diagnosis" / "symptoms.json", build_symptoms())
    patterns, elements = build_patterns(formula_ids, citation_ids)
    dump(DATA / "diagnosis" / "patterns.json", patterns)
    dump(DATA / "diagnosis" / "pattern-elements.json", elements)
    dump(DATA / "diagnosis" / "tongue.json", build_tongue())
    dump(DATA / "diagnosis" / "pulse.json", build_pulse())
    dump(DATA / "diagnosis" / "constitutions.json", build_constitutions())
    dump(DATA / "diagnosis" / "red-flags.json", build_red_flags())
    dump(DATA / "diagnosis" / "panel-schema.json", build_panel_schema())
    dump(DATA / "wuxing" / "susceptibility.json", build_susceptibility())
    dump(DATA / "treatment" / "guidance.json", build_guidance())

    res = subprocess.run(["node", "scripts/kb/export_wuxing_tables.ts"], cwd=ROOT, capture_output=True, text=True, check=True)
    tables = json.loads(res.stdout)
    dump(DATA / "wuxing" / "ganzhi.json", {"_meta": {"description": "Stem/branch tables, hidden stems, 人元司令, solar terms. Exported from packages/wuxing (single source)."}, **tables["ganzhi"]})
    dump(DATA / "wuxing" / "yunqi.json", build_yunqi(tables))
    dump(DATA / "wuxing" / "engine-params.json", {"_meta": {"description": "Default engine and profile parameters (exported from packages/wuxing; the TypeScript is the source of truth). All [calibrate] values await practitioner calibration."}, **tables["params"]})
    print(f"diagnosis: {len(symptoms.SYMPTOMS)} symptoms, {len(patterns['items'])} patterns, {len(elements['items'])} pattern elements, "
          f"{len(exam.TONGUE_FEATURES)} tongue features, {len(exam.PULSES)} pulses, {len(exam.CONSTITUTIONS)} constitutions, {len(exam.RED_FLAGS)} red flags")


if __name__ == "__main__":
    main()

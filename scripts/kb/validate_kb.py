"""Integrity validation of data/*.json: references, vocabularies, numeric sanity. Exit code 1 on any error."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from .common import DATA
from .curated import panel as panel_cfg

ORGANS = set(panel_cfg.ZANG) | set(panel_cfg.FU)
CHANNELS = {"qi", "blood", "yin", "yang", "stasis"}
LIUXIE = set(panel_cfg.LIUXIE)
PRODUCTS = set(panel_cfg.PRODUCTS)


def load(rel: str):
    return json.loads((DATA / rel).read_text(encoding="utf-8"))


def valid_target(t: str) -> bool:
    if t == "bagang.exterior":
        return True
    kind, _, rest = t.partition(".")
    if kind == "liuxie":
        return rest in LIUXIE
    if kind == "product":
        return rest in PRODUCTS
    return t.split(".")[0] in ORGANS and t.split(".")[1] in CHANNELS if "." in t else False


def main() -> int:
    errors: list[str] = []
    err = errors.append

    cit = load("citations.json")
    cit_ids = {c["id"] for c in cit["items"]}
    if cit["_meta"]["unverified"]:
        err(f"unverified citations: {cit['_meta']['unverified']}")

    herbs = load("herbs/herbs.json")["items"]
    herb_ids = {h["id"] for h in herbs}
    index = load("herbs/herb-index.json")["index"]
    for name, hid in index.items():
        if hid not in herb_ids:
            err(f"herb-index {name} → missing {hid}")
    for h in herbs:
        for k in list(h["effects"]) + list(h["harms"]):
            if not valid_target(k):
                err(f"herb {h['id']}: invalid panel target {k}")
        for o in h["organs"]:
            if o not in ORGANS and o not in ("心包", "三焦"):
                err(f"herb {h['id']}: unknown organ {o!r}")
        if h["pregnancy"] not in ("avoid", "caution", "ok", "ok-unreviewed"):
            err(f"herb {h['id']}: bad pregnancy {h['pregnancy']}")

    formulas = load("formulas/formulas.json")["items"]
    formula_ids = {f["id"] for f in formulas}
    symptoms = load("diagnosis/symptoms.json")["items"]
    sym_ids = {s["id"] for s in symptoms}
    patterns = load("diagnosis/patterns.json")["items"]
    pattern_ids = {p["id"] for p in patterns}

    for f in formulas:
        if abs(sum(c["proportion"] for c in f["composition"]) - 1) > 1e-3:
            err(f"{f['id']}: proportions do not sum to 1")
        if abs(sum(c["effective_weight"] for c in f["composition"]) - 1) > 1e-3:
            err(f"{f['id']}: effective weights do not sum to 1")
        for c in f["composition"]:
            if c["herb"] not in herb_ids:
                err(f"{f['id']}: missing herb {c['herb']}")
            if c["role"] not in "君臣佐使":
                err(f"{f['id']}: bad role {c['role']}")
        if not any(c["role"] == "君" for c in f["composition"]):
            err(f"{f['id']}: no sovereign herb")
        for s in f["core_indications"]:
            if s not in sym_ids:
                err(f"{f['id']}: unknown core indication {s}")
        for pid in f["patterns"]:
            if pid not in pattern_ids:
                err(f"{f['id']}: unknown pattern {pid}")
            elif f["id"] not in next(p for p in patterns if p["id"] == pid)["formulas"]:
                err(f"{f['id']} lists pattern {pid} which does not list it back")
        for k in list(f["panel_effect"]) + list(f["panel_burden"]):
            if not valid_target(k):
                err(f"{f['id']}: invalid panel target {k}")
        for m in f["modifications"]:
            for s in m["when_symptoms"]:
                if s not in sym_ids:
                    err(f"{f['id']}/{m['id']}: unknown symptom {s}")
            for a in m["add"] + m["remove"]:
                if a["herb"] not in herb_ids:
                    err(f"{f['id']}/{m['id']}: missing herb {a['herb']}")
        for rc in f["rationale_citations"]:
            if rc not in cit_ids:
                err(f"{f['id']}: unknown citation {rc}")
        if f["tier"] not in "ABC":
            err(f"{f['id']}: bad tier")

    for p in patterns:
        for fid in p["formulas"]:
            if fid not in formula_ids:
                err(f"pattern {p['id']}: unknown formula {fid}")
            elif p["id"] not in next(f for f in formulas if f["id"] == fid)["patterns"]:
                err(f"pattern {p['id']} lists formula {fid} which does not list it back")
        for c in p["citations"]:
            if c not in cit_ids:
                err(f"pattern {p['id']}: unknown citation {c}")
        for k in p["panel_projection_per_degree"]:
            if not valid_target(k):
                err(f"pattern {p['id']}: invalid projection target {k}")
        if not p["required_any"]:
            err(f"pattern {p['id']}: no required_any")

    acu = load("treatment/guidance.json")["acupoints"]
    for p in patterns:
        for a in p["treatment"]["acupoints"]:
            if a not in acu:
                err(f"pattern {p['id']}: unknown acupoint {a}")

    rules = load("safety/rules.json")
    for r in rules["rules"]:
        if "citation" in r and r["citation"] not in cit_ids:
            err(f"rule {r['id']}: unknown citation {r['citation']}")

    scope = load("config/scope-profiles.json")
    dims, levels = scope["dimensions"], scope["levels"]
    for pname, prof in scope["profiles"].items():
        for dim, keys in dims.items():
            for k in keys:
                e = prof[dim].get(k)
                if e is None:
                    err(f"profile {pname}: missing {dim}.{k}")
                elif e["level"] not in levels or e["notice"] not in scope["notice_kinds"]:
                    err(f"profile {pname}: bad entry {dim}.{k}: {e}")
    dev, rel = scope["profiles"]["dev"], scope["profiles"]["release"]
    for dim, keys in dims.items():
        for k in keys:
            if dev[dim][k]["level"] != "L3":
                err(f"dev profile must open everything: {dim}.{k} is {dev[dim][k]['level']}")
            if dev[dim][k]["notice"] != rel[dim][k]["notice"] and rel[dim][k]["notice"] == "blocking_ack" and dev[dim][k]["notice"] != "blocking_ack":
                err(f"dev profile must keep the blocking notice for {dim}.{k}")
    if scope["resolution"]["flow"] != "continue":
        err("flow must be 'continue'")

    yunqi = load("wuxing/yunqi.json")
    if len(yunqi["min_bing_excerpts"]) != 10:
        err("yunqi: expected 10 民病 excerpts")
    for k, v in yunqi["min_bing_excerpts"].items():
        if v["citation"] not in cit_ids:
            err(f"yunqi {k}: unknown citation")

    herb_status = {}
    for h in herbs:
        herb_status[h["status"]] = herb_status.get(h["status"], 0) + 1
    print(f"validate: {len(herbs)} herbs {herb_status}, {len(formulas)} formulas, {len(patterns)} patterns, {len(symptoms)} symptoms, "
          f"{len(cit_ids)} citations, {len(rules['rules'])} safety rules")
    if errors:
        print(f"VALIDATION FAILED ({len(errors)}):")
        for e in errors:
            print(" -", e)
        return 1
    print("validate: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

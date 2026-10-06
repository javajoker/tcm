"""Scaffold of a new pattern (task PM-21, docs/post-mvp/design/library-expansion.md §9): the skeleton of everything an accepted candidate needs, so that an author starts from a valid shape.

    .venv/bin/python -m scripts.kb.new_pattern <id | review/candidates/<id>.yaml> [--out DIR]
    pnpm kb:new-pattern LG3

Reads the proposal (`review/candidates/<id>.yaml`, the file the dossier was made from) and writes, into `review/candidates/<id>/` (git-ignored: it is a work area, not data):

    pattern.entry.py.txt     the entry for `scripts/kb/curated/patterns.py`, weighted as proposed
    symptoms.txt             the lines of the new symptoms for `curated/symptoms.py`
    prose_en.txt, treatment.txt   the places of the English principle and tongue/pulse text, the foods, points and lifestyle
    admission.txt            the records of `curated/admission.py` the proposal gives (sources, red-flag boundary)
    golden.stub.json         a golden seed for `packages/engine/test/golden/` (its findings come from `pnpm golden:reseed --write`)
    vignettes.stub.json      the two vignettes row A11 asks for: one with a red flag, one gated by a population
    CHECKLIST.md             every row of the admission checklist with where to do it and the command that checks it

It writes nothing into the knowledge base: the author pastes, rebuilds (`.venv/bin/python -m scripts.kb.build_kb`) and runs `.venv/bin/python -m scripts.kb.admission --pairs` until every row holds. A new
pattern is never waived — it meets each row, or it does not enter.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from . import admission
from .common import ROOT
from scripts.review import dossier

GOLDEN = ROOT / "packages" / "engine" / "test" / "golden"

CHECKLIST = [
    ("A1", "identity, names, status", "the entry in `curated/patterns.py`; the English principle and tongue/pulse text in `curated/prose_en.py`", "`build_kb`"),
    ("A2", "two independent sources: a verified quotation and a textbook or modern source", "`curated/citations.py` (quotations, verified against `reference/`); `TEXTBOOK_SOURCES` in `curated/admission.py`", "`scripts.kb.admission`"),
    ("A3", "the evidence table: weights 1–3, required-any, against, panel projection, 證素 elements", "the entry (`weights`, `against`, `required`, `elements`); the panel projection comes from the elements", "`scripts.kb.admission`"),
    ("A4", "every weighted symptom can be asked", "`curated/questions.py` (an option in an existing question, or a new one) and `curated/symptoms.py` for new symptoms", "`scripts.kb.admission`, `test_question_bank`"),
    ("A5", "the typical patient ranks first, 20 points above every other pattern (or a recorded exception)", "the weights; `MARGIN_EXCEPTIONS` in `curated/admission.py` with its reason", "`scripts.kb.admission --pairs`"),
    ("A6", "three questions separate each pair under the margin", "`curated/questions.py`", "`scripts.kb.admission --pairs`"),
    ("A7", "tongue and pulse features; `NEEDS_EXAM` if the inquiry alone stays under the 40-point band", "the entry; `NEEDS_EXAM` in `curated/admission.py`; the golden seed must then include them", "`scripts.kb.admission`"),
    ("A8", "a tier-A formula, or a declaration that none is visible in a release", "`curated/formulas.py` (verified, K-14); `NO_RELEASE_FORMULA` in `curated/admission.py`", "`scripts.kb.admission`"),
    ("A9", "diet, points and lifestyle, each with a basis and a pregnancy flag", "`curated/treatment.py` (foods, points, lifestyle) and `curated/treatment_text.py` (English text)", "`build_kb`, `scripts.kb.admission`"),
    ("A10", "the red-flag boundary, from the physician", "`RED_FLAG_BOUNDARY` in `curated/admission.py`", "`scripts.kb.admission`"),
    ("A11", "a golden seed and two vignettes (red flag; population)", "`golden.stub.json` → `packages/engine/test/golden/`, then `pnpm golden:reseed --write`; `vignettes.stub.json` → `packages/engine/test/safety/`", "`pnpm test` (engine), `scripts.kb.admission`"),
    ("A12", "wording in both languages, glossary terms, no forbidden wording", "the symptom and question wording; `pnpm check:i18n` for the app strings", "`scripts.kb.validate_kb`, `pnpm check`"),
    ("A13", "review records for every area touched", "`review/records/` ([content review](../../../docs/content-review.md)); the review packs and this dossier are the material", "the review gate"),
]


def resolve(arg: str) -> Path:
    p = Path(arg)
    if p.suffix == ".yaml":
        return p
    return dossier.CANDIDATES / f"{arg}.yaml"


def next_golden_id() -> str:
    nums = [int(m.group(1)) for f in GOLDEN.glob("G-*.json") if (m := re.fullmatch(r"G-(\d+)\.json", f.name))]
    return f"G-{max(nums, default=0) + 1:04d}"


def pattern_entry(c: dict[str, Any]) -> str:
    n = dossier.naive_pattern(c)
    w = ", ".join(f"{s}={v}" for s, v in sorted(n["weights"].items(), key=lambda kv: (-kv[1], kv[0])))
    a = ", ".join(f"{s}={v}" for s, v in sorted(n["against"].items(), key=lambda kv: (-kv[1], kv[0])))
    req = ", ".join(json.dumps(s) for s in n["required_any"])
    cites = ", ".join(json.dumps(x) for x in (c.get("sources") or {}).get("citations") or [])
    formulas = ", ".join(json.dumps(x) for x in c.get("formulas") or [])
    return (f"    dict(id={json.dumps(c['id'])}, zh={json.dumps(c['name']['zh-Hant'], ensure_ascii=False)}, en={json.dumps(c['name']['en'], ensure_ascii=False)}, group={json.dumps(c['group'])},\n"
            f"         elements=[],  # TODO the 證素: (location, nature) pairs, e.g. (\"肺\", \"寒\") — the panel projection is applied to these\n"
            f"         principle={json.dumps(c.get('principle') or 'TODO', ensure_ascii=False)}, formulas=[{formulas}],\n"
            f"         weights=dict({w}),\n"
            f"         against=dict({a}),\n"
            f"         required=[{req}], cites=[{cites}],\n"
            f"         tongue_pulse=\"TODO\"),\n")


def symptom_lines(c: dict[str, Any]) -> str:
    lines = [f"{sid}|{v['zh-Hant']}|{v['en']}|{v.get('dimension', 'TODO')}" for sid, v in (c.get("new_symptoms") or {}).items()]
    return "\n".join(lines) + "\n" if lines else "# the proposal adds no symptom\n"


def prose_and_treatment(c: dict[str, Any]) -> tuple[str, str]:
    cid = c["id"]
    prose = (f"# curated/prose_en.py — the English principle, and the English tongue/pulse note, of each pattern (two dicts)\n"
             f"    {json.dumps(cid)}: {json.dumps(c.get('principle_en') or 'TODO', ensure_ascii=False)},          # principle (English)\n"
             f"    {json.dumps(cid)}: \"TODO\",          # tongue and pulse note (English)\n")
    treatment = (f"# curated/treatment.py — pattern id → (foods, acupoints, lifestyle). A new food also needs its stable id in FOOD_IDS (an address is a promise); a new point goes in ACUPOINTS.\n"
                 f"    {json.dumps(cid)}: ([\"TODO\"], [\"TODO\"], \"TODO\"),\n"
                 f"# curated/treatment_text.py — the English lifestyle line, the diet entries and the point texts (each with its basis and pregnancy flag)\n"
                 f"    {json.dumps(cid)}: \"TODO\",\n")
    return prose, treatment


def admission_records(c: dict[str, Any]) -> str:
    out = [f"# curated/admission.py — records of {c['id']} (a new pattern is never waived)"]
    for t in (c.get("sources") or {}).get("textbooks") or []:
        out.append(f"TEXTBOOK_SOURCES += [{{\"pattern\": {json.dumps(c['id'])}, \"path\": {json.dumps(t['path'])}, \"note\": {json.dumps(t.get('note', ''), ensure_ascii=False)}}}]")
    flags = c.get("red_flags") or []
    out.append(f"RED_FLAG_BOUNDARY += [{{\"pattern\": {json.dumps(c['id'])}, \"flags\": {json.dumps(flags)}, \"reason\": {json.dumps('' if flags else 'TODO: why no red flag has to stand in front of it')}}}]")
    out.append(f"# NEEDS_EXAM += [{json.dumps(c['id'])}]   # only if `scripts.kb.admission` says the inquiry alone stays under the 40-point band")
    out.append(f"# NO_RELEASE_FORMULA += [{{\"pattern\": {json.dumps(c['id'])}, \"reason\": \"…\"}}]   # only if no formula of it is tier A")
    return "\n".join(out) + "\n"


def golden_stub(c: dict[str, Any]) -> dict[str, Any]:
    return {"id": next_golden_id(), "title": f"typical patient of {c['id']} {c['name']['en']}", "authoredBy": "synthetic", "split": "tuning",
            "notes": "Infrastructure seed: the findings are the typical patient's answers in the adaptive inquiry (`pnpm golden:reseed --write` fills them in; set the sex to the one the pattern's questions need); the expectation is the pattern by construction. Not practitioner-agreed.",
            "input": {"subject": {"ageYears": 35, "sex": "male", "pregnancy": "not-applicable", "lactating": False, "medications": [], "allergies": [], "seriousChronicDisease": False}, "redFlags": [], "findings": {},
                      "context": {"course": "chronic"}},
            "expect": {"patterns": {"first": c["id"], "top3": [c["id"]]}, "formulas": {"top3": list(c.get("formulas") or [])[:3]}}}


def vignette_stubs(c: dict[str, Any]) -> dict[str, Any]:
    cid = c["id"]
    level_a = next((r for r in c.get("red_flags") or [] if r.startswith("RF_A_")), "RF_A_CHEST_PAIN")
    return {"vignettes": [
        {"id": f"RF-{cid}", "title": f"{cid} with a red flag in front of it: the emergency notice, nothing recommended in a release", "ref": "library-expansion design §4 A11",
         "input": {"interview": cid, "redFlags": [level_a]},
         "expect": {"both": {"notice": "blocking_ack", "notices": ["N-A"], "emergencyResources": True, "reasons": {"N-A": [level_a]}},
                    "release": {"level": "L0", "noFormulas": True, "noFoods": True, "noAcupoints": True}, "dev": {"level": "L3"}}},
        {"id": f"POP-{cid}-PREGNANT", "title": f"{cid} in pregnancy: blocking notice, L0 in release", "ref": "library-expansion design §4 A11",
         "input": {"interview": cid, "subject": {"sex": "female", "pregnancy": "yes"}},
         "expect": {"release": {"level": "L0", "notice": "blocking_ack", "notices": ["N-PREG"], "emergencyResources": False, "noFormulas": True, "noFoods": True, "noAcupoints": True},
                    "dev": {"level": "L3", "notice": "blocking_ack", "notices": ["N-PREG"]}}}]}


def checklist(c: dict[str, Any]) -> str:
    rows = ["| Row | What | Where | Checked by | Done |", "|---|---|---|---|---|", *(f"| {r} | {what} | {where} | {by} | [ ] |" for r, what, where, by in CHECKLIST)]
    return "\n".join([f"# Admission of `{c['id']}` {c['name']['en']}", "",
                      "Every row holds, or the pattern does not enter. A new pattern is never waived. Run `.venv/bin/python -m scripts.kb.build_kb` after each change and "
                      "`.venv/bin/python -m scripts.kb.admission --pairs` to see where the pattern stands; `pnpm check` and `pnpm test:kb` at the end.", "", *rows, "",
                      "Also: parity fixtures (`pnpm parity:export`), `data/README.md` counts, the SOP section by the clinical content owner, and the budgets (`node scripts/check-budgets.ts`).", ""])


def scaffold(path: Path, out: Path | None = None, lib: admission.Library | None = None) -> list[Path]:
    lib = lib or dossier.default_library()
    c = dossier.load_candidate(path)
    bad = dossier.problems(c, lib)
    if bad:
        raise ValueError(f"{path}: " + "; ".join(bad))
    d = out or (dossier.CANDIDATES / c["id"])
    d.mkdir(parents=True, exist_ok=True)
    prose, treatment = prose_and_treatment(c)
    files = {"pattern.entry.py.txt": pattern_entry(c), "symptoms.txt": symptom_lines(c), "prose_en.txt": prose, "treatment.txt": treatment, "admission.txt": admission_records(c),
             "golden.stub.json": json.dumps(golden_stub(c), ensure_ascii=False, indent=2) + "\n", "vignettes.stub.json": json.dumps(vignette_stubs(c), ensure_ascii=False, indent=2) + "\n",
             "CHECKLIST.md": checklist(c)}
    for name, text in files.items():
        (d / name).write_text(text, encoding="utf-8")
    return [d / n for n in files]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("candidate", help="a candidate id (review/candidates/<id>.yaml) or the path of its file")
    ap.add_argument("--out", type=Path, default=None)
    args = ap.parse_args(argv)
    try:
        written = scaffold(resolve(args.candidate), args.out)
    except (ValueError, FileNotFoundError) as e:
        print(f"new_pattern: {e}")
        return 1
    for p in written:
        print(f"new pattern: {p.relative_to(ROOT) if p.is_relative_to(ROOT) else p}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

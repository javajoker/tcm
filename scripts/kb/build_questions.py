"""Build data/diagnosis/questions.json (the adaptive-inquiry question bank) from curated/questions.py and the symptom registry."""
from __future__ import annotations

from collections import Counter

from .common import DATA, dump
from .curated import questions as qc
from .oracle import load


def option_ids(question: dict) -> list[dict]:
    seen: Counter = Counter()
    out = []
    for o in question["options"]:
        if o["none"]:
            base = "none"
        elif o["context"]:
            base = "-".join(str(v) for v in o["context"].values())
        else:
            base = o["symptoms"][0].removeprefix("S_").lower()
        seen[base] += 1
        out.append({"id": base if seen[base] == 1 else f"{base}_{seen[base]}", **o})
    return out


def build() -> dict:
    symptoms = {s["id"]: s for s in load("diagnosis/symptoms.json")["items"]}
    items = []
    for q in sorted(qc.QUESTIONS, key=lambda x: (x["order"], x["id"])):
        rec = {**q, "options": option_ids(q), "status": "draft"}
        # drop empty optionals so records stay minimal and schema-strict
        for k in ("requires", "follows", "hint"):
            if rec[k] is None:
                del rec[k]
        for o in rec["options"]:
            if o["context"] is None:
                del o["context"]
        items.append(rec)
    covered = {s["id"] for q in items for o in q["options"] for s in [{"id": x} for x in o["symptoms"]]}
    inquiry = [s for s in symptoms.values() if s["kind"] == "symptom"]
    return {
        "_meta": {"description": "Question bank for the adaptive inquiry (SOP §4.2, §4.8): plain-language prompts, options mapped to symptom ids, prerequisites, "
                                 "modules. Answering a question records selected symptoms as present and the others of that question as absent; skipping records unsure.",
                  "count": len(items), "core_count": sum(1 for q in items if q["core"]), "status": "draft",
                  "coverage": {"inquiry_symptoms": len(inquiry), "covered": len(covered & {s["id"] for s in inquiry}),
                               "uncovered": sorted(s["id"] for s in inquiry if s["id"] not in covered)},
                  "dimensions_core": sorted({q["dimension"] for q in items if q["core"]}, key=qc.DIMENSIONS_ORDER.index)},
        "modules": qc.MODULES,
        "items": items,
    }


def main() -> None:
    data = build()
    dump(DATA / "diagnosis" / "questions.json", data)
    m = data["_meta"]
    print(f"questions: {m['count']} ({m['core_count']} core), {m['coverage']['covered']}/{m['coverage']['inquiry_symptoms']} symptoms reachable, {len(data['modules'])} modules")


if __name__ == "__main__":
    main()

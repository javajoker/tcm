"""Build data/diagnosis/constitution-items.json from curated/constitution_items.py (K-08)."""
from __future__ import annotations

from .common import DATA, dump
from .curated import constitution_items as ci
from .schemas import SCHEMA_VERSION


def main() -> None:
    types = []
    for t in sorted(ci.TYPES, key=lambda x: x["order"]):
        items = [{"id": f"CI_{t['constitution'][2:]}_{n}", "text": i["text"], "reverse": i["reverse"]} for n, i in enumerate(t["items"], 1)]
        types.append({"constitution": t["constitution"], "description": t["description"], "items": items})
    dump(DATA / "diagnosis" / "constitution-items.json", {
        "_meta": {"description": "Own-written constitution questionnaire (SOP D6): nine types, 1–5 frequency scale. Scoring rule of the national standard (ZYYXH/T157-2009), wording is ours. Draft awaiting practitioner review.",
                  "schema": SCHEMA_VERSION, "status": "draft", "scoring": "converted = (raw - n) / (4 n) * 100 over the answered items of a type; reverse items score 6 - answer",
                  "count": sum(len(t["items"]) for t in types)},
        "prompt": ci.PROMPT, "scale": ci.SCALE, "types": types,
    })
    print(f"constitution items: {sum(len(t['items']) for t in types)} items in {len(types)} types")


if __name__ == "__main__":
    main()

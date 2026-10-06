"""Build data/review/admission.json from curated/admission.py (PM-21).

    .venv/bin/python -m scripts.kb.build_admission

The records are build-time only: the checklist (admission.py) reads them, the review pack and the dossier quote them, and nothing of them ships in the knowledge-base bundle.
"""
from __future__ import annotations

from .common import DATA, dump
from .curated import admission as a
from .schemas import SCHEMA_VERSION


def build() -> dict:
    return {
        "_meta": {"description": "What the admission checklist cannot derive from the other data: the original patterns, the waivers of their known gaps, declarations about a pattern, and recorded sources "
                                 "and red-flag boundaries (library-expansion design §4). Build-time only.",
                  "schema": SCHEMA_VERSION,
                  "waivers": len(a.WAIVERS)},
        "margin_exceptions": a.MARGIN_EXCEPTIONS,
        "needs_exam": a.NEEDS_EXAM,
        "no_release_formula": a.NO_RELEASE_FORMULA,
        "original": list(a.ORIGINAL),
        "red_flag_boundary": a.RED_FLAG_BOUNDARY,
        "textbook_sources": a.TEXTBOOK_SOURCES,
        "waivers": a.WAIVERS,
    }


def main() -> None:
    data = build()
    dump(DATA / "review" / "admission.json", data)
    print(f"admission: {len(data['original'])} original patterns, {len(data['waivers'])} waivers, {len(data['no_release_formula'])} declared without a release formula")


if __name__ == "__main__":
    main()

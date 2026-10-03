"""Build data/diagnosis/scoring-params.json from curated/params.py."""
from __future__ import annotations

from .common import DATA, dump
from .curated import params


def main() -> None:
    dump(DATA / "diagnosis" / "scoring-params.json", {
        "_meta": {"description": "Diagnosis engine parameters shared by the Python oracle (scripts/kb/oracle.py) and the TypeScript engine (@tcm/engine). "
                                 "All values are draft placeholders awaiting practitioner calibration (SOP D3).",
                  "schema": params.SCHEMA, "status": "draft",
                  "sources": {"severity, quality": "SOP §4.7, §9.2", "panel": "SOP §10", "reconcile": "SOP §11", "formula, tier": "SOP §12", "safety": "SOP §13.2",
                              "questionnaire": "SOP §4.8"}},
        **params.PARAMS,
    })
    print("params: data/diagnosis/scoring-params.json")


if __name__ == "__main__":
    main()

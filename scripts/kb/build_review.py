"""Compile review/records/*.yaml into data/review/records.json and mark what is reviewed (K-16).

    .venv/bin/python -m scripts.kb.build_review

Runs after every data builder (they regenerate each status from the curated tables, so content that changed after its review is already back to draft) and before validation.
Invalid records fail the build. With no records the output says so and nothing changes. The review targets outside data/ — the learning book, the course and the interface text
(PM-57) — are read from the repository and covered in records.json only; the book reader derives the book's status from it (packages/kb/node/book.ts).
"""
from __future__ import annotations

import sys
from pathlib import Path

from .common import DATA, ROOT, dump
from . import review

RECORDS = ROOT / "review" / "records"


def build(data_dir: Path = DATA, records_dir: Path = RECORDS, root: Path = ROOT) -> list[str]:
    """Write the compiled records and apply `reviewed`; returns the problems (empty = fine)."""
    data = review.load_data(data_dir)
    result = review.compile_records(review.load_records(records_dir), data, review.load_targets(root))
    for rel, content in review.apply_reviewed(data, result["reviewed_units"]).items():
        dump(data_dir / rel, content)
    dump(data_dir / "review" / "records.json", result["output"])
    return result["problems"]


def main() -> int:
    problems = build()
    out = review.json.loads((DATA / "review" / "records.json").read_text(encoding="utf-8"))
    print(f"review: {out['_meta']['count']} records, {len(out['reviewed'])} reviewed units, {len(out['stale'])} stale")
    for p in problems:
        print(f" - {p}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

"""Build the whole knowledge base into data/ and validate it.

    .venv/bin/python -m scripts.kb.build_kb

Order matters: params → citations → herbs → formulas → wuxing correspondences → diagnosis → policy → emergency → name fold → geo → questions → exclusions → orientation → review records → schemas → validation → pattern self-test.
"""
from __future__ import annotations

import sys

from . import build_citations, build_constitution_items, build_diagnosis, build_emergency, build_exclusions, build_formulas, build_geo, build_herbs, build_name_fold, build_orientation, build_params, build_policy, build_questions, build_review, build_schemas, build_wuxing, selftest_patterns, validate_kb


def main() -> int:
    build_params.main()
    build_citations.main()
    build_herbs.main()
    build_formulas.main()
    build_wuxing.main()
    build_diagnosis.main()
    build_policy.main()
    build_constitution_items.main()
    build_emergency.main()
    build_name_fold.main()
    build_geo.main()
    build_questions.main()
    build_exclusions.main()
    build_orientation.main()
    if build_review.main():
        return 1
    build_schemas.main()
    status = validate_kb.main()
    return status or selftest_patterns.main()


if __name__ == "__main__":
    sys.exit(main())

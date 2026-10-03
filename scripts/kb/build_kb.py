"""Build the whole knowledge base into data/ and validate it.

    .venv/bin/python -m scripts.kb.build_kb

Order matters: citations → herbs → formulas → wuxing correspondences → diagnosis → policy → validation → pattern self-test.
"""
from __future__ import annotations

import sys

from . import build_citations, build_diagnosis, build_formulas, build_herbs, build_policy, build_wuxing, selftest_patterns, validate_kb


def main() -> int:
    build_citations.main()
    build_herbs.main()
    build_formulas.main()
    build_wuxing.main()
    build_diagnosis.main()
    build_policy.main()
    status = validate_kb.main()
    return status or selftest_patterns.main()


if __name__ == "__main__":
    sys.exit(main())

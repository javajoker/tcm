"""The committed parity fixture is the oracle's current output (freshness check, tech spec §7.4)."""
from __future__ import annotations

import json
import unittest

from scripts.kb import export_parity_cases as ex


class ParityFixture(unittest.TestCase):
    def test_fixture_is_current(self):
        committed = json.loads(ex.OUT.read_text(encoding="utf-8"))
        fresh = json.loads(json.dumps(ex.build()))
        self.assertEqual(committed["_meta"], fresh["_meta"], "inputs changed: run `python -m scripts.kb.export_parity_cases` and commit the fixture")
        self.assertEqual(committed, fresh)

    def test_contains_the_worked_example_of_the_sop(self):
        case = next(c for c in json.loads(ex.OUT.read_text(encoding="utf-8"))["cases"] if c["id"] == "worked-example")
        self.assertAlmostEqual(case["expect"]["scores"]["SP1"], 55.8, delta=0.05)
        self.assertEqual(case["expect"]["formulas"][0]["id"], "F_SHENLING")


if __name__ == "__main__":
    unittest.main()

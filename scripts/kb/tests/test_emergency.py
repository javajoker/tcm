"""data/safety/emergency.json: regional numbers (K-09). A wrong or missing number is a safety incident, so the invariants are tested."""
from __future__ import annotations

import unittest

from scripts.kb import validate_kb
from scripts.kb.tests.test_integrity import validate_with

DATA = validate_kb.load("safety/emergency.json")
REGIONS = {r["id"]: r for r in DATA["regions"]}


class Emergency(unittest.TestCase):
    def test_the_default_is_taiwan_with_119_and_the_1925_support_line(self):
        self.assertEqual(DATA["_meta"]["default_region"], "TW")
        self.assertEqual([n["number"] for n in REGIONS["TW"]["emergency"]], ["119"])
        self.assertEqual([n["number"] for n in REGIONS["TW"]["crisis"]], ["1925"])

    def test_the_policy_table_is_reproduced(self):
        expected = {"HK": ["999"], "MO": ["999"], "CN": ["120", "110"], "JP": ["119"], "SG": ["995"], "US": ["911"], "CA": ["911"], "GB": ["999"], "EU": ["112"], "AU": ["000"]}
        for rid, numbers in expected.items():
            self.assertEqual([n["number"] for n in REGIONS[rid]["emergency"]], numbers, rid)
        self.assertEqual([n["number"] for n in REGIONS["US"]["crisis"]], ["988"])

    def test_the_fallback_region_lists_no_number(self):
        self.assertEqual(REGIONS["OTHER"]["emergency"], [])
        self.assertEqual(REGIONS["OTHER"]["crisis"], [])

    def test_nothing_is_marked_reviewed_before_a_regional_owner_verified_it(self):
        self.assertEqual(DATA["_meta"]["status"], "draft")
        for r in DATA["regions"]:
            self.assertNotEqual(r["status"], "reviewed", r["id"])

    def test_every_label_is_bilingual(self):
        for r in DATA["regions"]:
            for n in r["emergency"] + r["crisis"]:
                self.assertTrue(n["label"]["zh-Hant"] and n["label"]["en"], (r["id"], n["number"]))

    def test_the_validator_reports_damage(self):
        def problems(mutate):
            return validate_with({"safety/emergency.json": mutate})
        self.assertTrue(any("default_region" in p for p in problems(lambda d: d["_meta"].update({"default_region": "ZZ"}))))
        self.assertTrue(any("no emergency number" in p for p in problems(lambda d: d["regions"][0].update({"emergency": []}))))
        self.assertTrue(any("duplicate emergency region" in p for p in problems(lambda d: d["regions"].append(dict(d["regions"][0])))))
        self.assertTrue(any("OTHER" in p for p in problems(lambda d: d["regions"].pop())))


if __name__ == "__main__":
    unittest.main()

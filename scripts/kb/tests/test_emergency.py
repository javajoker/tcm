"""data/safety/emergency.json: regional numbers (K-09). A wrong or missing number is a safety incident, so the invariants are tested."""
from __future__ import annotations

import unittest

from scripts.kb import validate_kb
from scripts.kb.tests.test_integrity import validate_with

DATA = validate_kb.load("safety/emergency.json")
REGIONS = {r["id"]: r for r in DATA["regions"]}


class Emergency(unittest.TestCase):
    def test_taiwan_has_119_and_the_1925_support_line_and_there_is_no_default_region(self):
        self.assertNotIn("default_region", DATA["_meta"])
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
        self.assertTrue(any("no emergency number" in p for p in problems(lambda d: d["regions"][0].update({"emergency": []}))))
        self.assertTrue(any("duplicate emergency region" in p for p in problems(lambda d: d["regions"].append(dict(d["regions"][0])))))
        self.assertTrue(any("OTHER" in p for p in problems(lambda d: d["regions"].pop())))


class RegionPacks(unittest.TestCase):
    """A region is data: numbers, the time zones that preselect it, and a record of who verified it (docs/post-mvp/design/tap-tempo-and-regions.md §2)."""

    def test_every_region_but_the_fallback_has_zones_and_no_zone_belongs_to_two(self):
        seen: dict[str, str] = {}
        for r in DATA["regions"]:
            if r["id"] == "OTHER":
                self.assertEqual(r["timezones"], [])
                continue
            self.assertTrue(r["timezones"], r["id"])
            for z in r["timezones"]:
                self.assertNotIn(z, seen, f"{z}: {seen.get(z)} and {r['id']}")
                seen[z] = r["id"]
        self.assertEqual(REGIONS["TW"]["timezones"], ["Asia/Taipei"])
        self.assertIn("Australia/Sydney", REGIONS["AU"]["timezones"])

    def test_nothing_is_verified_yet_because_nobody_who_lives_there_has_verified_it(self):
        self.assertTrue(all("verification" not in r for r in DATA["regions"]))

    def test_the_validator_checks_zones_and_verifications(self):
        def problems(mutate):
            return validate_with({"safety/emergency.json": mutate})
        self.assertTrue(any("not an IANA time zone" in p for p in problems(lambda d: d["regions"][0]["timezones"].append("Mars/Olympus"))))
        self.assertTrue(any("selects both" in p for p in problems(lambda d: d["regions"][1]["timezones"].append("Asia/Taipei"))))
        self.assertTrue(any("no time zone" in p for p in problems(lambda d: d["regions"][1].update({"timezones": []}))))
        self.assertTrue(any("OTHER must not" in p for p in problems(lambda d: d["regions"][-1]["timezones"].append("UTC"))))
        ok = {"by": "regional owner", "at": "2026-09-01", "source": "official page", "scope": "both"}
        # a verification is its own fact: it does not touch the content-review status, which only review records can set
        self.assertEqual([p for p in problems(lambda d: d["regions"][0].update({"verification": ok})) if "emergency" in p], [])
        self.assertTrue(any("future" in p for p in problems(lambda d: d["regions"][0].update({"verification": {**ok, "at": "2999-01-01"}}))))
        self.assertTrue(any("no verifier" in p for p in problems(lambda d: d["regions"][0].update({"verification": {**ok, "by": " "}}))))
        self.assertTrue(any("not a date" in p for p in problems(lambda d: d["regions"][0].update({"verification": {**ok, "at": "2026-13-45"}}))))


if __name__ == "__main__":
    unittest.main()

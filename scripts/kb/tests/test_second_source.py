"""The second-source checks (K-14) agree with the formulas they are about."""
from __future__ import annotations

import unittest

from scripts.kb import oracle
from scripts.kb.curated.second_source import SECOND_SOURCE


class SecondSource(unittest.TestCase):
    def setUp(self):
        self.formulas = {f["id"]: f for f in oracle.load("formulas/formulas.json")["items"]}

    def test_each_entry_is_about_a_formula_that_the_source_book_check_left_partial(self):
        for fid in SECOND_SOURCE:
            with self.subTest(fid):
                self.assertIn(fid, self.formulas)
                self.assertGreater(len(self.formulas[fid]["verification"]["composition_check"]["missing"]), 0, "the second source is for formulas with herbs not found in the book")

    def test_found_and_not_found_cover_the_composition_exactly(self):
        for fid, ss in SECOND_SOURCE.items():
            with self.subTest(fid):
                names = {c["name"] for c in self.formulas[fid]["composition"]}
                self.assertEqual(set(ss["herbs_found"]) | set(ss["herbs_not_found"]), names | set(ss["herbs_not_found"]))
                self.assertTrue(set(ss["herbs_not_found"]) <= names)
                self.assertTrue(set(ss["herbs_found"]) <= names)
                self.assertTrue(names - set(ss["herbs_not_found"]) <= set(ss["herbs_found"]), "every herb is either found or listed as not found")

    def test_the_status_follows_the_entry(self):
        for fid, ss in SECOND_SOURCE.items():
            with self.subTest(fid):
                v = self.formulas[fid]["verification"]
                self.assertEqual(v["second_source"]["herbs_found"], ss["herbs_found"])
                self.assertEqual(v["composition_status"], "partially-verified" if ss["herbs_not_found"] else "verified-against-second-source")

    def test_a_partly_verified_formula_has_a_reason(self):
        for fid, f in self.formulas.items():
            if f["verification"]["composition_status"] == "partially-verified":
                with self.subTest(fid):
                    self.assertTrue(f["verification"].get("source_note") or f["verification"].get("second_source"), "a partial check says why")


if __name__ == "__main__":
    unittest.main()

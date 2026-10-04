"""data/diagnosis/constitution-items.json (K-08): own-written items, every constitution covered, the scoring rule documented and checkable."""
from __future__ import annotations

import unittest

from scripts.kb import validate_kb
from scripts.kb.tests.test_integrity import validate_with

DATA = validate_kb.load("diagnosis/constitution-items.json")
CONSTITUTIONS = validate_kb.load("diagnosis/constitutions.json")["items"]


class ConstitutionItems(unittest.TestCase):
    def test_every_constitution_has_between_four_and_five_items(self):
        self.assertEqual(sorted(t["constitution"] for t in DATA["types"]), sorted(c["id"] for c in CONSTITUTIONS))
        for t in DATA["types"]:
            self.assertIn(len(t["items"]), (4, 5), t["constitution"])
        self.assertEqual(DATA["_meta"]["count"], sum(len(t["items"]) for t in DATA["types"]))

    def test_the_scale_is_one_to_five_with_bilingual_labels(self):
        self.assertEqual([s["value"] for s in DATA["scale"]], [1, 2, 3, 4, 5])
        for s in DATA["scale"]:
            self.assertTrue(s["label"]["zh-Hant"] and s["label"]["en"])

    def test_item_ids_are_unique_and_follow_their_type(self):
        ids = [i["id"] for t in DATA["types"] for i in t["items"]]
        self.assertEqual(len(ids), len(set(ids)))
        for t in DATA["types"]:
            stem = t["constitution"][2:]
            for n, i in enumerate(t["items"], 1):
                self.assertEqual(i["id"], f"CI_{stem}_{n}")

    def test_only_the_balanced_type_uses_reverse_items_and_every_type_keeps_two_forward_ones(self):
        for t in DATA["types"]:
            forward = [i for i in t["items"] if not i["reverse"]]
            self.assertGreaterEqual(len(forward), 2, t["constitution"])
            if t["constitution"] != "C_PINGHE":
                self.assertEqual(len(forward), len(t["items"]), t["constitution"])

    def test_the_wording_is_ours_and_stays_a_draft(self):
        self.assertEqual(DATA["_meta"]["status"], "draft")
        self.assertIn("own-written", DATA["_meta"]["description"].lower())
        for t in DATA["types"]:
            for i in t["items"]:
                self.assertTrue(i["text"]["zh-Hant"] and i["text"]["en"])
                self.assertNotIn("your diagnosis", i["text"]["en"].lower())

    def test_the_validator_reports_damage(self):
        def problems(mutate):
            return validate_with({"diagnosis/constitution-items.json": mutate})
        self.assertTrue(any("exactly one entry per constitution" in p for p in problems(lambda d: d["types"][-1].update({"constitution": "C_QIXU"}))))
        self.assertTrue(any("scale" in p for p in problems(lambda d: d["scale"][0].update({"value": 7}))))
        self.assertTrue(any("_meta.count" in p for p in problems(lambda d: d["_meta"].update({"count": 1}))))
        self.assertTrue(any("duplicate constitution item id" in p for p in problems(lambda d: d["types"][1]["items"][0].update({"id": d["types"][0]["items"][0]["id"]}))))


if __name__ == "__main__":
    unittest.main()

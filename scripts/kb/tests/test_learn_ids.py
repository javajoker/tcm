"""The addresses of the Learn pages (PM-13): every diet entry and every glossary term has a stable ASCII id, and an id that has been published never changes."""
from __future__ import annotations

import copy
import json
import re
import unittest

from scripts.kb import validate_kb
from scripts.kb.curated import glossary, treatment
from scripts.kb.tests.test_integrity import validate_with

ID = re.compile(r"^[a-z][a-z0-9-]{0,63}$")
FOODS = validate_kb.load("treatment/guidance.json")["foods"]
TERMS = validate_kb.load("glossary.json")["items"]


class FoodIds(unittest.TestCase):
    def test_every_diet_entry_has_one_and_they_are_unique_ascii(self):
        self.assertEqual(set(treatment.FOOD_IDS), set(FOODS))
        ids = [f["id"] for f in FOODS.values()]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(ID.match(i) for i in ids), [i for i in ids if not ID.match(i)])
        self.assertEqual({name: f["id"] for name, f in FOODS.items()}, treatment.FOOD_IDS)

    def test_the_patterns_only_list_entries_that_have_one(self):
        listed = {f for foods, _a, _l in treatment.GUIDANCE.values() for f in foods}
        self.assertTrue(listed <= set(treatment.FOOD_IDS))

    def test_the_validator_reports_a_duplicate_or_a_bad_id(self):
        def problems(mutate):
            return validate_with({"treatment/guidance.json": mutate})
        def duplicate(d):
            names = list(d["foods"])
            d["foods"][names[1]]["id"] = d["foods"][names[0]]["id"]
        self.assertTrue(any("duplicate diet entry id" in p for p in problems(duplicate)))
        self.assertTrue(any("/id" in p and "does not match" in p for p in problems(lambda d: d["foods"][next(iter(d["foods"]))].update({"id": "Bad Id"}))), "the schema refuses it")


class GlossaryIds(unittest.TestCase):
    def test_every_term_has_a_unique_ascii_id(self):
        ids = [t["id"] for t in TERMS]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(ID.match(i) for i in ids))
        self.assertGreater(len(ids), 150)

    def test_the_slug_is_the_pinyin_without_tones(self):
        for pinyin, expected in [("yīn yáng", "yin-yang"), ("wǔ xíng", "wu-xing"), ("lǜ", "lu"), ("  huǒ ", "huo"), ("jīng luò (meridians)", "jing-luo-meridians"), ("", "")]:
            self.assertEqual(glossary.slug(pinyin), expected, pinyin)

    def test_a_published_id_never_changes_and_a_new_term_never_takes_one(self):
        items = [{"zh-Hant": t["zh-Hant"], "domain": t["domain"], "pinyin": t["pinyin"]} for t in TERMS]
        previous = {(t["zh-Hant"], t["domain"]): t["id"] for t in TERMS}
        again = copy.deepcopy(items)
        glossary.assign_ids(again, previous)
        self.assertEqual([i["id"] for i in again], [t["id"] for t in TERMS], "rebuilding gives the same ids")
        # a term added in the middle of the table, with a pinyin that an existing term already uses: it gets another id, and no existing term moves
        first = TERMS[0]
        added = {"zh-Hant": "新詞", "domain": "theory", "pinyin": first["pinyin"]}
        grown = [added, *copy.deepcopy(items)]
        glossary.assign_ids(grown, previous)
        self.assertEqual([g["id"] for g in grown[1:]], [t["id"] for t in TERMS])
        self.assertNotEqual(grown[0]["id"], first["id"])
        self.assertTrue(ID.match(grown[0]["id"]))
        # a third with the same pinyin and domain gets a number
        more = [{"zh-Hant": "又一詞", "domain": "theory", "pinyin": first["pinyin"]}, added, *copy.deepcopy(items)]
        glossary.assign_ids(more, previous)
        self.assertEqual(len({m["id"] for m in more}), len(more))

    def test_a_term_that_occurs_in_two_domains_keeps_both(self):
        fire = [t for t in TERMS if t["zh-Hant"] == "火"]
        self.assertGreaterEqual(len(fire), 2)
        self.assertEqual(len({t["id"] for t in fire}), len(fire))

    def test_the_validator_reports_a_duplicate_or_a_bad_id(self):
        def problems(mutate):
            return validate_with({"glossary.json": mutate})
        self.assertTrue(any("duplicate glossary id" in p for p in problems(lambda d: d["items"][1].update({"id": d["items"][0]["id"]}))))
        self.assertTrue(any("/id" in p and "does not match" in p for p in problems(lambda d: d["items"][0].update({"id": "Yin Yang"}))), "the schema refuses it")


if __name__ == "__main__":
    unittest.main()

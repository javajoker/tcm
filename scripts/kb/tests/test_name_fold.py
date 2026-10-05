"""data/safety/name-fold.json: the character fold the allergy rule compares names with (PM-33). A name whose character is missing from it is a name an allergy
typed in the other script cannot match, so the table is generated from the names and tested against them and against the Simplified display."""
from __future__ import annotations

import json
import unittest

from scripts.i18n import hans
from scripts.kb import build_name_fold, validate_kb
from scripts.kb.tests.test_integrity import validate_with

DATA = validate_kb.load("safety/name-fold.json")
TABLE = {chr(int(a, 16)): chr(int(b, 16)) for a, b in (p.split(":") for p in DATA["fold"])}
NAMES = build_name_fold.names()
DICTIONARY = hans.load_dictionary()


class NameFold(unittest.TestCase):
    def test_the_committed_table_is_what_the_names_need(self):
        self.assertEqual(TABLE, build_name_fold.fold_table(NAMES))
        self.assertEqual(DATA["_meta"]["count"], len(TABLE))
        self.assertGreater(len(TABLE), 100)

    def test_it_covers_every_name_the_allergy_rule_can_meet(self):
        self.assertGreater(len(NAMES), 500)
        for name in NAMES:
            for c in name:
                if build_name_fold._cjk(c) and hans.is_traditional_only(c):
                    self.assertIn(c, TABLE, f"{c} of {name}")

    def test_folding_a_name_gives_the_simplified_display_of_it_up_to_the_phrase_overrides(self):
        """The fold is character by character, the display is by word (乾薑 → 干姜, 豬苓 → 猪苓): where the fold and the display differ the person would see one form and the
        rule would compare another, so every such name is a deliberate, listed exception — today there are none among the herb and food names."""
        fold = lambda t: "".join(TABLE.get(c, c) for c in t)
        differing = sorted((n, fold(n), DICTIONARY[n]) for n in NAMES if n in DICTIONARY and fold(n) != DICTIONARY[n])
        self.assertEqual(differing, [])

    def test_a_character_folds_to_one_character_and_never_to_itself(self):
        self.assertEqual(len(set(DATA["fold"])), len(DATA["fold"]))
        self.assertEqual(len(TABLE), len(DATA["fold"]), "one entry per character")
        self.assertEqual(DATA["fold"], sorted(DATA["fold"], key=lambda p: int(p.split(":")[0], 16)))
        for a, b in TABLE.items():
            self.assertNotEqual(a, b)
        for c in "人脾肝心肺":
            self.assertNotIn(c, TABLE)
        self.assertEqual(TABLE["參"], "参")
        self.assertEqual(TABLE["乾"], "干")
        self.assertEqual(TABLE["薑"], "姜")

    def test_the_file_holds_no_chinese_text_so_the_display_dictionary_has_nothing_to_do_with_it(self):
        """A table for the matcher, not text for a reader: code points in hex. It must stay out of the display dictionary (and its character checks) altogether."""
        self.assertEqual([s for s, _ in hans._walk(DATA)], [])
        raw = (hans.DATA / "safety" / "name-fold.json").read_text(encoding="utf-8")
        self.assertTrue(raw.isascii())

    def test_the_validator_reports_a_stale_or_damaged_table(self):
        def problems(mutate):
            return validate_with({"safety/name-fold.json": mutate})

        def drop_first(d):
            d["fold"] = d["fold"][1:]
            d["_meta"]["count"] -= 1
        self.assertTrue(any("not what the names" in p for p in problems(drop_first)))
        self.assertTrue(any("count" in p for p in problems(lambda d: d["_meta"].update({"count": 3}))))
        self.assertTrue(any("folded twice" in p for p in problems(lambda d: d.update({"fold": d["fold"] + [d["fold"][0].split(":")[0] + ":0041"]}))))
        self.assertTrue(any("folds to itself" in p for p in problems(lambda d: d.update({"fold": d["fold"] + ["4EBA:4EBA"]}))))
        self.assertTrue(any("does not match" in p for p in problems(lambda d: d.update({"fold": d["fold"] + ["人:参"]}))), "only code points in hex are accepted")

    def test_it_is_deterministic(self):
        self.assertEqual(build_name_fold.fold_table(build_name_fold.names()), build_name_fold.fold_table(build_name_fold.names()))
        raw = (hans.DATA / "safety" / "name-fold.json").read_text(encoding="utf-8")
        self.assertEqual(json.loads(raw), DATA)


if __name__ == "__main__":
    unittest.main()

"""Glossary (K-12, i18n guide §2.1 and §4.4): source, alternatives and notes, the terms the UI copy needs, and agreement with the names the data files use."""
from __future__ import annotations

import unittest

from scripts.kb import validate_kb
from scripts.kb.curated import glossary as curated
from scripts.kb.tests.test_integrity import validate_with

TERMS = validate_kb.load("glossary.json")["items"]
BY_ZH = {(t["zh-Hant"], t["domain"]): t for t in TERMS}


class Glossary(unittest.TestCase):
    def test_every_row_has_a_source_alternatives_and_a_note_field(self):
        for t in TERMS:
            self.assertIn(t["source"], ("who-istm-2007", "textbook", "project"), t["zh-Hant"])
            self.assertIsInstance(t["alt"], list)
            self.assertTrue(t["note"] is None or t["note"].strip())
            self.assertEqual(t["status"], "needs-review", "nothing is reviewed before the linguistic reviewer has checked it against the standard")

    def test_the_source_follows_the_rule_of_the_table(self):
        for t in TERMS:
            expected = "project" if t["domain"] in curated.PROJECT_DOMAINS else "who-istm-2007" if t["zh-Hant"] in curated.WHO_ISTM else "textbook"
            self.assertEqual(t["source"], expected, t["zh-Hant"])
        self.assertEqual(BY_ZH[("脾", "zangfu")]["source"], "who-istm-2007")
        self.assertEqual(BY_ZH[("流年", "bazi")]["source"], "project")
        self.assertEqual(BY_ZH[("治病求本", "treatment")]["source"], "textbook")

    def test_every_term_in_the_who_list_exists(self):
        names = {t["zh-Hant"] for t in TERMS}
        self.assertEqual(sorted(curated.WHO_ISTM - names), [])

    def test_the_terms_the_ui_copy_needs_are_there_with_their_lay_alternatives(self):
        for zh in ["證型", "辨證", "氣血", "臟腑", "經絡", "穴位", "舌象", "寒熱", "虛實", "表裡", "中醫", "中醫師", "藥材", "惡寒", "畏寒", "自汗", "盜汗", "潮熱", "心悸", "痰濕", "濕熱", "苔乾"]:
            self.assertTrue(any(t["zh-Hant"] == zh for t in TERMS), zh)
        self.assertIn("pulse", next(t for t in TERMS if t["zh-Hant"] == "脈象")["alt"])
        self.assertIn("qualified practitioner", next(t for t in TERMS if t["zh-Hant"] == "中醫師")["alt"])

    def test_the_two_kinds_of_cold_stay_apart(self):
        self.assertEqual(BY_ZH[("惡寒", "diagnosis")]["en"], "aversion to cold")
        self.assertTrue(BY_ZH[("畏寒", "diagnosis")]["en"].startswith("cold intolerance"))
        self.assertIn("惡寒", BY_ZH[("畏寒", "diagnosis")]["note"])

    def test_the_validator_reports_a_glossary_that_disagrees_with_the_data(self):
        def rename(d):
            next(g for g in d["items"] if g["zh-Hant"] == "薄白苔")["en"] = "thin white fur"
        errs = validate_with({"glossary.json": rename})
        self.assertTrue(any("薄白苔" in e and "thin white fur" in e for e in errs), errs[:3])

    def test_the_validator_reports_alternatives_that_repeat_the_main_english_and_missing_tone_marks(self):
        def damage(d):
            g = next(x for x in d["items"] if x["zh-Hant"] == "氣虛")
            g["alt"] = ["Qi deficiency"]
            h = next(x for x in d["items"] if x["zh-Hant"] == "血虛")
            h["pinyin"] = "xue xu"
        errs = validate_with({"glossary.json": damage})
        self.assertTrue(any("alt repeats the main English" in e for e in errs), errs[:3])
        self.assertTrue(any("has no tone marks" in e for e in errs), errs[:3])

    def test_the_tongue_coating_is_called_a_coating_everywhere(self):
        syms = validate_kb.load("diagnosis/symptoms.json")["items"]
        self.assertEqual([s["id"] for s in syms if "coat" in s["en"].split() or s["en"].endswith(" coat")], [])
        self.assertEqual(next(s for s in syms if s["id"] == "T_COAT_DRY")["en"], "dry coating")


if __name__ == "__main__":
    unittest.main()

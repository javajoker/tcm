"""English prose of the knowledge base (K-13): complete, glossary-conformant, and checked by the validator."""
from __future__ import annotations

import re
import unittest

from scripts.kb import validate_kb
from scripts.kb.curated import prose_en
from scripts.kb.glossary_lint import english_forms, missing_terms, uses_form
from scripts.kb.tests.test_integrity import validate_with

PATTERNS = validate_kb.load("diagnosis/patterns.json")["items"]
FORMULAS = validate_kb.load("formulas/formulas.json")["items"]
GLOSSARY = validate_kb.load("glossary.json")["items"]


class Prose(unittest.TestCase):
    def test_every_pattern_and_formula_is_covered(self):
        self.assertEqual({p["id"] for p in PATTERNS}, set(prose_en.PATTERN_PRINCIPLE))
        self.assertEqual({p["id"] for p in PATTERNS}, set(prose_en.PATTERN_TONGUE_PULSE))
        self.assertEqual({f["id"] for f in FORMULAS}, set(prose_en.FORMULA))
        for f in FORMULAS:
            self.assertEqual(len(f["cautions"]), len(f["cautions_en"]), f["id"])

    def test_everything_is_a_machine_draft_until_the_linguistic_review(self):
        self.assertEqual({p["en_status"] for p in PATTERNS} | {f["en_status"] for f in FORMULAS}, {"machine-draft"})

    def test_no_chinese_in_the_english_and_no_empty_text(self):
        han = re.compile("[㐀-鿿]")
        texts = [p["principle_en"] for p in PATTERNS] + [p["tongue_pulse_note_en"] for p in PATTERNS]
        for f in FORMULAS:
            texts += [f["principle_en"], f["rationale_en"], *f["cautions_en"]]
        for t in texts:
            self.assertTrue(t.strip() and not han.search(t), t)

    def test_every_glossary_term_of_the_chinese_is_rendered_in_the_english(self):
        for p in PATTERNS:
            self.assertEqual(missing_terms(p["principle"], p["principle_en"], GLOSSARY), [], p["id"])
            self.assertEqual(missing_terms(p["tongue_pulse_note"], p["tongue_pulse_note_en"], GLOSSARY), [], p["id"])
        for f in FORMULAS:
            self.assertEqual(missing_terms(f["rationale_zh"], f["rationale_en"], GLOSSARY), [], f["id"])

    def test_the_lint_itself(self):
        yin = next(g for g in GLOSSARY if g["zh-Hant"] == "陰虛")
        self.assertIn("yin deficiency", english_forms(yin))
        self.assertTrue(uses_form("Not for Yin-deficiency heat", ["yin deficiency"]))
        self.assertTrue(uses_form("many phlegms", ["phlegm"]))
        self.assertFalse(uses_form("a yinish thing", ["yin"]))
        self.assertEqual([g["zh-Hant"] for g in missing_terms("陰虛火旺", "weak yin", GLOSSARY)], ["陰虛"])
        # the longer term consumes the shorter one inside it (五味子 is the herb, not the five flavours 五味)
        self.assertEqual(missing_terms("五味子", "schisandra", GLOSSARY), [])
        self.assertEqual([g["zh-Hant"] for g in missing_terms("五味子", "a herb", GLOSSARY)], ["五味子"])

    def test_the_validator_reports_damage(self):
        errs = validate_with({"formulas/formulas.json": lambda d: d["items"][0].update(rationale_en="x", cautions_en=d["items"][0]["cautions_en"][:1])})
        self.assertTrue(any("cautions in Chinese but 1 in English" in e for e in errs), errs[:4])
        sp1 = next(i for i, p in enumerate(PATTERNS) if p["id"] == "SP1")
        errs = validate_with({"diagnosis/patterns.json": lambda d: d["items"][sp1].update(tongue_pulse_note_en="Pale tongue with a white coating")})
        self.assertTrue(any("SP1 tongue_pulse_note" in e and "齒痕" in e for e in errs), errs[:3])
        errs = validate_with({"treatment/guidance.json": lambda d: d["general"].update(text_en=" ")})
        self.assertTrue(any("the English is empty" in e for e in errs), errs[:3])

    def test_the_dangerous_substitution_and_the_mercury_note_survive_translation(self):
        by = {f["id"]: f for f in FORMULAS}
        self.assertIn("aristolochic", " ".join(by["F_GANLU"]["cautions_en"]))
        self.assertIn("mercury", by["F_TIANWANG"]["rationale_en"])


if __name__ == "__main__":
    unittest.main()

"""The assistant's wording rules (scripts/i18n/ai_wording.py; docs/i18n-guide.md §5.1): built from the app's rules and the knowledge base's names, in three languages."""
import json
import re
import unittest

from scripts.i18n import ai_wording, hans

CONV = hans.Converter()


class TheRules(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.built = ai_wording.data(CONV)
        cls.wording = json.loads(ai_wording.WORDING.read_text(encoding="utf-8"))

    def test_every_rule_is_in_three_languages_and_compiles(self):
        by_id: dict[str, set[str]] = {}
        for r in self.built["rules"]:
            re.compile(r["pattern"], re.I)
            by_id.setdefault(r["id"], set()).add(r["lang"])
        expected = set(self.wording["assistant"]["reuse"]) | {r["id"] for r in self.wording["assistant"]["rules"]}
        self.assertEqual(set(by_id), expected)
        for rid, langs in by_id.items():
            self.assertEqual(langs, {"zh-Hant", "zh-Hans", "en"}, rid)

    def test_the_rules_left_out_are_the_ones_a_question_needs(self):
        """`judgement` would stop "does it get worse?", the app's `label` "are you often …?" and its `dose` "the amount of sweat"; the assistant has its own `label` and `dose`."""
        reuse = self.wording["assistant"]["reuse"]
        self.assertNotIn("judgement", reuse)
        self.assertNotIn("label", reuse)
        self.assertNotIn("dose", reuse)
        app_label = next(r["pattern"] for r in self.wording["rules"] if r["id"] == "label" and r["lang"] == "zh-Hant")
        own_label = next(r["pattern"] for r in self.built["rules"] if r["id"] == "label" and r["lang"] == "zh-Hant")
        self.assertTrue(re.search(app_label, "你是不是常覺得累？"))
        self.assertIsNone(re.search(own_label, "你是不是常覺得累？"))
        self.assertTrue(re.search(own_label, "你是陽虛體質。"))

    def test_the_simplified_patterns_are_simplified(self):
        for r in self.built["rules"]:
            if r["lang"] == "zh-Hans":
                self.assertEqual(hans.purity_hits(r["pattern"]), [], r["id"])
        self.assertEqual([n for n in self.built["names"]["zh-Hans"] if hans.purity_hits(n)], [])

    def test_the_app_s_own_questions_pass_every_rule(self):
        zh, en = ai_wording.clinical_wording()
        dictionary = hans.load_dictionary()
        texts = {"zh-Hant": zh, "zh-Hans": [dictionary[t] for t in zh], "en": en}
        hits = [(r["id"], t) for r in self.built["rules"] for t in texts[r["lang"]] if re.search(r["pattern"], t, re.I)]
        self.assertEqual(hits, [])

    def test_the_names_are_the_knowledge_base_s_and_none_is_an_ordinary_word_of_the_app(self):
        zh, en = ai_wording.kb_names()
        names = self.built["names"]
        self.assertGreater(len(names["zh-Hant"]), 700)
        self.assertLessEqual(set(zh), set(names["zh-Hant"]) | {e["name"] for e in self.built["excluded"]})
        for n in ("桂枝湯", "人參", "脾氣虛", "風寒束表", "太陽傷寒", "平和質"):
            self.assertIn(n, names["zh-Hant"])
        self.assertIn("Cinnamon Twig Decoction", names["en"])
        self.assertIn("Mahuang Tang", names["en"], "the English name and the name in its brackets are both kept")
        self.assertIn("人参", names["zh-Hans"], "a Simplified name that differs from the Traditional is listed")
        self.assertNotIn("桂枝汤", names["zh-Hant"])
        zh_text, _ = ai_wording.clinical_wording()
        for n in names["zh-Hant"]:
            self.assertFalse(any(n in t for t in zh_text), n)
        self.assertLessEqual(set(en), set(names["en"]) | {e["name"] for e in self.built["excluded"]})


if __name__ == "__main__":
    unittest.main()

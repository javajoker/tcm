"""The question bank can elicit what the patterns need: for every pattern's typical patient every symptom is reachable by the bank (K-05)."""
from __future__ import annotations

import unittest

from scripts.kb import admission, oracle
from scripts.kb.admission import reachable
from scripts.kb.selftest_patterns import typical_patient


class QuestionBank(unittest.TestCase):
    def setUp(self):
        self.bank = oracle.load("diagnosis/questions.json")["items"]
        self.patterns = oracle.load("diagnosis/patterns.json")["items"]

    def test_every_typical_patient_can_be_described(self):
        for p in self.patterns:
            with self.subTest(p["id"]):
                patient = {s for s in typical_patient(p) if s.startswith("S_")}
                missing = patient - reachable(self.bank, patient)
                self.assertEqual(missing, set(), f"{p['id']}: symptoms the bank cannot reach for its typical patient")

    def test_every_weighted_symptom_is_reachable_given_the_other_typical_symptoms(self):
        for p in self.patterns:
            with self.subTest(p["id"]):
                patient = {s for s in typical_patient(p) if s.startswith("S_")}
                weighted = {s for s in list(p["weights"]) + list(p["against"]) if s.startswith("S_")}
                self.assertEqual(weighted - reachable(self.bank, patient | weighted), set())

    def test_closest_confusable_pairs_have_discriminating_questions(self):
        """K-07: for each pair the pattern self-test finds closest, at least three questions offer a symptom that weighs at least two points
        differently for the two patterns, and each is asked when a symptom the pair shares is present (a core question or a follow-up trigger).
        The first three pairs were the closest when K-07 was written; the others are listed by the next test."""
        lib = admission.library(oracle.load)
        for a, b in (("EX2", "EX4"), ("LG1", "EX4"), ("HT2", "KD1")):
            found = admission.discriminating(lib, a, b)
            with self.subTest(f"{a} vs {b}"):
                self.assertGreaterEqual(len(found), 3, f"{a} vs {b}: only {found}")

    def test_every_pair_under_the_margin_has_discriminating_questions(self):
        """PM-21: the same rule for every pair the checklist finds under the 20-point margin, not only the closest."""
        lib = admission.library(oracle.load)
        for a, b in admission.close_pairs(admission.margins(lib)):
            found = admission.discriminating(lib, a, b)
            with self.subTest(f"{a} vs {b}"):
                self.assertGreaterEqual(len(found), admission.MIN_DISCRIMINATING, f"{a} vs {b}: only {found}")

    def test_core_questions_stay_within_the_budget(self):
        core = [q for q in self.bank if q["core"]]
        self.assertLessEqual(len(core), 30)
        self.assertLessEqual(len(self.bank), oracle.params()["questionnaire"]["max_questions"])


if __name__ == "__main__":
    unittest.main()

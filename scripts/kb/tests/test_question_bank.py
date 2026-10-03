"""The question bank can elicit what the patterns need: for every pattern's typical patient every symptom is reachable by the bank (K-05)."""
from __future__ import annotations

import unittest

from scripts.kb import oracle
from scripts.kb.selftest_patterns import typical_patient


def reachable(bank: list[dict], present: set[str]) -> set[str]:
    """Symptoms a patient with `present` symptoms can report through the bank (core questions + follow-ups whose trigger is present)."""
    sex = "female" if any(s.startswith("S_MENSES") or s in ("S_DYSMENORRHEA", "S_LEUKORRHEA_YELLOW", "S_BREAST_DISTENSION") for s in present) else \
        "male" if "S_SEMINAL_EMISSION" in present else "female"
    out: set[str] = set()
    for q in bank:
        req = q.get("requires") or {}
        if req.get("sex") and req["sex"] != sex:
            continue
        if "follows" in q and not (set(q["follows"]) & present):
            continue
        if not q["core"] and "follows" not in q and "requires" not in q:
            continue
        out |= {s for o in q["options"] for s in o["symptoms"]}
    return out


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

    def test_core_questions_stay_within_the_budget(self):
        core = [q for q in self.bank if q["core"]]
        self.assertLessEqual(len(core), 30)
        self.assertLessEqual(len(self.bank), oracle.params()["questionnaire"]["max_questions"])


if __name__ == "__main__":
    unittest.main()

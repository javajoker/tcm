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

    def test_closest_confusable_pairs_have_discriminating_questions(self):
        """K-07: for each pair the pattern self-test finds closest, at least three questions offer a symptom that weighs at least two points
        differently for the two patterns, and each is asked when a symptom the pair shares is present (a core question or a follow-up trigger)."""
        by_id = {p["id"]: p for p in self.patterns}

        def signed(p: dict, s: str) -> float:
            return p["weights"].get(s, 0) - p["against"].get(s, 0)

        for a, b in (("EX2", "EX4"), ("LG1", "EX4"), ("HT2", "KD1")):
            pa, pb = by_id[a], by_id[b]
            shared = {s for s in set(typical_patient(pa)) & set(typical_patient(pb)) if s.startswith("S_")}
            discriminating = [
                q["id"] for q in self.bank
                if (q["core"] or set(q.get("follows", [])) & shared)
                and any(abs(signed(pa, s) - signed(pb, s)) >= 2 for o in q["options"] for s in o["symptoms"])
            ]
            with self.subTest(f"{a} vs {b}"):
                self.assertGreaterEqual(len(discriminating), 3, f"{a} vs {b}: only {discriminating}")

    def test_core_questions_stay_within_the_budget(self):
        core = [q for q in self.bank if q["core"]]
        self.assertLessEqual(len(core), 30)
        self.assertLessEqual(len(self.bank), oracle.params()["questionnaire"]["max_questions"])


if __name__ == "__main__":
    unittest.main()

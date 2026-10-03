"""validate_kb.validate() must pass on the real data and report each kind of corruption (K-03)."""
from __future__ import annotations

import copy
import unittest

from scripts.kb import validate_kb


def validate_with(mutations: dict, check_sources: bool = False) -> list[str]:
    """Run the validator on the real data with `mutations` = {rel: fn(data)} applied to a deep copy."""
    cache: dict[str, dict] = {}

    def load(rel: str) -> dict:
        if rel not in cache:
            data = copy.deepcopy(validate_kb.load(rel))
            if rel in mutations:
                mutations[rel](data)
            cache[rel] = data
        return cache[rel]

    return validate_kb.validate(load, check_sources=check_sources)


class RealData(unittest.TestCase):
    def test_the_shipped_data_is_valid(self):
        self.assertEqual(validate_with({}, check_sources=True), [])


class Corruptions(unittest.TestCase):
    def assertReported(self, mutations: dict, fragment: str):
        problems = validate_with(mutations)
        self.assertTrue(any(fragment in p for p in problems), f"expected a problem containing {fragment!r}, got {problems[:4]}")

    def test_unknown_symptom_in_pattern_weights(self):
        self.assertReported({"diagnosis/patterns.json": lambda d: d["items"][0]["weights"].update({"S_DOES_NOT_EXIST": 1})}, "unknown symptom S_DOES_NOT_EXIST")

    def test_required_any_without_weight(self):
        def m(d):
            p = d["items"][0]
            p["required_any"] = ["S_FATIGUE"] if "S_FATIGUE" not in p["weights"] else ["S_NASAL_CONGESTION"]
            p["weights"].pop(p["required_any"][0], None)
        self.assertReported({"diagnosis/patterns.json": m}, "has no weight")

    def test_max_score_mismatch(self):
        self.assertReported({"diagnosis/patterns.json": lambda d: d["items"][0].update(max_score=d["items"][0]["max_score"] + 1)}, "max_score")

    def test_broken_pattern_formula_link(self):
        self.assertReported({"diagnosis/patterns.json": lambda d: d["items"][0]["formulas"].append("F_SIJUNZI")}, "does not list it back")

    def test_broken_pattern_element_link(self):
        self.assertReported({"diagnosis/pattern-elements.json": lambda d: d["items"][0]["patterns"].clear() or d["items"][0]["patterns"].append("SP1")},
                            "does not list it back")

    def test_formula_proportions(self):
        self.assertReported({"formulas/formulas.json": lambda d: d["items"][0]["composition"][0].update(proportion=0.9)}, "proportions do not sum to 1")

    def test_formula_role_weight_must_match_params(self):
        self.assertReported({"formulas/formulas.json": lambda d: d["items"][0]["composition"][0].update(role_weight=0.5)}, "role weight")

    def test_stored_tier_is_recomputed_from_the_herbs(self):
        def m(d):
            f = next(x for x in d["items"] if x["tier"] == "A")
            f["tier"] = "C"
        self.assertReported({"formulas/formulas.json": m}, "stored tier")

    def test_stored_pregnancy_is_recomputed(self):
        def m(d):
            f = next(x for x in d["items"] if x["pregnancy"] != "avoid")
            f["pregnancy"] = "avoid"
        self.assertReported({"formulas/formulas.json": m}, "stored pregnancy")

    def test_duplicate_ids_and_names(self):
        self.assertReported({"diagnosis/symptoms.json": lambda d: d["items"].append(copy.deepcopy(d["items"][0]))}, "duplicate symptom id")
        def dup_herb(d):
            twin = copy.deepcopy(d["items"][1])
            twin["id"] = "herb-zz_twin"
            twin["name"] = copy.deepcopy(d["items"][0]["name"])
            d["items"].append(twin)
        self.assertReported({"herbs/herbs.json": dup_herb}, "duplicate herb name")

    def test_herb_not_in_the_index(self):
        self.assertReported({"herbs/herb-index.json": lambda d: d["index"].pop(next(iter(d["index"])))}, "is not in the herb index")

    def test_tongue_symptoms_must_match_the_tongue_file(self):
        self.assertReported({"diagnosis/tongue.json": lambda d: d["features"].pop()}, "tongue.json features")

    def test_pulse_exclusive_group_unknown_pulse(self):
        self.assertReported({"diagnosis/pulse.json": lambda d: d["_meta"]["exclusive_groups"].append(["P_FLOAT", "P_NOPE"])}, "unknown pulse P_NOPE")

    def test_pulse_quality_must_equal_params(self):
        self.assertReported({"diagnosis/pulse.json": lambda d: d["_meta"]["guidance"].update(quality_coefficient=0.9)}, "differs from scoring-params")

    def test_profile_pulse_coefficient_must_equal_params(self):
        self.assertReported({"config/scope-profiles.json": lambda d: d["profiles"]["release"]["tongue_pulse"].update(pulse_quality_coefficient=0.3)}, "pulse_quality_coefficient")

    def test_dev_profile_must_open_everything_and_keep_notices(self):
        self.assertReported({"config/scope-profiles.json": lambda d: d["profiles"]["dev"]["population"]["adult"].update(level="L1")}, "dev profile must open everything")
        self.assertReported({"config/scope-profiles.json": lambda d: d["profiles"]["dev"]["population"]["pregnant"].update(notice="none")}, "must keep the blocking notice")

    def test_rule_vocabulary(self):
        self.assertReported({"safety/rules.json": lambda d: d["rules"][0]["applies_to"].update(population=["martian"])}, "unknown population")
        self.assertReported({"safety/rules.json": lambda d: d["rules"][0]["target"].clear() or d["rules"][0]["target"].update(herb_interaction="no-such-class")}, "matches no herb")

    def test_pregnancy_acupoint_registry_agreement(self):
        self.assertReported({"safety/rules.json": lambda d: d["pregnancy_acupoints"].pop()}, "missing from safety/rules.json")
        self.assertReported({"treatment/guidance.json": lambda d: d["acupoints"]["合谷"].update(pregnancy_avoid=False)}, "not flagged pregnancy_avoid")

    def test_unknown_citation(self):
        self.assertReported({"diagnosis/patterns.json": lambda d: d["items"][0]["citations"].append("no-such-quote")}, "unknown citation")

    def test_unverified_citation(self):
        self.assertReported({"citations.json": lambda d: d["items"][0].update(verified=False)}, "verified")

    def test_question_with_unknown_symptom(self):
        self.assertReported({"diagnosis/questions.json": lambda d: d["items"][0]["options"][0]["symptoms"].append("S_NOPE")}, "unknown symptom S_NOPE")

    def test_uncovered_symptom(self):
        def m(d):
            sym = d["items"][0]["options"][0]["symptoms"].pop()
            d["_meta"]["coverage"]["uncovered"] = [sym]
        self.assertReported({"diagnosis/questions.json": m}, "not reachable from any question")

    def test_question_structure_rules(self):
        self.assertReported({"diagnosis/questions.json": lambda d: d["items"][0]["graded"].append("S_FATIGUE")}, "graded symptoms must be options")
        self.assertReported({"diagnosis/questions.json": lambda d: d["items"][0]["exclusive_groups"].append(["S_FATIGUE", "S_EDEMA"])}, "exclusive group")
        self.assertReported({"diagnosis/questions.json": lambda d: next(o for o in d["items"][0]["options"] if o["none"]).update(none=False, symptoms=["S_EDEMA"])},
                            "exactly one 'none of these'")
        self.assertReported({"diagnosis/questions.json": lambda d: d["items"][0].update(source="guided")}, "only face-skin")
        self.assertReported({"diagnosis/questions.json": lambda d: d["items"][0]["modules"].append("no-such-module")}, "schema violation")

    def test_core_dimension_coverage(self):
        def m(d):
            for q in d["items"]:
                if q["dimension"] == "sweat":
                    q["core"] = False
                    q["follows"] = ["S_FEVER"]
            d["_meta"]["core_count"] -= 1
        self.assertReported({"diagnosis/questions.json": m}, "no core question for the SOP dimension sweat")

    def test_non_core_question_needs_a_condition(self):
        def m(d):
            q = next(x for x in d["items"] if not x["core"] and "follows" in x)
            del q["follows"]
        self.assertReported({"diagnosis/questions.json": m}, "needs `follows` or `requires`")

    def test_orthography_variant_outside_quotations(self):
        self.assertReported({"herbs/herbs.json": lambda d: d["items"][0]["functions"].append("清利溼熱")}, "溼 found outside quotations")

    def test_orthography_variant_is_allowed_in_quotations(self):
        def m(d):
            d["items"][0]["quote_zh_hant"] = "秋傷於溼"
        problems = validate_with({"citations.json": m})
        self.assertFalse(any("溼" in p for p in problems), problems)

    def test_scoring_params_ordering(self):
        self.assertReported({"diagnosis/scoring-params.json": lambda d: d["pattern"]["bands"].update(high=10)}, "pattern bands")
        self.assertReported({"diagnosis/scoring-params.json": lambda d: d["formula"]["role_weights"].update(使=2.0)}, "role weights")


if __name__ == "__main__":
    unittest.main()

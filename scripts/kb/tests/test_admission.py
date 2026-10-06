"""The admission checklist (PM-21, library-expansion design §4, §12): each machine row fails on a seeded violation, a new pattern is never waived, and a waiver or declaration that is not true fails."""
from __future__ import annotations

import copy
import json
import unittest

from scripts.kb import admission, validate_kb
from scripts.kb.selftest_patterns import typical_patient


def library(mutations: dict | None = None, **kw) -> admission.Library:
    """The real library with `mutations` = {rel: fn(data)} applied to deep copies (the same device as the validator's tests)."""
    cache: dict[str, dict] = {}

    def load(rel: str) -> dict:
        if rel not in cache:
            data = copy.deepcopy(validate_kb.load(rel))
            if mutations and rel in mutations:
                mutations[rel](data)
            cache[rel] = data
        return cache[rel]

    return admission.library(load, **kw)


def messages(lib: admission.Library, row: str, pattern: str, status: str = "fail") -> list[str]:
    return [f.message for f in admission.check(lib) if f.row == row and f.pattern == pattern and f.status == status]


def add_pattern(new_id: str, like: str, change=None):
    """A mutation that appends a copy of the pattern `like` as `new_id`, changed by `change(pattern)`."""
    def m(d: dict) -> None:
        p = copy.deepcopy(next(x for x in d["items"] if x["id"] == like))
        p["id"] = new_id
        p["formulas"] = []
        p["elements"] = []
        if change:
            change(p)
        d["items"].append(p)
    return m


class TheRealLibrary(unittest.TestCase):
    def test_no_failures_and_every_known_gap_is_named(self):
        lib = library()
        findings = admission.check(lib)
        self.assertEqual(admission.failures(findings), [])
        waived = {(f.row, f.pattern) for f in findings if f.status == "waived"}
        for w in lib.records["waivers"]:
            for pid in w["patterns"]:
                self.assertIn((w["row"], pid), waived, "a waiver that waives nothing")

    def test_the_original_library_is_what_the_records_say_it_is(self):
        lib = library()
        self.assertEqual(sorted(lib.original), sorted(p["id"] for p in lib.patterns))

    def test_the_report_says_where_each_pattern_stands(self):
        lib = library()
        text = admission.report(lib, admission.check(lib))
        self.assertIn("23 patterns · 0 failures", text)
        for row in admission.ROWS:
            self.assertIn(row, text)

    def test_the_close_pairs_and_what_separates_them(self):
        lib = library()
        m = admission.margins(lib)
        self.assertEqual(admission.close_pairs(m), [("HT2", "KD1")])
        self.assertGreaterEqual(len(admission.discriminating(lib, "HT2", "KD1")), admission.MIN_DISCRIMINATING)
        self.assertIn("HT2 / KD1", admission.pair_report(lib))

    def test_the_four_patterns_that_need_the_tongue_and_the_pulse_are_declared(self):
        lib = library()
        self.assertEqual(sorted(p["id"] for p in lib.patterns if admission.needs_exam(lib, p)), sorted(lib.records["needs_exam"]))


class ANewPatternMeetsEveryRow(unittest.TestCase):
    """A copy of an existing pattern, as a candidate would first be written: it is not waived, so every gap is a failure."""

    def setUp(self):
        self.lib = library({"diagnosis/patterns.json": add_pattern("LG3", "SP1")})
        self.found = {(f.row, f.status) for f in admission.check(self.lib) if f.pattern == "LG3"}

    def test_sources_boundary_and_tests_are_missing(self):
        for row in ("A2", "A10", "A11"):
            self.assertIn((row, "fail"), self.found, row)

    def test_it_does_not_rank_above_the_pattern_it_copies(self):
        self.assertTrue(any("does not rank above SP1" in m for m in messages(self.lib, "A5", "LG3")))

    def test_it_is_close_to_its_twin_with_nothing_to_tell_them_apart(self):
        self.assertTrue(any("close to SP1" in m and "only 0 questions" in m for m in messages(self.lib, "A6", "LG3")))

    def test_it_has_no_formula_and_says_nothing_about_it(self):
        self.assertTrue(any("no tier-A formula" in m for m in messages(self.lib, "A8", "LG3")))

    def test_nothing_of_it_is_waived(self):
        self.assertFalse([f for f in admission.check(self.lib) if f.pattern == "LG3" and f.status == "waived"])

    def test_a_waiver_for_it_is_itself_a_failure(self):
        def m(d: dict) -> None:
            d["waivers"].append({"row": "A2", "patterns": ["LG3"], "reason": "later"})
        lib = library({"diagnosis/patterns.json": add_pattern("LG3", "SP1"), "review/admission.json": m})
        self.assertTrue(any("only a pattern of the original library can be waived" in m for m in messages(lib, "A2", "LG3")))

    def test_the_build_fails_on_it(self):
        problems = validate_kb.validate(lambda rel: copy.deepcopy(validate_kb.load(rel)) if rel != "diagnosis/patterns.json" else _with(add_pattern("LG3", "SP1")), check_sources=False)
        self.assertTrue(any(p.startswith("admission A2 LG3:") for p in problems), problems[:5])


def _with(mutation) -> dict:
    d = copy.deepcopy(validate_kb.load("diagnosis/patterns.json"))
    mutation(d)
    return d


class Waivers(unittest.TestCase):
    def test_a_waiver_that_is_no_longer_needed_fails(self):
        # SP1 has a verified quotation; a recorded textbook source completes row A2 for it, so its waiver of A2 has nothing left to waive
        def m(d: dict) -> None:
            d["textbook_sources"].append({"pattern": "SP1", "path": "reference/README.md", "note": "a textbook"})
        lib = library({"review/admission.json": m})
        self.assertTrue(any("no longer needed" in x for x in messages(lib, "A2", "SP1")))

    def test_a_waiver_for_a_row_or_a_pattern_that_does_not_exist_fails(self):
        def m(d: dict) -> None:
            d["waivers"] += [{"row": "A99", "patterns": ["SP1"], "reason": "x"}, {"row": "A2", "patterns": ["ZZ9"], "reason": "x"}]
        lib = library({"review/admission.json": m})
        self.assertTrue(messages(lib, "A99", "SP1"))
        self.assertTrue(messages(lib, "A2", "ZZ9"))

    def test_removing_a_waiver_turns_its_gaps_into_failures(self):
        lib = library({"review/admission.json": lambda d: d.update(waivers=[w for w in d["waivers"] if w["row"] != "A10"])})
        self.assertEqual(len([f for f in admission.check(lib) if f.row == "A10" and f.status == "fail"]), 23)


class EachRow(unittest.TestCase):
    def patterns(self, change, pid="SP1"):
        def m(d: dict) -> None:
            change(next(x for x in d["items"] if x["id"] == pid))
        return {"diagnosis/patterns.json": m}

    def test_a1_identity_and_names(self):
        self.assertTrue(messages(library(self.patterns(lambda p: p["name"].update({"en": " "}))), "A1", "SP1"))
        self.assertTrue(messages(library(self.patterns(lambda p: p.update(id="sp1x"))), "A1", "sp1x"))

    def test_a2_a_recorded_source_must_exist(self):
        def m(d: dict) -> None:
            d["textbook_sources"].append({"pattern": "SP1", "path": "reference/no-such-textbook.txt", "note": ""})
        lib = library({"review/admission.json": m})
        self.assertTrue(any("is not in the repository" in x for x in messages(lib, "A2", "SP1", "waived")))

    def test_a2_an_unverified_quotation_does_not_count(self):
        def m(d: dict) -> None:
            for c in d["items"]:
                c["verified"] = False
        lib = library({"citations.json": m})
        self.assertTrue(any("no verified classical quotation" in x for x in messages(lib, "A2", "SP1", "waived")))

    def test_a3_the_evidence_table(self):
        self.assertTrue(any("no required-any" in x for x in messages(library(self.patterns(lambda p: p.update(required_any=[]))), "A3", "SP1")))
        self.assertTrue(any("no against" in x for x in messages(library(self.patterns(lambda p: p.update(against={}))), "A3", "SP1")))
        self.assertTrue(any("only 1 symptoms of weight 2 or 3" in x for x in messages(library(self.patterns(lambda p: p.update(weights={**{s: 1 for s in p["weights"]}, "S_FATIGUE": 2}))), "A3", "SP1")))
        self.assertTrue(any("weight outside 1–3" in x for x in messages(library(self.patterns(lambda p: p["weights"].update({"S_FATIGUE": 5}))), "A3", "SP1")))

    def test_a4_a_symptom_no_question_can_reach(self):
        lib = library(self.patterns(lambda p: p["weights"].update({"S_NO_QUESTION_OFFERS_THIS": 2})))
        self.assertTrue(any("S_NO_QUESTION_OFFERS_THIS" in x for x in messages(lib, "A4", "SP1")))

    def test_a5_a_close_pair_needs_its_exception(self):
        lib = library({"review/admission.json": lambda d: d.update(margin_exceptions=[])})
        self.assertTrue(messages(lib, "A5", "KD1"))
        self.assertTrue(messages(lib, "A5", "HT2"))

    def test_a5_an_exception_that_is_not_needed_fails(self):
        lib = library({"review/admission.json": lambda d: d["margin_exceptions"].append({"patterns": ["EX1", "LG2"], "reason": "x"})})
        self.assertTrue(any("no longer needed" in x for x in messages(lib, "A5", "EX1~LG2")))

    def test_a5_the_typical_patient_must_rank_first(self):
        # EX2 given EX4's evidence table: its own typical patient no longer outranks EX4
        def change(p: dict) -> None:
            p4 = next(x for x in validate_kb.load("diagnosis/patterns.json")["items"] if x["id"] == "EX4")
            p.update(weights=copy.deepcopy(p4["weights"]), against=copy.deepcopy(p4["against"]), required_any=list(p4["required_any"]), max_score=p4["max_score"])
        lib = library(self.patterns(change, "EX2"))
        self.assertTrue(any("EX4" in x for x in messages(lib, "A5", "EX2")))

    def test_a6_two_questions_are_not_enough(self):
        # a near twin of SP1 that differs by one symptom: close, and only the questions that offer that symptom separate them
        def change(p: dict) -> None:
            drop = next(s for s in p["weights"] if s.startswith("S_") and p["weights"][s] == 3)
            p["weights"].pop(drop)
            p["required_any"] = [s for s in p["required_any"] if s != drop]
            p["max_score"] = sum(p["weights"].values())
        lib = library({"diagnosis/patterns.json": add_pattern("LG3", "SP1", change)})
        found = messages(lib, "A6", "LG3") + messages(lib, "A6", "SP1")
        self.assertTrue(any("questions separate them" in x for x in found), found)

    def test_a7_the_tongue_and_the_pulse(self):
        self.assertTrue(any("no tongue feature" in x for x in messages(library(self.patterns(lambda p: [p["weights"].pop(s) for s in [s for s in p["weights"] if s.startswith("T_")]])), "A7", "SP1")))
        self.assertTrue(any("no pulse feature" in x for x in messages(library(self.patterns(lambda p: [p["weights"].pop(s) for s in [s for s in p["weights"] if s.startswith("P_")]])), "A7", "SP1")))

    def test_a7_a_declaration_has_to_be_true(self):
        lib = library({"review/admission.json": lambda d: d["needs_exam"].append("SP1")})
        self.assertTrue(any("declared as needing the tongue and the pulse" in x for x in messages(lib, "A7", "SP1")))
        lib = library({"review/admission.json": lambda d: d.update(needs_exam=[x for x in d["needs_exam"] if x != "EX3"])})
        self.assertTrue(any("does not declare" in x for x in messages(lib, "A7", "EX3", "waived") + messages(lib, "A7", "EX3")))

    def test_a7_a_pattern_that_needs_the_exam_needs_it_in_its_seed(self):
        seed = {"id": "G-9", "title": "typical patient of EX3 x", "expect": {"patterns": {"first": "EX3"}},
                "input": {"findings": {"S_FEVER": {"state": "present"}, "T_BODY_RED": {"state": "present"}, "P_FLOAT": {"state": "present"}}}}
        lib = library(golden=[seed])
        self.assertFalse(any("golden seed does not include them" in x for x in messages(lib, "A7", "EX3", "waived") + messages(lib, "A7", "EX3")))

    def test_a8_the_formula_a_release_can_show(self):
        # a tier is computed from the herbs and never edited: with every formula of SP1 at tier B nothing of SP1 is visible in a release
        def m(d: dict) -> None:
            for f in d["items"]:
                if f["id"] in ("F_SIJUNZI", "F_SHENLING"):
                    f["tier"] = "B"
        lib = library({"formulas/formulas.json": m})
        self.assertTrue(any("no tier-A formula" in x for x in messages(lib, "A8", "SP1")))

    def test_a8_a_declaration_has_to_be_true(self):
        lib = library({"review/admission.json": lambda d: d["no_release_formula"].append({"pattern": "SP1", "reason": "x"})})
        self.assertTrue(any("declares that no formula is visible" in x for x in messages(lib, "A8", "SP1")))

    def test_a8_partially_verified_formulas_do_not_count(self):
        def m(d: dict) -> None:
            for f in d["items"]:
                if f["id"] in ("F_SIJUNZI", "F_SHENLING"):
                    f["verification"]["composition_status"] = "partially-verified"
        self.assertTrue(any("partially verified" in x for x in messages(library({"formulas/formulas.json": m}), "A8", "SP1")))

    def test_a9_treatment_guidance(self):
        def m(d: dict) -> None:
            d["foods"][next(iter(d["foods"]))].pop("basis")
        lib = library({"treatment/guidance.json": m})
        self.assertTrue(any("no basis" in x for pid in [p["id"] for p in lib.patterns] for x in messages(lib, "A9", pid)))
        lib = library(self.patterns(lambda p: p["treatment"].update(acupoints=[])))
        self.assertTrue(any("no acupoints" in x for x in messages(lib, "A9", "SP1")))
        lib = library({"treatment/guidance.json": lambda d: d["lifestyle"]["SP1"].update({"en": ""})})
        self.assertTrue(any("lifestyle" in x for x in messages(lib, "A9", "SP1")))

    def test_a10_the_red_flag_boundary(self):
        def m(d: dict) -> None:
            d["red_flag_boundary"] = [{"pattern": "SP1", "flags": ["RF_NO_SUCH_FLAG"], "reason": ""}, {"pattern": "EX1", "flags": [], "reason": ""}]
        lib = library({"review/admission.json": m})
        self.assertTrue(any("unknown red flag RF_NO_SUCH_FLAG" in x for x in messages(lib, "A10", "SP1", "waived") + messages(lib, "A10", "SP1")))
        self.assertTrue(any("needs its reason" in x for x in messages(lib, "A10", "EX1", "waived") + messages(lib, "A10", "EX1")))

    def test_a10_a_real_boundary_satisfies_the_row(self):
        def m(d: dict) -> None:
            d["red_flag_boundary"] = [{"pattern": "SP1", "flags": ["RF_A_CHEST_PAIN"], "reason": "x"}]
        lib = library({"review/admission.json": m})
        self.assertTrue(any("no longer needed" in x for x in messages(lib, "A10", "SP1")))

    def test_a11_the_seed_and_the_vignettes(self):
        lib = library(golden=[])
        self.assertTrue(any("no golden seed" in x for x in messages(lib, "A11", "SP1")))
        lib = library(vignettes=[])
        self.assertTrue(any("safety vignettes replay it" in x for x in messages(lib, "A11", "SP1")))

    def test_a11_a_red_flag_vignette_and_a_population_vignette_satisfy_the_row(self):
        flagged = {"id": "V-1", "input": {"interview": "EX2", "redFlags": ["RF_A_CHEST_PAIN"]}}
        gated = {"id": "V-2", "input": {"interview": "EX2", "subject": {"pregnancy": "yes"}}}
        lib = library(vignettes=[flagged, gated])
        self.assertTrue(any("no longer needed" in x for x in messages(lib, "A11", "EX2")))
        # the same vignette cannot be both
        both = {"id": "V-3", "input": {"interview": "EX2", "redFlags": ["RF_A_CHEST_PAIN"], "subject": {"pregnancy": "yes"}}}
        lib = library(vignettes=[both])
        self.assertFalse(any("no longer needed" in x for x in messages(lib, "A11", "EX2")))

    def test_a12_wording_in_both_languages(self):
        def m(d: dict) -> None:
            next(s for s in d["items"] if s["id"] == "S_FATIGUE")["en"] = ""
        lib = library({"diagnosis/symptoms.json": m})
        self.assertTrue(any("S_FATIGUE has no name in both languages" in x for x in messages(lib, "A12", "SP1")))
        self.assertTrue(any("en_status" in x for x in messages(library(self.patterns(lambda p: p.update(en_status="draft"))), "A12", "SP1")))


class Records(unittest.TestCase):
    def test_records_name_real_patterns(self):
        def m(d: dict) -> None:
            d["no_release_formula"].append({"pattern": "ZZ9", "reason": "x"})
            d["needs_exam"].append("ZZ8")
        lib = library({"review/admission.json": m})
        self.assertTrue(messages(lib, "A8", "ZZ9"))
        self.assertTrue(messages(lib, "A7", "ZZ8"))

    def test_the_records_hold_no_chinese_text(self):
        """They are build-time only and never shown; a Chinese string in `data/` would need an entry in the Simplified display dictionary for nothing (name a formula by its id)."""
        import re
        self.assertIsNone(re.search(r"[\u3400-\u9fff]", json.dumps(validate_kb.load("review/admission.json"), ensure_ascii=False)))

    def test_the_records_file_agrees_with_the_curated_tables(self):
        from scripts.kb import build_admission
        self.assertEqual(json.loads(json.dumps(build_admission.build())), validate_kb.load("review/admission.json"))


if __name__ == "__main__":
    unittest.main()

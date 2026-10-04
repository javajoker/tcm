"""Review records (K-16): content hashes, validation, role requirements, reset-on-change, applying `reviewed`, and the guard against a hand-set status."""
from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from scripts.kb import build_review, review, validate_kb
from scripts.kb.tests.test_integrity import validate_with


def sample_data() -> dict:
    """A tiny knowledge base with the shapes the review step knows: a pattern list with statuses, red flags (no statuses), a params-like singleton, a herbs-like file with status counts."""
    return {
        "diagnosis/patterns.json": {"_meta": {"status": "draft", "count": 2}, "items": [{"id": "SP1", "name": "脾氣虛", "weight": 3, "status": "draft"}, {"id": "SP2", "name": "脾陽虛", "weight": 2, "status": "draft"}]},
        "diagnosis/red-flags.json": {"_meta": {"count": 1}, "items": [{"id": "RF_A_CHEST_PAIN", "level": "A"}]},
        "safety/rules.json": {"_meta": {"status": "draft"}, "rules": [{"id": "R_X", "severity": "hard"}], "pregnancy_acupoints": []},
        "diagnosis/scoring-params.json": {"_meta": {"status": "draft"}, "pattern": {"bands": {"high": 60}}},
        "herbs/herbs.json": {"_meta": {"status_counts": {"derived": 2}}, "items": [{"id": "h1", "status": "derived"}, {"id": "h2", "status": "derived"}]},
    }


def record(n: int, role: str, rel: str, units: dict, outcome: str = "accepted", **over) -> dict:
    rec = {"id": f"REV-2026-{n:04d}", "area": "test", "reviewer": {"role": role, "name": "A. Reviewer", "credential": "licence 123"}, "date": "2026-11-02", "kb_version": "v1",
           "outcome": outcome, "scope": [{"file": rel, "units": units}], "changes": ["x"] if outcome == "accepted-with-changes" else []}
    rec.update(over)
    return rec


def hashes(data: dict, rel: str, *ids: str) -> dict:
    u = review.units_of(rel, data[rel])
    return {i: u[i] for i in ids}


def compile_(data: dict, *recs: dict) -> dict:
    return review.compile_records([(f"{r['id']}.yaml", r) for r in recs], data)


class Hashing(unittest.TestCase):
    def test_a_hash_ignores_status_and_key_order_but_not_content(self):
        a = {"id": "SP1", "weight": 3, "status": "draft"}
        self.assertEqual(review.unit_hash(a), review.unit_hash({"status": "reviewed", "weight": 3, "id": "SP1"}))
        self.assertNotEqual(review.unit_hash(a), review.unit_hash({**a, "weight": 2}))
        self.assertEqual(len(review.unit_hash(a)), 16)

    def test_the_whole_file_hash_ignores_every_status_marker_and_the_status_counts(self):
        d = sample_data()["herbs/herbs.json"]
        flipped = copy.deepcopy(d)
        flipped["items"][0]["status"] = "reviewed"
        flipped["_meta"]["status_counts"] = {"derived": 1, "reviewed": 1}
        self.assertEqual(review.unit_hash(d, whole_file=True), review.unit_hash(flipped, whole_file=True))
        flipped["items"][0]["id"] = "other"
        self.assertNotEqual(review.unit_hash(d, whole_file=True), review.unit_hash(flipped, whole_file=True))

    def test_units_are_the_items_of_the_registered_lists_and_the_whole_file(self):
        u = review.units_of("diagnosis/patterns.json", sample_data()["diagnosis/patterns.json"])
        self.assertEqual(sorted(u), ["*", "SP1", "SP2"])
        self.assertEqual(list(review.units_of("diagnosis/scoring-params.json", sample_data()["diagnosis/scoring-params.json"])), ["*"], "a file that is not item-reviewable has only the whole-file unit")
        with self.assertRaises(ValueError):
            review.units_of("diagnosis/patterns.json", {"items": [{"id": "A"}, {"id": "A"}]})

    def test_every_registered_list_exists_in_the_real_data_with_unique_ids(self):
        for rel in review.UNITS:
            review.units_of(rel, validate_kb.load(rel))          # raises on a missing key or a duplicate id


class Validation(unittest.TestCase):
    def problems(self, rec: dict) -> list[str]:
        data = sample_data()
        return review.validate_record(rec, {rel: review.units_of(rel, d) for rel, d in data.items()}, "REV.yaml")

    def good(self) -> dict:
        data = sample_data()
        return record(1, "tcm-clinical", "diagnosis/patterns.json", hashes(data, "diagnosis/patterns.json", "SP1"))

    def test_a_good_record_has_no_problems(self):
        self.assertEqual(self.problems(self.good()), [])

    def test_every_rule_names_its_problem(self):
        cases = [
            ({"id": "REV-1"}, "must look like REV-2026-0001"),
            ({"reviewer": {"role": "wizard", "name": "x", "credential": "y"}}, "reviewer.role must be one of"),
            ({"reviewer": {"role": "pharmacy", "name": "", "credential": "y"}}, "reviewer.name and reviewer.credential are required"),
            ({"reviewer": {"role": "pharmacy", "name": "x", "credential": " "}}, "reviewer.name and reviewer.credential are required"),
            ({"date": "02/11/2026"}, "not an ISO date"),
            ({"outcome": "fine"}, "outcome must be one of"),
            ({"outcome": "accepted-with-changes", "changes": []}, "must list the changes"),
            ({"kb_version": " "}, "kb_version"),
            ({"scope": []}, "scope must be a non-empty list"),
            ({"scope": [{"file": "nope.json", "units": {"*": "0" * 16}}]}, "not in data/"),
            ({"scope": [{"file": "diagnosis/patterns.json", "units": {"SP9": "0" * 16}}]}, "there is no unit 'SP9'"),
            ({"scope": [{"file": "diagnosis/patterns.json", "units": {"SP1": "xyz"}}]}, "must be 16 hex digits"),
            ({"scope": [{"file": "diagnosis/patterns.json", "units": {}}]}, "units must map"),
            ({"dissent": "no"}, "dissent must be a list"),
        ]
        for patch, expected in cases:
            self.assertTrue(any(expected in p for p in self.problems({**self.good(), **patch})), (patch, self.problems({**self.good(), **patch})))
        self.assertTrue(any("missing `outcome`" in p for p in self.problems({k: v for k, v in self.good().items() if k != "outcome"})))
        self.assertTrue(any("must be a mapping" in p for p in self.problems("text")))                # type: ignore[arg-type]


class Coverage(unittest.TestCase):
    def setUp(self):
        self.data = sample_data()

    def test_one_accepted_current_record_makes_an_ordinary_unit_reviewed(self):
        r = compile_(self.data, record(1, "tcm-clinical", "diagnosis/patterns.json", hashes(self.data, "diagnosis/patterns.json", "SP1")))
        self.assertEqual(r["problems"], [])
        self.assertEqual(r["reviewed_units"], {"diagnosis/patterns.json": {"SP1"}})
        self.assertEqual([(x["file"], x["unit"]) for x in r["output"]["reviewed"]], [("diagnosis/patterns.json", "SP1")])
        self.assertEqual(r["output"]["coverage"]["diagnosis/patterns.json"]["reviewed"], 1)

    def test_a_pharmacist_alone_does_not_review_a_pattern(self):
        r = compile_(self.data, record(1, "pharmacy", "diagnosis/patterns.json", hashes(self.data, "diagnosis/patterns.json", "SP1")))
        self.assertEqual(r["reviewed_units"], {})

    def test_rejected_and_deferred_reviews_mark_nothing(self):
        h = hashes(self.data, "diagnosis/patterns.json", "SP1")
        for outcome in ("rejected", "deferred"):
            self.assertEqual(compile_(self.data, record(1, "tcm-clinical", "diagnosis/patterns.json", h, outcome))["reviewed_units"], {})
        self.assertEqual(compile_(self.data, record(1, "tcm-clinical", "diagnosis/patterns.json", h, "accepted-with-changes"))["reviewed_units"], {"diagnosis/patterns.json": {"SP1"}})

    def test_safety_rules_need_a_physician_and_a_second_reviewer_of_another_role(self):
        h = hashes(self.data, "safety/rules.json", "R_X")
        physician = record(1, "physician", "safety/rules.json", h)
        pharmacist = record(2, "pharmacy", "safety/rules.json", h)
        clinician = record(3, "tcm-clinical", "safety/rules.json", h)
        self.assertEqual(compile_(self.data, physician)["reviewed_units"], {}, "a physician alone is not enough")
        self.assertEqual(compile_(self.data, pharmacist, clinician)["reviewed_units"], {}, "neither is everyone but the physician")
        self.assertEqual(compile_(self.data, physician, pharmacist)["reviewed_units"], {"safety/rules.json": {"R_X"}})
        self.assertEqual(compile_(self.data, physician, clinician)["reviewed_units"], {"safety/rules.json": {"R_X"}})
        self.assertEqual(compile_(self.data, physician, record(9, "physician", "safety/rules.json", h))["reviewed_units"], {}, "a second physician is not a second role")

    def test_formulas_and_herbs_need_both_clinical_and_pharmacy_review(self):
        self.assertEqual(review.required_roles("formulas/formulas.json"), [{"tcm-clinical"}, {"pharmacy"}])
        h = hashes(self.data, "herbs/herbs.json", "h1")
        self.assertEqual(compile_(self.data, record(1, "tcm-clinical", "herbs/herbs.json", h))["reviewed_units"], {})
        self.assertEqual(compile_(self.data, record(1, "tcm-clinical", "herbs/herbs.json", h), record(2, "pharmacy", "herbs/herbs.json", h))["reviewed_units"], {"herbs/herbs.json": {"h1"}})

    def test_content_that_changes_after_the_review_stops_counting_and_is_reported_stale(self):
        rec = record(1, "tcm-clinical", "diagnosis/patterns.json", hashes(self.data, "diagnosis/patterns.json", "SP1", "SP2"))
        self.data["diagnosis/patterns.json"]["items"][0]["weight"] = 2                           # SP1 changed after the review; SP2 did not
        r = compile_(self.data, rec)
        self.assertEqual(r["reviewed_units"], {"diagnosis/patterns.json": {"SP2"}})
        self.assertEqual([(s["unit"], s["record"]) for s in r["output"]["stale"]], [("SP1", "REV-2026-0001")])
        self.assertNotEqual(r["output"]["stale"][0]["reviewed_hash"], r["output"]["stale"][0]["current_hash"])

    def test_a_whole_file_review_covers_the_file_and_resets_when_any_part_changes(self):
        rec = record(1, "tcm-clinical", "diagnosis/scoring-params.json", hashes(self.data, "diagnosis/scoring-params.json", "*"))
        self.assertEqual(compile_(self.data, rec)["reviewed_units"], {"diagnosis/scoring-params.json": {"*"}})
        self.data["diagnosis/scoring-params.json"]["pattern"]["bands"]["high"] = 55
        self.assertEqual(compile_(self.data, rec)["reviewed_units"], {})

    def test_invalid_and_duplicate_records_are_reported_and_do_not_count(self):
        h = hashes(self.data, "diagnosis/patterns.json", "SP1")
        good = record(1, "tcm-clinical", "diagnosis/patterns.json", h)
        r = review.compile_records([("a.yaml", good), ("b.yaml", dict(good)), ("c.yaml", {**good, "id": "bad"}), ("d.yaml", "not valid YAML: boom")], self.data)
        self.assertEqual(len(r["output"]["records"]), 1)
        self.assertTrue(any("used twice" in p for p in r["problems"]))
        self.assertTrue(any("must look like" in p for p in r["problems"]))
        self.assertTrue(any("d.yaml" in p and "boom" in p for p in r["problems"]))
        self.assertEqual(r["output"]["_meta"]["problems"], len(r["problems"]))


class Applying(unittest.TestCase):
    def test_reviewed_is_set_only_on_covered_units_that_carry_a_status_and_the_counts_follow(self):
        data = sample_data()
        changed = review.apply_reviewed(data, {"diagnosis/patterns.json": {"SP1"}, "diagnosis/red-flags.json": {"RF_A_CHEST_PAIN"}, "herbs/herbs.json": {"h2"}, "diagnosis/scoring-params.json": {"*"}})
        self.assertEqual([i["status"] for i in changed["diagnosis/patterns.json"]["items"]], ["reviewed", "draft"])
        self.assertEqual(changed["diagnosis/patterns.json"]["_meta"]["status"], "draft", "a unit review does not review the file")
        self.assertNotIn("diagnosis/red-flags.json", changed, "items without a status field are covered in records.json only")
        self.assertEqual(changed["herbs/herbs.json"]["_meta"]["status_counts"], {"derived": 1, "reviewed": 1})
        self.assertEqual(changed["diagnosis/scoring-params.json"]["_meta"]["status"], "reviewed")
        self.assertEqual(data["diagnosis/patterns.json"]["items"][0]["status"], "draft", "the input is not modified")

    def test_applying_changes_no_hash(self):
        data = sample_data()
        before = {rel: review.units_of(rel, d) for rel, d in data.items()}
        changed = review.apply_reviewed(data, {"diagnosis/patterns.json": {"SP1", "*"}, "herbs/herbs.json": {"h1", "*"}})
        data.update(changed)
        self.assertEqual({rel: review.units_of(rel, d) for rel, d in data.items()}, before)

    def test_reviewed_by_status_finds_what_a_hand_edit_would_look_like(self):
        data = sample_data()
        data["diagnosis/patterns.json"]["items"][1]["status"] = "reviewed"
        data["diagnosis/scoring-params.json"]["_meta"]["status"] = "reviewed"
        self.assertEqual(review.reviewed_by_status(data), {"diagnosis/patterns.json": {"SP2"}, "diagnosis/scoring-params.json": {"*"}})


class Build(unittest.TestCase):
    def test_the_build_writes_records_and_applies_reviewed_into_a_data_dir(self):
        import yaml
        with tempfile.TemporaryDirectory() as tmp:
            data_dir, rec_dir = Path(tmp) / "data", Path(tmp) / "records"
            rec_dir.mkdir()
            data = sample_data()
            for rel, d in data.items():
                (data_dir / rel).parent.mkdir(parents=True, exist_ok=True)
                (data_dir / rel).write_text(json.dumps(d), encoding="utf-8")
            rec = record(1, "tcm-clinical", "diagnosis/patterns.json", hashes(data, "diagnosis/patterns.json", "SP1"))
            (rec_dir / "REV-2026-0001.yaml").write_text(yaml.safe_dump(rec, allow_unicode=True), encoding="utf-8")
            self.assertEqual(build_review.build(data_dir, rec_dir), [])
            out = json.loads((data_dir / "review" / "records.json").read_text(encoding="utf-8"))
            self.assertEqual(out["_meta"]["count"], 1)
            self.assertEqual([(r["file"], r["unit"]) for r in out["reviewed"]], [("diagnosis/patterns.json", "SP1")])
            self.assertEqual(json.loads((data_dir / "diagnosis/patterns.json").read_text(encoding="utf-8"))["items"][0]["status"], "reviewed")
            # a second run is a no-op (deterministic)
            before = (data_dir / "review" / "records.json").read_text(encoding="utf-8")
            build_review.build(data_dir, rec_dir)
            self.assertEqual((data_dir / "review" / "records.json").read_text(encoding="utf-8"), before)
            # the content changes → the next build (which starts from regenerated drafts) no longer counts it
            changed = {**data["diagnosis/patterns.json"], "items": [{**data["diagnosis/patterns.json"]["items"][0], "weight": 1}, data["diagnosis/patterns.json"]["items"][1]]}
            (data_dir / "diagnosis/patterns.json").write_text(json.dumps(changed), encoding="utf-8")
            build_review.build(data_dir, rec_dir)
            out = json.loads((data_dir / "review" / "records.json").read_text(encoding="utf-8"))
            self.assertEqual((out["reviewed"], [s["unit"] for s in out["stale"]]), ([], ["SP1"]))
            self.assertEqual(json.loads((data_dir / "diagnosis/patterns.json").read_text(encoding="utf-8"))["items"][0]["status"], "draft")


class RealData(unittest.TestCase):
    def test_with_no_records_nothing_is_reviewed_and_the_output_says_so(self):
        out = validate_kb.load("review/records.json")
        self.assertEqual((out["_meta"]["count"], out["reviewed"], out["stale"], out["_meta"]["problems"]), (0, [], [], 0))
        self.assertEqual(out["coverage"]["safety/rules.json"]["required_roles"], [["physician"], ["pharmacy", "tcm-clinical"]])
        self.assertEqual(out["coverage"]["diagnosis/patterns.json"]["units"], 23)

    def test_a_status_set_by_hand_is_caught_by_the_validator(self):
        errs = validate_with({"diagnosis/patterns.json": lambda d: d["items"][0].update(status="reviewed")})
        self.assertTrue(any("marked reviewed but no valid, current review record supports it" in e for e in errs), errs)
        errs = validate_with({"diagnosis/scoring-params.json": lambda d: d["_meta"].update(status="reviewed")})
        self.assertTrue(any("diagnosis/scoring-params.json: * is marked reviewed" in e for e in errs), errs)


if __name__ == "__main__":
    unittest.main()

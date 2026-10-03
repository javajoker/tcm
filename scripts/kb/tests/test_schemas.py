"""The JSON Schemas must accept the real data and reject broken copies of it (K-02)."""
from __future__ import annotations

import copy
import json
import unittest

from jsonschema import Draft202012Validator

from scripts.kb.common import DATA
from scripts.kb.schemas import SCHEMAS, SCHEMA_VERSION, build


def load(rel):
    return json.loads((DATA / rel).read_text(encoding="utf-8"))


def errors(rel, data):
    return list(Draft202012Validator(build(rel)).iter_errors(data))


class SchemaAcceptsData(unittest.TestCase):
    def test_every_file_validates_and_carries_the_schema_version(self):
        for rel in SCHEMAS:
            with self.subTest(rel):
                data = load(rel)
                self.assertEqual(data["_meta"]["schema"], SCHEMA_VERSION)
                self.assertEqual(errors(rel, data), [])

    def test_committed_schema_files_are_current(self):
        for rel, (stem, _b, _t) in SCHEMAS.items():
            with self.subTest(stem):
                on_disk = json.loads((DATA / "schema" / f"{stem}.schema.json").read_text(encoding="utf-8"))
                self.assertEqual(on_disk, json.loads(json.dumps(build(rel))), f"data/schema/{stem}.schema.json is stale: run build_kb")


class SchemaRejectsBrokenData(unittest.TestCase):
    def mutate(self, rel, fn):
        data = copy.deepcopy(load(rel))
        fn(data)
        return errors(rel, data)

    def test_unknown_field_on_a_record(self):
        self.assertTrue(self.mutate("diagnosis/patterns.json", lambda d: d["items"][0].update(typo_field=1)))

    def test_missing_required_field(self):
        self.assertTrue(self.mutate("formulas/formulas.json", lambda d: d["items"][0].pop("tier")))

    def test_bad_ids(self):
        self.assertTrue(self.mutate("diagnosis/symptoms.json", lambda d: d["items"][0].update(id="s_lower")))
        self.assertTrue(self.mutate("herbs/herbs.json", lambda d: d["items"][0].update(id="Herb-1")))
        self.assertTrue(self.mutate("diagnosis/patterns.json", lambda d: d["items"][0].update(id="XX1")))

    def test_bad_panel_dimension_key(self):
        self.assertTrue(self.mutate("diagnosis/patterns.json", lambda d: d["items"][0]["panel_projection_per_degree"].update({"脾.qì": 1})))
        self.assertTrue(self.mutate("herbs/herbs.json", lambda d: d["items"][0]["effects"].update({"liuxie.熱": 1})))

    def test_bad_enum_and_weight_range(self):
        self.assertTrue(self.mutate("formulas/formulas.json", lambda d: d["items"][0].update(tier="D")))
        self.assertTrue(self.mutate("diagnosis/patterns.json", lambda d: d["items"][0]["weights"].update({"S_FATIGUE": 4})))

    def test_empty_required_any(self):
        self.assertTrue(self.mutate("diagnosis/patterns.json", lambda d: d["items"][0].update(required_any=[])))

    def test_profile_must_define_every_dimension_key(self):
        self.assertTrue(self.mutate("config/scope-profiles.json", lambda d: d["profiles"]["release"]["population"].pop("pregnant")))
        self.assertTrue(self.mutate("config/scope-profiles.json", lambda d: d["profiles"]["dev"].update(safety_enforcement="off")))

    def test_safety_rule_target_needs_exactly_one_key(self):
        self.assertTrue(self.mutate("safety/rules.json", lambda d: d["rules"][0]["target"].update(conflict="x")))

    def test_wrong_schema_version_is_detected_by_the_validator(self):
        data = load("glossary.json")
        data["_meta"]["schema"] = "1"
        self.assertTrue(errors("glossary.json", data))


if __name__ == "__main__":
    unittest.main()

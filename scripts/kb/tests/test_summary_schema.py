"""The practitioner file (PM-17): the published schema is a valid schema, every file the web app's tests generate and every published example validates against it, and the mistakes a reader
must not accept are refused. The files are made by apps/web/test/summary-file.test.ts (the generated ones are ignored by git: they exist after the web tests have run)."""
from __future__ import annotations

import copy
import json
import unittest
from pathlib import Path

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[3]
SCHEMA = json.loads((ROOT / "docs" / "schemas" / "tcm-summary-1.schema.json").read_text(encoding="utf-8"))
# version 2 (PM-41) is version 1 with the optional `prescription` section: a file holding it is version 2, any other is version 1
SCHEMA2 = json.loads((ROOT / "docs" / "schemas" / "tcm-summary-2.schema.json").read_text(encoding="utf-8"))
EXAMPLES = sorted((ROOT / "docs" / "schemas" / "examples").glob("*.json"))
GENERATED = sorted((ROOT / "apps" / "web" / "test" / ".generated" / "summaries").glob("*.json"))
VALIDATOR = Draft202012Validator(SCHEMA)
VALIDATOR2 = Draft202012Validator(SCHEMA2)


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def problems(doc: dict) -> list[str]:
    validator = VALIDATOR2 if doc.get("version") == 2 else VALIDATOR
    return [f"{'/'.join(map(str, e.absolute_path))}: {e.message[:120]}" for e in validator.iter_errors(doc)]


class Schema(unittest.TestCase):
    def test_it_is_a_valid_schema(self):
        Draft202012Validator.check_schema(SCHEMA)
        Draft202012Validator.check_schema(SCHEMA2)

    def test_version_2_is_version_1_with_the_prescription_section_only(self):
        strip = lambda s: {k: v for k, v in s.items() if k not in ("$id", "title", "description", "required")} | {"properties": {k: v for k, v in s["properties"].items() if k not in ("version", "prescription")}}
        self.assertEqual(strip(SCHEMA2), strip(SCHEMA))
        self.assertEqual(SCHEMA2["properties"]["version"], {"const": 2})
        self.assertEqual(SCHEMA2["required"], SCHEMA["required"] + ["prescription"])

    def test_a_version_2_example_is_published_and_a_version_1_file_never_holds_a_prescription(self):
        v2 = [p for p in EXAMPLES if load(p).get("version") == 2]
        self.assertEqual([p.stem for p in v2], ["dev-with-prescription"])
        for path in [*EXAMPLES, *GENERATED]:
            doc = load(path)
            self.assertEqual("prescription" in doc, doc.get("version") == 2, path.name)

    def test_the_published_examples_validate_and_cover_the_cases(self):
        self.assertGreaterEqual(len(EXAMPLES), 4)
        for path in EXAMPLES:
            with self.subTest(path.name):
                self.assertEqual(problems(load(path)), [])
        names = {p.stem for p in EXAMPLES}
        self.assertTrue({"release-full", "release-with-medicines-and-note", "dev-patterns-only"} <= names)

    def test_every_generated_file_validates(self):
        if not GENERATED:
            self.skipTest("run the web tests first: they write the files to apps/web/test/.generated/summaries")
        self.assertGreaterEqual(len(GENERATED), 46, "23 typical patients, development and release")
        for path in GENERATED:
            with self.subTest(path.name):
                self.assertEqual(problems(load(path)), [])


class PrescriptionRefusals(unittest.TestCase):
    def setUp(self):
        path = next((p for p in EXAMPLES if p.stem == "dev-with-prescription"), None)
        if path is None:
            self.skipTest("no version-2 example")
        self.base = load(path)

    def refused(self, mutate, expect: str):
        doc = copy.deepcopy(self.base)
        mutate(doc)
        found = problems(doc)
        self.assertTrue(any(expect in p for p in found), f"expected a problem about {expect!r}: {found}")

    def test_the_section_is_exact(self):
        self.refused(lambda d: d["prescription"]["composition"][0].update(grams="9"), "grams")
        self.refused(lambda d: d["prescription"]["composition"][0].update(dose=9), "dose")
        self.refused(lambda d: d["prescription"].pop("version"), "version")
        self.refused(lambda d: d["prescription"]["changes"].append({"op": "swap", "herb": d["prescription"]["composition"][0]["herb"], "role": "佐", "rule": "x"}), "swap")
        self.refused(lambda d: d.update(version=1), "prescription")


class Refusals(unittest.TestCase):
    base = load(next(p for p in EXAMPLES if p.stem == "release-full")) if EXAMPLES else {}

    def refused(self, mutate, expect: str):
        doc = copy.deepcopy(self.base)
        mutate(doc)
        found = problems(doc)
        self.assertTrue(found, "the mistake was accepted")
        self.assertTrue(any(expect in p for p in found), f"expected a problem about {expect!r}: {found}")

    def test_the_envelope_is_required_and_exact(self):
        self.refused(lambda d: d.pop("notice"), "notice")
        self.refused(lambda d: d.pop("exportedFrom"), "exportedFrom")
        self.refused(lambda d: d.update(version=2), "prescription")          # version 2 means a file that holds a prescription
        self.refused(lambda d: d.update(format="tcm-inputs"), "tcm-summary")
        self.refused(lambda d: d.update(language="fr"), "language")
        self.refused(lambda d: d.update(createdAt="yesterday"), "createdAt")
        self.refused(lambda d: d.update(score=82), "score")

    def test_bands_and_enumerations_are_words(self):
        self.refused(lambda d: d["panel"]["elements"][0].update(band="great"), "band")
        self.refused(lambda d: d["panel"]["coldHeat"].update(band=0.4), "band")
        self.refused(lambda d: d["patterns"]["items"][0].update(band="certain"), "band")
        self.refused(lambda d: d["patterns"].update(confidence="sure"), "confidence")
        self.refused(lambda d: d["recommendations"]["formulas"][0].update(tier="D") if d["recommendations"]["formulas"] else d["recommendations"].update(extra=1), "")
        self.refused(lambda d: d["findings"][0].update(quality="rumour"), "quality")

    def test_every_coded_item_has_both_labels_and_nothing_else(self):
        self.refused(lambda d: d["findings"][0]["label"].pop("zh-Hant"), "zh-Hant")
        self.refused(lambda d: d["findings"][0]["label"].pop("en"), "en")
        self.refused(lambda d: d["findings"][0].update(weight=3), "weight")
        self.refused(lambda d: d["patterns"]["items"][0].update(pct=71), "pct")

    def test_the_person_and_the_safety_section_are_bounded(self):
        self.refused(lambda d: d["person"].update(ageYears=-1), "ageYears")
        self.refused(lambda d: d["person"].update(sex="unknown"), "sex")
        self.refused(lambda d: d["person"].update(address="1 Main St"), "address")
        self.refused(lambda d: d["safety"]["medications"].update(otherNamed="aspirin"), "otherNamed")
        self.refused(lambda d: d["safety"]["medications"].update(status="maybe"), "status")
        self.refused(lambda d: d["observations"].update(pulse={"rate": 5}), "rate")
        self.refused(lambda d: d.update(note="x" * 4001), "note")

    def test_a_section_may_be_left_out_and_a_file_may_be_just_the_envelope(self):
        doc = {k: v for k, v in self.base.items() if k in ("format", "version", "createdAt", "exportedFrom", "language", "notice")}
        self.assertEqual(problems(doc), [])
        for section in ("person", "safety", "findings", "observations", "constitution", "panel", "patterns", "recommendations"):
            partial = {k: v for k, v in self.base.items() if k != section}
            self.assertEqual(problems(partial), [], section)


if __name__ == "__main__":
    unittest.main()

"""The scaffold of a new pattern (PM-21): every piece an accepted candidate needs, in the shape the curated tables and the engine's tests already use."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.kb import new_pattern
from scripts.kb.curated import patterns as curated_patterns
from scripts.kb.tests.test_dossier import CANDIDATE, write_candidate
from scripts.review import dossier


class Scaffold(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lib = dossier.default_library()
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls.tmp.name)
        cls.out = cls.dir / "LG3"
        cls.files = new_pattern.scaffold(write_candidate(cls.dir), cls.out, cls.lib)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def read(self, name: str) -> str:
        return (self.out / name).read_text(encoding="utf-8")

    def test_it_writes_each_piece(self):
        self.assertEqual(sorted(p.name for p in self.files), sorted(["pattern.entry.py.txt", "symptoms.txt", "prose_en.txt", "treatment.txt", "admission.txt", "golden.stub.json", "vignettes.stub.json", "CHECKLIST.md"]))

    def test_the_entry_has_the_shape_of_the_curated_table_and_the_proposal_as_written(self):
        entry = eval(self.read("pattern.entry.py.txt").strip().rstrip(","), {"dict": dict})        # a dict(...) call, comments included
        self.assertEqual(set(entry), set(curated_patterns.PATTERNS[0]))
        self.assertEqual(entry["id"], "LG3")
        self.assertEqual(entry["weights"], CANDIDATE["key_symptoms"])
        self.assertEqual(entry["against"], CANDIDATE["against"])
        self.assertEqual(entry["cites"], CANDIDATE["sources"]["citations"])
        self.assertEqual(entry["formulas"], CANDIDATE["formulas"])
        self.assertEqual(sorted(entry["required"]), ["S_COUGH_WHITE_THIN", "S_RUNNY_NOSE_CLEAR"])
        self.assertEqual(entry["elements"], [])           # the author's: the scaffold does not invent the 證素

    def test_new_symptoms_come_in_the_registry_format(self):
        self.assertEqual(self.read("symptoms.txt").strip(), "S_COUGH_WHITE_THIN|咳嗽痰白清稀|cough with thin white phlegm|TODO")

    def test_the_records_carry_the_proposed_sources_and_boundary(self):
        text = self.read("admission.txt")
        self.assertIn('"path": "reference/README.md"', text)
        for flag in CANDIDATE["red_flags"]:
            self.assertIn(flag, text)
        self.assertIn("never waived", text)

    def test_the_golden_stub_has_the_keys_of_a_golden_case_and_the_next_free_id(self):
        stub = json.loads(self.read("golden.stub.json"))
        real = json.loads(next(iter(sorted(new_pattern.GOLDEN.glob("G-*.json")))).read_text(encoding="utf-8"))
        self.assertEqual(set(stub), set(real))
        self.assertEqual(set(stub["input"]), set(real["input"]))
        self.assertEqual(set(stub["input"]["subject"]), set(real["input"]["subject"]))
        self.assertEqual(stub["expect"]["patterns"], {"first": "LG3", "top3": ["LG3"]})
        self.assertTrue(stub["title"].startswith("typical patient of LG3 "))          # the link the checklist's row A11 follows
        self.assertEqual(stub["id"], new_pattern.next_golden_id())
        self.assertFalse((new_pattern.GOLDEN / f"{stub['id']}.json").exists())

    def test_the_vignette_stubs_are_one_with_a_red_flag_and_one_gated_by_a_population(self):
        vs = json.loads(self.read("vignettes.stub.json"))["vignettes"]
        real = [v for f in sorted((new_pattern.GOLDEN.parent / "safety").glob("*.json")) for v in json.loads(f.read_text(encoding="utf-8"))["vignettes"]]
        for v in vs:
            self.assertEqual(v["input"]["interview"], "LG3")
            self.assertLessEqual(set(v), {k for r in real for k in r})
            self.assertLessEqual(set(v["input"]), {k for r in real for k in r["input"]})
        flagged = [v for v in vs if v["input"].get("redFlags")]
        gated = [v for v in vs if not v["input"].get("redFlags") and v["input"].get("subject", {}).get("pregnancy") == "yes"]
        self.assertEqual((len(flagged), len(gated)), (1, 1))
        self.assertEqual(flagged[0]["input"]["redFlags"], ["RF_A_DYSPNEA"])                # the first level-A flag the proposal names

    def test_the_checklist_has_every_row_with_where_to_do_it(self):
        text = self.read("CHECKLIST.md")
        for row in [f"A{i}" for i in range(1, 14)]:
            self.assertIn(f"| {row} |", text)
        self.assertIn("never waived", text)

    def test_a_candidate_with_problems_writes_nothing(self):
        with tempfile.TemporaryDirectory() as d:
            path = write_candidate(Path(d), formulas=["F_NOPE"])
            with self.assertRaises(ValueError):
                new_pattern.scaffold(path, Path(d) / "out", self.lib)
            self.assertFalse((Path(d) / "out").exists())

    def test_a_candidate_is_found_by_its_id(self):
        self.assertEqual(new_pattern.resolve("LG3"), dossier.CANDIDATES / "LG3.yaml")
        self.assertEqual(new_pattern.resolve("x/y.yaml"), Path("x/y.yaml"))


if __name__ == "__main__":
    unittest.main()

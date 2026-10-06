"""Dossiers of candidate patterns (PM-21, library-expansion design §5): a page of facts for the reviewer, made from a short proposal and the library as it is."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import yaml

from scripts.review import dossier

CANDIDATE = {
    "id": "LG3",
    "group": "lung",
    "module": "respiratory (new)",
    "name": {"zh-Hant": "風寒襲肺", "en": "Wind-cold fettering the lung"},
    "principle": "疏風散寒，宣肺止咳",
    "sources": {"citations": ["jingui-012-1"], "textbooks": [{"path": "reference/README.md", "note": "stands in for a textbook in this test"}]},
    "key_symptoms": {"S_COUGH_WHITE_THIN": 3, "S_RUNNY_NOSE_CLEAR": 3, "S_AVERSION_COLD": 2, "S_NO_SWEAT": 2, "S_NASAL_CONGESTION": 1, "T_COAT_THIN_WHITE": 1, "P_FLOAT": 1},
    "against": {"S_THIRST_COLD_DRINK": 2},
    "new_symptoms": {"S_COUGH_WHITE_THIN": {"zh-Hant": "咳嗽痰白清稀", "en": "cough with thin white phlegm"}},
    "formulas": ["F_MAHUANG", "F_ERCHEN"],
    "new_formulas": [{"name": "三拗湯", "source": "太平惠民和劑局方"}],
    "red_flags": ["RF_A_DYSPNEA", "RF_B_HEMOPTYSIS", "RF_B_HIGH_FEVER"],
    "notes": "A test candidate: not a proposal.",
}


def write_candidate(tmp: Path, **changes) -> Path:
    c = {**CANDIDATE, **changes}
    p = tmp / f"{c['id']}.yaml"
    p.write_text(yaml.safe_dump(c, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return p


class Dossier(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lib = dossier.default_library()
        cls.tmp = tempfile.TemporaryDirectory()
        cls.dir = Path(cls.tmp.name)
        cls.path = dossier.write(write_candidate(cls.dir), cls.dir / "out", session_kb=87.4, lib=cls.lib)
        cls.text = cls.path.read_text(encoding="utf-8")

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_it_is_written_where_the_packs_go(self):
        self.assertEqual(self.path, self.dir / "out" / "dossiers" / "LG3.md")

    def test_every_section_of_the_design_is_there(self):
        for heading in ("## 1. Sources", "## 2. Overlap", "## 3. Questions", "## 4. Red-flag boundary", "## 5. Formulas", "## 6. Cost", "## Decision"):
            self.assertIn(heading, self.text)

    def test_sources_show_the_quotation_with_its_status_and_the_textbook(self):
        self.assertIn("jingui-012-1", self.text)
        self.assertIn("verified", self.text)
        self.assertIn("reference/README.md", self.text)

    def test_overlap_names_the_patterns_that_share_symptoms_and_flags_the_close_ones(self):
        section = self.text.split("## 2.")[1].split("## 3.")[0]
        self.assertIn("`EX1`", section)                       # shares aversion to cold, no sweat, a clear runny nose …
        self.assertIn("S_AVERSION_COLD", section)
        self.assertIn("pattern(s) under the margin", section)

    def test_questions_say_which_symptoms_nothing_asks(self):
        section = self.text.split("## 3.")[1].split("## 4.")[0]
        self.assertIn("S_COUGH_WHITE_THIN", section)
        self.assertIn("not asked", section)
        self.assertIn("tongue or pulse", section)

    def test_the_red_flag_boundary_ticks_what_was_proposed(self):
        section = self.text.split("## 4.")[1].split("## 5.")[0]
        for flag in ("RF_A_DYSPNEA", "RF_B_HEMOPTYSIS", "RF_B_HIGH_FEVER"):
            self.assertRegex(section, rf"\| ✔ \| `{flag}`")
        self.assertNotRegex(section, r"\| ✔ \| `RF_A_CHEST_PAIN`")
        self.assertIn("N-A", section)

    def test_formulas_show_the_tier_a_release_can_see_and_what_would_have_to_be_added(self):
        section = self.text.split("## 5.")[1].split("## 6.")[0]
        self.assertRegex(section, r"`F_ERCHEN`.*\| A \|")
        self.assertRegex(section, r"`F_MAHUANG`.*\| C \|")
        self.assertIn("三拗湯", section)

    def test_cost_estimates_the_addition_against_the_budget(self):
        section = self.text.split("## 6.")[1]
        self.assertRegex(section, r"Estimated addition: \d+\.\d KB gzip")
        self.assertIn("87.4 KB today", section)
        self.assertRegex(section, r"about -?\d+\.\d KB would remain")

    def test_the_dossier_is_deterministic(self):
        again = dossier.write(write_candidate(self.dir), self.dir / "again", session_kb=87.4, lib=self.lib)
        self.assertEqual(again.read_text(encoding="utf-8"), self.text)


class TheProposalIsChecked(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lib = dossier.default_library()

    def problems(self, **changes):
        return dossier.problems({**CANDIDATE, **changes}, self.lib)

    def test_a_good_candidate_has_no_problems(self):
        self.assertEqual(self.problems(), [])

    def test_the_id_follows_the_group(self):
        self.assertTrue(any("must be the prefix of the group (LG)" in p for p in self.problems(id="SP7")))
        self.assertTrue(any("must be the prefix" in p for p in self.problems(id="LG10")))
        self.assertTrue(any("is already a pattern" in p for p in self.problems(id="LG1")))
        self.assertTrue(any("not one of" in p for p in self.problems(group="head")))

    def test_names_symptoms_weights_and_ids_must_be_real(self):
        self.assertTrue(any("no en name" in p for p in self.problems(name={"zh-Hant": "x", "en": ""})))
        self.assertTrue(any("S_NOT_A_SYMPTOM is not in the symptom registry" in p for p in self.problems(key_symptoms={"S_NOT_A_SYMPTOM": 2})))
        self.assertTrue(any("not 1, 2 or 3" in p for p in self.problems(key_symptoms={"S_FATIGUE": 4})))
        self.assertTrue(any("both key and against" in p for p in self.problems(key_symptoms={"S_FATIGUE": 2}, against={"S_FATIGUE": 1})))
        self.assertTrue(any("no key_symptoms" in p for p in self.problems(key_symptoms={})))
        self.assertTrue(any("is already in the registry" in p for p in self.problems(new_symptoms={"S_FATIGUE": {"zh-Hant": "x", "en": "y"}})))

    def test_sources_formulas_and_red_flags_must_exist(self):
        self.assertTrue(any("not in citations.json" in p for p in self.problems(sources={"citations": ["nowhere-1"]})))
        self.assertTrue(any("is not in the repository" in p for p in self.problems(sources={"textbooks": [{"path": "reference/none.txt"}]})))
        self.assertTrue(any("F_NOPE is not in the library" in p for p in self.problems(formulas=["F_NOPE"])))
        self.assertTrue(any("RF_NOPE is not a red flag" in p for p in self.problems(red_flags=["RF_NOPE"])))

    def test_a_bad_candidate_writes_no_dossier(self):
        with tempfile.TemporaryDirectory() as d:
            path = write_candidate(Path(d), formulas=["F_NOPE"])
            with self.assertRaises(ValueError):
                dossier.write(path, Path(d) / "out", lib=self.lib)
            self.assertFalse((Path(d) / "out").exists())

    def test_the_proposal_is_scored_as_written(self):
        n = dossier.naive_pattern(CANDIDATE)
        self.assertEqual(n["max_score"], sum(CANDIDATE["key_symptoms"].values()))
        self.assertEqual(sorted(n["required_any"]), ["S_COUGH_WHITE_THIN", "S_RUNNY_NOSE_CLEAR"])        # the weight-3 symptoms, unless the proposal names its own
        self.assertEqual(dossier.naive_pattern({**CANDIDATE, "required_any": ["S_NO_SWEAT"]})["required_any"], ["S_NO_SWEAT"])

    def test_a_new_symptom_has_to_be_used(self):
        self.assertTrue(any("S_ORPHAN is not used" in p for p in self.problems(new_symptoms={**CANDIDATE["new_symptoms"], "S_ORPHAN": {"zh-Hant": "x", "en": "y"}})))

    def test_the_template_is_a_valid_proposal_once_its_placeholder_path_is_real(self):
        template = dossier.ROOT / "review" / "candidates" / "TEMPLATE.yaml.txt"
        c = yaml.safe_load(template.read_text(encoding="utf-8"))
        self.assertEqual(self.lib and dossier.problems(c, self.lib), [f"sources: {c['sources']['textbooks'][0]['path']} is not in the repository"])
        c["sources"]["textbooks"][0]["path"] = "reference/README.md"
        self.assertEqual(dossier.problems(c, self.lib), [])

    def test_the_prefixes_are_the_ones_the_library_uses(self):
        for p in self.lib.patterns:
            self.assertEqual(p["id"][:2], dossier.GROUP_PREFIX[p["group"]], p["id"])


if __name__ == "__main__":
    unittest.main()

"""Review packs (K-17): every item is in its pack, the engine annotations are right, and a skeleton becomes a valid record that the build accepts."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import yaml

from scripts.kb import review, validate_kb
from scripts.review import pack

CTX = pack.Context()


def build_all(out: Path) -> dict[str, str]:
    pack.build("all", out)
    return {a: (out / a / "PACK.md").read_text(encoding="utf-8") for a in pack.AREAS}


class Packs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name)
        cls.packs = build_all(cls.out)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_the_four_areas_are_generated_with_a_pack_and_a_record_skeleton(self):
        self.assertEqual(sorted(pack.AREAS), ["formulas", "patterns", "red-flags", "safety-rules"])
        for a in pack.AREAS:
            self.assertTrue((self.out / a / "PACK.md").exists() and (self.out / a / "record-skeleton.yaml").exists(), a)

    def test_every_item_of_the_area_is_in_its_pack(self):
        for rf in CTX.data["diagnosis/red-flags.json"]["items"]:
            self.assertIn(f"`{rf['id']}`", self.packs["red-flags"])
        self.assertEqual(len(CTX.data["diagnosis/red-flags.json"]["items"]), 28)
        for r in CTX.rules["rules"]:
            self.assertIn(f"`{r['id']}`", self.packs["safety-rules"])
        for p in CTX.patterns:
            self.assertIn(f"## `{p['id']}`", self.packs["patterns"])
        for f in CTX.formulas:
            self.assertIn(f"## `{f['id']}`", self.packs["formulas"])

    def test_the_pack_says_who_reviews_and_what_the_fingerprint_is(self):
        for a, text in self.packs.items():
            self.assertIn(f"`{CTX.fingerprint}`", text, a)
            self.assertIn("**Reviewers:**", text)
        self.assertIn("Physician **and** a second reviewer", self.packs["red-flags"])
        self.assertIn("TCM clinical reviewer **and** pharmacy reviewer", self.packs["formulas"])

    def test_red_flag_items_show_the_notice_and_level_the_policy_gives_them(self):
        t = self.packs["red-flags"]
        self.assertIn("| `RF_A_CHEST_PAIN` | A |", t)
        for rid, notice in [("RF_A_CHEST_PAIN", "N-A (emergency)"), ("RF_B_VOMITING", "N-B (within 24 h)"), ("RF_C_MINOR", "N-MINOR"), ("RF_C_PREGNANT", "N-PREG"), ("RF_C_LACTATING", "N-LACT"), ("RF_C_KIDNEY", "N-SERIOUS")]:
            line = next(l for l in t.splitlines() if l.startswith(f"| `{rid}`"))
            self.assertIn(notice, line, rid)
            self.assertIn("L0 / L3", line, rid)
        self.assertIn("`TW`", t)
        self.assertIn("1925", t)

    def test_safety_rules_list_what_they_currently_affect(self):
        t = self.packs["safety-rules"]
        anticoag = next(l for l in t.splitlines() if l.startswith("| `R_ANTICOAGULANT`"))
        self.assertIn("formulas carry the interaction tag `anticoagulant`", anticoag)
        self.assertIn("F_SIJUNZI", anticoag)
        avoid = next(l for l in t.splitlines() if l.startswith("| `R_PREG_HERB_AVOID`"))
        self.assertIn("flagged `avoid`", avoid)
        self.assertIn("十八反", t)
        self.assertIn("合谷", next(l for l in t.splitlines() if l.startswith("| `R_PREG_ACUPOINTS`")))

    def test_patterns_carry_the_typical_patients_score_and_flag_the_confusable_pairs(self):
        t = self.packs["patterns"]
        sp1 = t[t.index("## `SP1`"):t.index("## `SP2`")]
        self.assertRegex(sp1, r"this pattern scores \*\*\d+\.\d\*\* \(rank 1\)")
        kd1 = t[t.index("## `KD1`"):t.index("## `KD2`")]
        self.assertIn("confusable", kd1, "KD1 and HT2 are the closest pair after K-07 (data README)")
        self.assertNotIn("confusable", sp1)
        self.assertIn("Asked by question", t)

    def test_formulas_carry_the_explained_share_for_the_patterns_that_recommend_them(self):
        t = self.packs["formulas"]
        f = t[t.index("## `F_SIJUNZI`"):t.index("## `F_SHENLING`")] if t.index("## `F_SIJUNZI`") < t.index("## `F_SHENLING`") else t[t.index("## `F_SIJUNZI`"):]
        self.assertRegex(f, r"\| `SP1` \| \d+% \| \d\.\d\d \| \d+ \|")
        self.assertIn("**Composition**", f)

    def test_generation_is_deterministic(self):
        with tempfile.TemporaryDirectory() as other:
            again = build_all(Path(other))
            self.assertEqual(again, self.packs)
            self.assertEqual((Path(other) / "patterns" / "record-skeleton.yaml").read_text(encoding="utf-8"), (self.out / "patterns" / "record-skeleton.yaml").read_text(encoding="utf-8"))


class Skeletons(unittest.TestCase):
    def filled(self, area: str, role: str) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            pack.build(area, Path(tmp))
            text = (Path(tmp) / area / "record-skeleton.yaml").read_text(encoding="utf-8")
        rec = yaml.safe_load(text)
        rec.update(id="REV-2026-0001", date="2026-11-02", outcome="accepted")
        rec["reviewer"] = {"role": role, "name": "A. Reviewer", "credential": "licence 123"}
        return rec

    def test_a_skeleton_names_every_unit_with_its_current_hash(self):
        rec = self.filled("patterns", "tcm-clinical")
        units = review.units_of("diagnosis/patterns.json", CTX.data["diagnosis/patterns.json"])
        self.assertEqual(rec["scope"][0]["units"], units)
        self.assertEqual(rec["kb_version"], CTX.fingerprint)

    def test_a_filled_skeleton_is_a_valid_record_and_makes_the_units_reviewed(self):
        for area, rel, roles in [("patterns", "diagnosis/patterns.json", ["tcm-clinical"]), ("red-flags", "diagnosis/red-flags.json", ["physician", "tcm-clinical"]),
                                 ("safety-rules", "safety/rules.json", ["physician", "pharmacy"]), ("formulas", "formulas/formulas.json", ["tcm-clinical", "pharmacy"])]:
            recs = []
            for n, role in enumerate(roles, 1):
                rec = self.filled(area, role)
                rec["id"] = f"REV-2026-{n:04d}"
                recs.append((f"{rec['id']}.yaml", rec))
            result = review.compile_records(recs, CTX.data)
            self.assertEqual(result["problems"], [], area)
            self.assertTrue(len(result["reviewed_units"][rel]) >= len(CTX.data[rel].get("items", CTX.data[rel].get("rules", []))), area)

    def test_a_skeleton_with_its_placeholders_left_in_is_not_a_valid_record(self):
        with tempfile.TemporaryDirectory() as tmp:
            pack.build("patterns", Path(tmp))
            rec = yaml.safe_load((Path(tmp) / "patterns" / "record-skeleton.yaml").read_text(encoding="utf-8"))
        problems = review.validate_record(rec, {rel: review.units_of(rel, d) for rel, d in CTX.data.items()}, "skeleton")
        self.assertTrue(any("must look like" in p for p in problems))
        self.assertTrue(any("reviewer.role" in p for p in problems))

    def test_the_whole_real_validator_still_passes(self):
        self.assertEqual(validate_kb.validate(check_sources=False), [])


class Cli(unittest.TestCase):
    def test_an_unknown_area_is_refused(self):
        with self.assertRaises(SystemExit):
            pack.main(["nonsense"])

    def test_the_fingerprint_changes_with_the_content_and_not_with_statuses(self):
        data = {rel: dict(d) for rel, d in CTX.data.items()}
        base = review.kb_fingerprint(data)
        self.assertEqual(base, CTX.fingerprint)
        import copy
        d2 = copy.deepcopy(CTX.data)
        d2["diagnosis/patterns.json"]["items"][0]["status"] = "reviewed"
        self.assertEqual(review.kb_fingerprint(d2), base)
        d2["diagnosis/patterns.json"]["items"][0]["max_score"] += 1
        self.assertNotEqual(review.kb_fingerprint(d2), base)


if __name__ == "__main__":
    unittest.main()

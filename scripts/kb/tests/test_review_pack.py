"""Review packs (K-17, PM-57): every item is in its pack, every data file and every text outside data/ is in some pack, the engine annotations are right, the herb sample follows
content review §4.3, the worksheets hold every quotation with its explanation, and a skeleton becomes a valid record that the build accepts."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import yaml

from scripts.kb import review, validate_kb
from scripts.review import areas_kb, areas_text, pack

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

    def test_every_area_is_generated_with_a_pack_and_a_record_skeleton(self):
        self.assertEqual(sorted(pack.AREAS), ["book", "citations", "constitutions", "course", "formulas", "glossary", "guidance", "herbs", "panel", "patterns", "red-flags", "reference",
                                              "safety-rules", "symptoms", "tongue-pulse", "ui", "wuxing"])
        for a in pack.AREAS:
            self.assertTrue((self.out / a / "PACK.md").exists() and (self.out / a / "record-skeleton.yaml").exists(), a)

    def test_every_data_file_and_every_text_outside_data_is_in_a_pack_or_listed_with_the_reason(self):
        covered: dict[str, list[str]] = {}
        for a, make in pack.AREAS.items():
            for rel, units in make(CTX).scope:
                covered.setdefault(rel, []).append(a)
                self.assertTrue(units, (a, rel))
        files = set(CTX.data) | set(CTX.targets)
        self.assertEqual(sorted(files - set(covered) - set(pack.NOT_IN_A_PACK)), [], "a data file or text no pack covers: add it to a pack, or to NOT_IN_A_PACK with the reason")
        self.assertEqual(sorted(set(pack.NOT_IN_A_PACK) - set(CTX.data)), [], "NOT_IN_A_PACK names a file that does not exist")
        self.assertEqual(sorted(set(pack.NOT_IN_A_PACK) & set(covered)), [], "a file is both in a pack and listed as in none")
        self.assertEqual(sorted(rel for rel, areas in covered.items() if len(areas) > 1), [], "a file in two packs could be reviewed twice under different roles")
        self.assertEqual(sorted(set(covered) - files), [], "a pack names a file that does not exist")

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
        versions = {a: make(CTX).version for a, make in pack.AREAS.items()}
        for a, text in self.packs.items():
            self.assertTrue(f"`{versions[a] or CTX.fingerprint}`" in text, a)
            self.assertIn("**Reviewers:**", text)
        self.assertEqual(sorted(a for a, v in versions.items() if v), ["book", "course", "ui"], "a text outside data/ names the hash of its whole text, not the knowledge base's")
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

    def test_the_red_flag_pack_shows_the_words_that_re_open_the_screening_and_covers_their_file(self):
        t = self.packs["red-flags"]
        self.assertIn("## The words that re-open the screening", t)
        self.assertIn("胸悶 + 冷汗", t)
        self.assertIn("chest pain", t)
        scope = {rel for rel, _ in pack.red_flags(CTX).scope}
        self.assertIn("safety/red-flag-terms.json", scope)

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

    def test_formulas_with_a_second_source_show_what_was_checked_and_how(self):
        t = self.packs["formulas"]
        f = t[t.index("## `F_SHENLING`"):]
        f = f[:f.index("\n## ", 5)] if "\n## " in f[5:] else f
        self.assertIn("**Second source (2026-10-04):**", f)
        self.assertIn("byte for byte", f)                 # the limit of the check is stated next to the result

    def test_generation_is_deterministic(self):
        with tempfile.TemporaryDirectory() as other:
            again = build_all(Path(other))
            self.assertEqual(again, self.packs)
            self.assertEqual((Path(other) / "patterns" / "record-skeleton.yaml").read_text(encoding="utf-8"), (self.out / "patterns" / "record-skeleton.yaml").read_text(encoding="utf-8"))


class NewAreas(unittest.TestCase):
    """The packs added by PM-57."""

    @classmethod
    def setUpClass(cls):
        cls.text = {a: pack.AREAS[a](CTX).markdown for a in ("symptoms", "tongue-pulse", "constitutions", "panel", "guidance", "reference", "wuxing", "citations", "glossary", "ui")}

    def test_every_item_of_the_new_data_areas_is_in_its_pack(self):
        t = self.text
        for s in CTX.data["diagnosis/symptoms.json"]["items"]:
            self.assertIn(f"`{s['id']}`", t["symptoms"])
        for q in CTX.questions:
            self.assertIn(f"### `{q['id']}`", t["symptoms"])
        for f in CTX.data["diagnosis/tongue.json"]["features"] + CTX.data["diagnosis/pulse.json"]["pulses"]:
            self.assertIn(f"`{f['id']}`", t["tongue-pulse"])
        for ty in CTX.data["diagnosis/constitution-items.json"]["types"]:
            for i in ty["items"]:
                self.assertIn(f"`{i['id']}`", t["constitutions"])
        for name in CTX.data["diagnosis/yingwei.json"]["natures"]:
            self.assertIn(f"### {name}", t["panel"])
        for name in list(CTX.data["treatment/guidance.json"]["acupoints"]) + list(CTX.data["treatment/guidance.json"]["foods"]):
            self.assertIn(f"| {name}", t["guidance"])
        for p in CTX.data["herbs/pairings.json"]["items"]:
            self.assertIn(f"`{p['id']}`", t["reference"])
        for c in CTX.citations:
            self.assertIn(f"`{c}`", t["citations"])
        for g in CTX.data["glossary.json"]["items"]:
            self.assertIn(f"| {g['zh-Hant']} |", t["glossary"])

    def test_the_guidance_pack_says_which_patterns_recommend_a_point_and_where_its_drawing_is(self):
        t = self.text["guidance"]
        hegu = next(l for l in t.splitlines() if l.startswith("| 合谷 |"))
        self.assertIn("**yes**", hegu, "合谷 is avoided in pregnancy")
        self.assertIn("acupointSpots.ts", t)
        self.assertIn("R_PREG_ACUPOINTS", t)

    def test_the_reference_pack_shows_the_three_factors_as_numbers(self):
        t = self.text["reference"]
        sy = CTX.data["treatment/sanyin.json"]
        self.assertIn(f"from {sy['age']['elderly_from_years']} years × {sy['age']['elderly_fraction']}", t)
        self.assertIn(f"light × {sy['severity']['light']}", t)
        self.assertIn("warmth ≥ ", t)
        self.assertIn("少用則浮而外散", t)

    def test_the_citations_pack_says_where_each_quotation_is_used(self):
        t = self.text["citations"]
        line = next(l for l in t.splitlines() if l.startswith("| `suwen-074-1` |"))
        self.assertIn("the book 01-model.md", line)
        used = areas_kb.citation_uses(CTX)
        self.assertTrue(any(w.startswith("diagnosis/patterns.json ") for ws in used.values() for w in ws))
        self.assertTrue(any(w.startswith("treatment/sanyin.json ") for ws in used.values() for w in ws))

    def test_the_glossary_pack_shows_the_name_folding_as_characters(self):
        self.assertIn("乾→干", self.text["glossary"])

    def test_the_interface_pack_holds_every_message_in_both_languages_and_asks_for_the_physician_on_the_notices(self):
        t = self.text["ui"]
        cat = CTX.targets[review.CATALOGS]
        for ns, langs in cat.items():
            self.assertIn(f"## `{ns}` ({len(langs['zh-Hant'])} messages)", t)
            for k in langs["zh-Hant"]:
                self.assertIn(f"| `{k}` |", t)
        self.assertNotIn("**missing**", t)
        self.assertIn("**the physician reviews this namespace too**", t)
        self.assertIn(f"`{CTX.units(review.CATALOGS)['*']}`", t)


class HerbSample(unittest.TestCase):
    """Content review §4.3: at least ten derived herbs of every category, every flagged one, drawn the same way every time."""

    def test_the_sample_has_ten_of_every_category_and_every_flagged_herb(self):
        items = CTX.data["herbs/herbs.json"]["items"]
        derived = [h for h in items if not areas_kb.curated(h)]
        smp = areas_kb.sample(items)
        self.assertEqual(len([h for h in items if areas_kb.curated(h)]), 94)
        for cat in {h["category"] for h in derived}:
            n = len([h for h in derived if h["category"] == cat])
            self.assertGreaterEqual(len([h for h in smp if h["category"] == cat]), min(areas_kb.PER_CATEGORY, n), cat)
        self.assertTrue({h["id"] for h in derived if areas_kb.flagged(h)} <= {h["id"] for h in smp})
        self.assertFalse(any(areas_kb.curated(h) for h in smp))

    def test_the_draw_is_fixed_by_its_seed(self):
        items = CTX.data["herbs/herbs.json"]["items"]
        self.assertEqual([h["id"] for h in areas_kb.sample(items)], [h["id"] for h in areas_kb.sample(items)])
        self.assertNotEqual([h["id"] for h in areas_kb.sample(items)], [h["id"] for h in areas_kb.sample(items, seed="another")])

    def test_the_curated_herbs_and_the_sample_are_the_scope_and_the_pack_shows_the_rules(self):
        p = pack.AREAS["herbs"](CTX)
        (rel, units), = p.scope
        items = CTX.data["herbs/herbs.json"]["items"]
        self.assertEqual(rel, "herbs/herbs.json")
        self.assertEqual(set(units), {h["id"] for h in items if areas_kb.curated(h)} | {h["id"] for h in areas_kb.sample(items)})
        self.assertNotIn("*", units, "a sample does not review the whole file")
        for h in items:
            if h["id"] in units:
                self.assertIn(f"`{h['id']}`", p.markdown)
        self.assertIn("| 寒涼傷陽 — a 寒 herb | 脾.yang -0.25, 腎.yang -0.25 |", p.markdown)
        self.assertIn("`bx.category`", p.markdown)
        self.assertIn("性味", p.markdown)


class Worksheets(unittest.TestCase):
    """The book and the course, chapter by chapter."""

    def test_every_quotation_of_the_book_is_shown_with_its_verified_citation_and_its_explanation(self):
        p = pack.AREAS["book"](CTX)
        pages = CTX.targets[areas_text.BOOK]
        n = sum(len(areas_kb.QUOTE.findall(t)) for t in pages.values())
        self.assertGreaterEqual(n, 40)
        self.assertEqual(p.markdown.count("**not resolved**"), 0)
        self.assertEqual(len([l for l in p.markdown.splitlines() if l.startswith("| ") and "` — " in l]), n)
        for page in pages:
            self.assertIn(f"]({'../../../' + areas_text.BOOK}/{page})", p.markdown)
        self.assertEqual(p.markdown.count("**Chapter checks**"), len(pages) - 1)
        self.assertEqual(p.version, CTX.units(areas_text.BOOK)["*"])

    def test_every_excerpt_of_the_course_has_its_白話_and_every_exercise_its_answer(self):
        p = pack.AREAS["course"](CTX)
        pages = CTX.targets[areas_text.COURSE]
        chapters = [x for x in pages if areas_text.CHAPTER.match(x)]
        self.assertEqual(len(chapters), 22)
        self.assertNotIn("**no 白話**", p.markdown)
        self.assertNotIn("**no answer**", p.markdown)
        excerpts = sum(len(areas_kb.QUOTE.findall(pages[c])) for c in chapters)
        self.assertGreaterEqual(excerpts, 200)
        self.assertEqual(p.markdown.count("**Chapter checks**"), 22)
        self.assertIn("**陰陽** |", p.markdown)

    def test_a_worksheets_skeleton_names_every_page_and_the_whole_text(self):
        for area, target in (("book", areas_text.BOOK), ("course", areas_text.COURSE), ("ui", review.CATALOGS)):
            (rel, units), = pack.AREAS[area](CTX).scope
            self.assertEqual((rel, units), (target, CTX.units(target)), area)


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

    def test_every_new_skeleton_filled_by_the_roles_its_files_need_reviews_every_unit_it_names(self):
        for area in [a for a in pack.AREAS if a not in ("patterns", "red-flags", "safety-rules", "formulas")]:
            scope = pack.AREAS[area](CTX).scope
            roles = sorted({min(g) for rel, units in scope for uid in units for g in review.required_roles(rel, uid)})
            recs = []
            for n, role in enumerate(roles, 1):
                rec = self.filled(area, role)
                rec["id"] = f"REV-2026-{n:04d}"
                recs.append((f"{rec['id']}.yaml", rec))
            result = review.compile_records(recs, CTX.data, CTX.targets)
            self.assertEqual(result["problems"], [], area)
            for rel, units in scope:
                self.assertEqual(result["reviewed_units"].get(rel, set()), set(units), (area, rel))

    def test_the_book_needs_its_linguist_and_its_clinician_and_names_its_version(self):
        rec = self.filled("book", "linguistic")
        self.assertEqual(rec["kb_version"], CTX.units(areas_text.BOOK)["*"])
        alone = review.compile_records([("a.yaml", rec)], CTX.data, CTX.targets)
        self.assertEqual(alone["problems"], [])
        self.assertNotIn(areas_text.BOOK, alone["reviewed_units"])

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

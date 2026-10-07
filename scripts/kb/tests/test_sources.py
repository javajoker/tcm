"""The sources registry (PM-35): every work the data names is registered, the counts are right, and the report is the registry's."""
from __future__ import annotations

import copy
import json
import unittest

from scripts.kb import build_sources
from scripts.kb.common import DATA
from scripts.kb.curated.sources import DOMAINS, SOURCES

from .test_integrity import validate_with


def registry() -> dict:
    return json.loads((DATA / "sources.json").read_text(encoding="utf-8"))


class Registry(unittest.TestCase):
    def test_the_report_is_generated_from_the_registry(self):
        self.assertEqual(build_sources.REPORT.read_text(encoding="utf-8"), build_sources.render(registry()),
                         "docs/kb-sources.md is stale: run python3 -m scripts.kb.build_sources")

    def test_the_committed_registry_is_what_the_build_makes(self):
        committed = registry()
        committed["_meta"].pop("schema")
        self.assertEqual(json.loads(json.dumps(build_sources.build(), ensure_ascii=False)), committed)

    def test_every_quotation_is_counted_once(self):
        citations = json.loads((DATA / "citations.json").read_text(encoding="utf-8"))["items"]
        self.assertEqual(sum(i["quotations"] for i in registry()["items"]), len(citations))
        suwen = next(i for i in registry()["items"] if i["id"] == "suwen")
        self.assertEqual(suwen["quotations"], sum(1 for c in citations if c["book"] == "素問"))

    def test_nothing_is_unresolved_and_every_corpus_path_exists(self):
        r = registry()
        self.assertEqual(r["_meta"]["unresolved"], [])
        self.assertTrue(all(c["exists"] for i in r["items"] for c in i["corpus"]))

    def test_curated_rows_are_consistent(self):
        ids = [s["id"] for s in SOURCES]
        self.assertEqual(len(ids), len(set(ids)))
        for s in SOURCES:
            self.assertTrue(set(s["domains"]) <= set(DOMAINS), s["id"])
            self.assertEqual(s["status"] == "in-corpus", bool(s["book"] or s["lib"]), s["id"])

    def test_the_data_uses_what_the_design_says_it_uses(self):
        drawn = {i["id"] for i in registry()["items"] if i["drawn_on"]}
        # the quotation books, the pulse book, the formula books, the herb sources and the standards
        for sid in ("suwen", "lingshu", "nanjing", "shanghan", "jingui", "binhu-maixue", "hejiju-fang", "chp-2025", "who-istm-2007", "who-acupoints-2008"):
            self.assertIn(sid, drawn)
        # the gap knowledge base v2 closes: the herb property model (PM-36) and the prescription tables (PM-37) rest on the herb classics
        for sid in ("shennong", "bencao-gangmu", "bencao-beiyao", "bencaojing-jizhu", "bencao-mengquan", "depei-bencao", "bencao-xinbian"):
            self.assertIn(sid, drawn)


class Resolution(unittest.TestCase):
    def data(self) -> dict:
        return copy.deepcopy(build_sources.load_data())

    def test_an_unknown_book_is_unresolved(self):
        data = self.data()
        data["formulas/formulas.json"]["items"][0]["source"]["book"] = "不存在之書"
        self.assertIn({"file": "formulas/formulas.json", "value": "不存在之書"}, build_sources.build(data)["_meta"]["unresolved"])

    def test_an_unknown_corpus_path_is_unresolved(self):
        data = self.data()
        data["formulas/formulas.json"]["items"][0]["source"]["repo_path"] = "reference/sources/TCM-Ancient-Books/999-无此书.txt"
        self.assertIn("reference/sources/TCM-Ancient-Books/999-无此书.txt", [u["value"] for u in build_sources.build(data)["_meta"]["unresolved"]])

    def test_a_quotation_counts_for_its_book_wherever_it_is_cited(self):
        data = self.data()
        before = next(i for i in build_sources.build(data)["items"] if i["id"] == "binhu-maixue")["references"].get("treatment/guidance.json", 0)
        quote = next(c["id"] for c in data["citations.json"]["items"] if c["book"] == "瀕湖脈學")
        data["treatment/guidance.json"]["general"]["source"].append(quote)
        after = next(i for i in build_sources.build(data)["items"] if i["id"] == "binhu-maixue")["references"].get("treatment/guidance.json", 0)
        self.assertEqual(after, before + 1)

    def test_the_validator_rejects_an_unresolved_name(self):
        problems = validate_with({"sources.json": lambda d: d["_meta"]["unresolved"].append({"file": "formulas/formulas.json", "value": "不存在之書"})})
        self.assertTrue(any("not in the sources registry" in p for p in problems), problems[:3])

    def test_the_validator_rejects_a_missing_corpus_file(self):
        def m(d):
            d["items"][0]["corpus"][0]["exists"] = False
        self.assertTrue(any("corpus path" in p for p in validate_with({"sources.json": m}, check_sources=True)))


if __name__ == "__main__":
    unittest.main()

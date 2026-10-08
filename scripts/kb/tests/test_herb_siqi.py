"""Every curated herb has the nature (四氣) its cited source states.

The build copies `siqi` from the structured front matter of the TCM-Library entry, the library's summary of the 《中國藥典》2025 sentence
quoted in the same file, and the summary can disagree with the sentence: 生薑 and 菟絲子 were 溫 where the text says 微溫 and 平 (corrected in
curated/herbs.py SIQI_CORRECTIONS). This test reads the sentence itself, so a library update or a correction that disagrees with the cited
text fails the build.
"""
from __future__ import annotations

import json
import re
import unittest

from scripts.kb.common import DATA, ROOT, front_matter, term
from scripts.kb.curated.herbs import EXTRA, OVERLAY, SIQI_CORRECTIONS
from scripts.kb.herb_model import TEMP

HERBS = json.loads((DATA / "herbs" / "herbs.json").read_text(encoding="utf-8"))["items"]
CURATED = {h["id"]: h for h in HERBS if h["status"] == "curated-draft"}
BY_NAME = {h["name"]["zh-Hant"]: h for h in CURATED.values()}

# One nature word; the 大 and 微 forms come first so that 微溫 is not read as 溫.
NATURE = re.compile(r"大寒|微寒|大熱|微溫|寒|熱|溫|涼|平")

# Sources that give a nature for each form instead of one 性味 sentence: herb id → the form the record stands for.
# 地黃: 「鮮地黃：甘、苦，寒 … 生地黃：甘，寒 … 熟地黃：甘，微溫」; the record is 生地黃 (乾地黃) and 熟地黃 has a record of its own.
BY_FORM = {"herb-dihuang": "生地黃"}

# Curated records whose nature differs from the cited text on purpose: herb id → (the nature the record keeps, the reason, for a reviewer).
# None today. A row must still differ from the text — when the source comes to agree, the row is stale and goes.
EXCEPTIONS: dict[str, tuple[str, str]] = {}


def source_text(herb: dict) -> str:
    """The body of the source file the record cites (no front matter), in Traditional script."""
    return term(front_matter((ROOT / herb["source"]["path"]).read_text(encoding="utf-8"))[1])


def stated_nature(herb: dict) -> tuple[str, str]:
    """(the nature, the sentence it is read from): the first 性味 sentence of the source — the Pharmacopoeia's, in 【原文】 — or the form's."""
    form = BY_FORM.get(herb["id"])
    m = re.search(rf"{form}：([^；。]*)" if form else r"性味([^；。]*)", source_text(herb))
    if m is None:
        raise AssertionError(f"{herb['id']}: no {form + '：' if form else '性味'} sentence in {herb['source']['path']}")
    natures = NATURE.findall(m.group(1))
    if len(natures) != 1:
        raise AssertionError(f"{herb['id']}: expected one nature in 「{m.group(0)}」, found {natures}")
    return natures[0], m.group(0)


class CuratedHerbNature(unittest.TestCase):
    def test_every_curated_herb_has_the_nature_its_source_states(self):
        checked = set()
        for h in CURATED.values():
            if h["source"]["repo"] != "TCM-Library":
                continue
            checked.add(h["slug"])
            with self.subTest(herb=h["id"]):
                nature, sentence = stated_nature(h)
                if h["id"] in EXCEPTIONS:
                    kept, _reason = EXCEPTIONS[h["id"]]
                    self.assertNotEqual(kept, nature, f"{h['id']}: the source now says {nature}, as the record does; drop the exception")
                    nature = kept
                self.assertEqual(h["siqi"], [nature], f"{h['id']} {h['name']['zh-Hant']}: siqi {h['siqi']}, but {h['source']['path']} says 「{sentence}」")
                self.assertEqual(h["temperature"], TEMP[nature], f"{h['id']}: the signed warmth follows the nature")
        self.assertEqual(checked, set(OVERLAY), "every row of the curated overlay is checked")

    def test_the_curated_herbs_without_a_library_source_are_the_hand_curated_ones(self):
        # 粳米, 雞子黃, 冰糖 cite no source text (their nature is set by hand and awaits review); any other curated record must cite one
        self.assertEqual({hid for hid, h in CURATED.items() if h["source"]["repo"] != "TCM-Library"}, {f"herb-{x['id']}" for x in EXTRA})

    def test_ginger_and_dodder_seed_follow_the_pharmacopoeia(self):
        # the build used to copy 溫 for both from the front matter
        self.assertEqual((BY_NAME["生薑"]["siqi"], BY_NAME["生薑"]["temperature"]), (["微溫"], 0.5))
        self.assertEqual((BY_NAME["菟絲子"]["siqi"], BY_NAME["菟絲子"]["temperature"]), (["平"], 0.0))
        for name in ("生薑", "菟絲子"):
            self.assertTrue(any("front matter corrected" in n for n in BY_NAME[name]["data_quality"]), f"{name}: the correction is noted on the record")

    def test_the_check_reads_the_sentence_not_the_front_matter(self):
        h = BY_NAME["生薑"]
        fm, _body = front_matter((ROOT / h["source"]["path"]).read_text(encoding="utf-8"))
        self.assertEqual([term(s) for s in fm["conditions"]["siqi"]], SIQI_CORRECTIONS["shengjiang"][0])
        self.assertEqual(stated_nature(h), ("微溫", "性味辛，微溫"))
        self.assertEqual(stated_nature(CURATED["herb-dihuang"]), ("寒", "生地黃：甘，寒"))

    def test_corrections_forms_and_exceptions_name_curated_herbs(self):
        for lib, (stated, corrected) in SIQI_CORRECTIONS.items():
            self.assertIn(f"herb-{lib}", CURATED)
            self.assertNotEqual(stated, corrected, lib)
            self.assertTrue(set(stated + corrected) <= set(TEMP), lib)
        for hid in [*BY_FORM, *EXCEPTIONS]:
            self.assertIn(hid, CURATED)
        for hid, (kept, reason) in EXCEPTIONS.items():
            self.assertIn(kept, TEMP, hid)
            self.assertTrue(reason.strip(), f"{hid}: an exception needs its reason")


if __name__ == "__main__":
    unittest.main()

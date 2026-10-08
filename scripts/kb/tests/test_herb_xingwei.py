"""Every herb has the nature (四氣) and flavours (五味) its cited source states.

The build copies `siqi` and `wuwei` from the structured front matter of the TCM-Library entry, the library's summary of the 《中國藥典》2025
sentence quoted in the same file, and the summary can disagree with the sentence: 生薑 and 菟絲子 were 溫 where the text says 微溫 and 平,
野菊花 寒 where it says 微寒, 虎杖 苦 where it says 微苦 (corrected in curated/herbs.py SIQI_CORRECTIONS and WUWEI_CORRECTIONS). This test
reads the sentence itself, so a library update or a correction that disagrees with the cited text fails the build.
"""
from __future__ import annotations

import json
import re
import unittest

from scripts.kb.common import DATA, ROOT, front_matter, term
from scripts.kb.curated.herbs import EXTRA, OVERLAY, SIQI_CORRECTIONS, WUWEI_CORRECTIONS
from scripts.kb.herb_model import FLAVOR_ELEMENT, TEMP

HERBS = json.loads((DATA / "herbs" / "herbs.json").read_text(encoding="utf-8"))["items"]
BY_ID = {h["id"]: h for h in HERBS}
BY_NAME = {h["name"]["zh-Hant"]: h for h in HERBS}
FROM_LIBRARY = [h for h in HERBS if h["source"]["repo"] == "TCM-Library"]

# One nature word; the 大 and 微 forms come first so that 微溫 is not read as 溫.
NATURE = re.compile(r"大寒|微寒|大熱|微溫|寒|熱|溫|涼|平")

# Sources that give the 性味 of each form instead of one sentence: herb id → the form the record stands for.
# 地黃: 「鮮地黃：甘、苦，寒 … 生地黃：甘，寒 … 熟地黃：甘，微溫」; the record is 生地黃 (乾地黃) and 熟地黃 has a record of its own.
BY_FORM = {"herb-dihuang": "生地黃"}

# Records whose 性味 differs from the cited text on purpose: herb id → (the nature and the flavours the record keeps, the reason, for a
# reviewer). None today. A row must still differ from the text — when the source comes to agree, the row is stale and goes.
EXCEPTIONS: dict[str, tuple[str, list[str], str]] = {}


def stated(herb: dict) -> tuple[str, list[str], str]:
    """(the nature, the flavours as written — 微苦 for a half flavour —, the sentence) in the source file the record cites: its first 性味
    sentence (the Pharmacopoeia's, in 【原文】), or the statement of the form the record stands for."""
    form = BY_FORM.get(herb["id"])
    text = term(front_matter((ROOT / herb["source"]["path"]).read_text(encoding="utf-8"))[1])
    m = re.search(rf"{form}：([^；。]*)" if form else r"性味([^；。]*)", text)
    if m is None:
        raise AssertionError(f"{herb['id']}: no {form + '：' if form else '性味'} sentence in {herb['source']['path']}")
    natures = NATURE.findall(m.group(1))
    if len(natures) != 1:
        raise AssertionError(f"{herb['id']}: expected one nature in 「{m.group(0)}」, found {natures}")
    flavors = [f for f in re.split(r"[、，,\s]+", m.group(1)[: m.group(1).index(natures[0])]) if f]   # 「辛、熱」 (炮薑) has 、 for ，
    return natures[0], flavors, m.group(0)


def written(herb: dict) -> list[str]:
    """The record's flavours as the text writes them: a flavour of weight 0.5 is a 微 one."""
    return [("微" if f["weight"] == 0.5 else "") + f["flavor"] for f in herb["flavors"]]


class HerbXingwei(unittest.TestCase):
    def test_every_herb_has_the_nature_and_flavours_its_source_states(self):
        checked = set()
        for h in FROM_LIBRARY:
            checked.add(h["slug"])
            with self.subTest(herb=h["id"]):
                nature, flavors, sentence = stated(h)
                if h["id"] in EXCEPTIONS:
                    kept_nature, kept_flavors, _reason = EXCEPTIONS[h["id"]]
                    self.assertNotEqual((kept_nature, kept_flavors), (nature, flavors), f"{h['id']}: the source now says what the record keeps; drop the exception")
                    nature, flavors = kept_nature, kept_flavors
                where = f"{h['id']} {h['name']['zh-Hant']}: {h['source']['path']} says 「{sentence}」"
                self.assertEqual(h["siqi"], [nature], where)
                self.assertEqual(h["temperature"], TEMP[nature], f"{where}; the signed warmth follows the nature")
                self.assertEqual(written(h), flavors, f"{where}; the flavours, in its order")
        self.assertTrue(set(OVERLAY) <= checked, "every row of the curated overlay is checked")
        self.assertEqual(len(checked), len(HERBS) - len(EXTRA), "every herb but the hand-curated ones is checked")

    def test_the_herbs_without_a_library_source_are_the_hand_curated_ones(self):
        # 粳米, 雞子黃, 冰糖 cite no source text (their nature is set by hand and awaits review); every other record must cite one
        self.assertEqual({h["id"] for h in HERBS if h["source"]["repo"] != "TCM-Library"}, {f"herb-{x['id']}" for x in EXTRA})

    def test_the_corrected_records_follow_the_pharmacopoeia(self):
        # the build used to copy the front matter: 溫 for 生薑 and 菟絲子, 寒 for 野菊花, 涼 for 溪黃草, 苦 for 虎杖, 辛、苦 for 炮薑, 甘、苦 for 地黃
        self.assertEqual((BY_NAME["生薑"]["siqi"], BY_NAME["生薑"]["temperature"]), (["微溫"], 0.5))
        self.assertEqual((BY_NAME["菟絲子"]["siqi"], BY_NAME["菟絲子"]["temperature"]), (["平"], 0.0))
        self.assertEqual((BY_NAME["野菊花"]["siqi"], BY_NAME["野菊花"]["temperature"]), (["微寒"], -1.0))
        self.assertEqual((BY_NAME["溪黃草"]["siqi"], BY_NAME["溪黃草"]["temperature"]), (["寒"], -2.0))
        self.assertEqual(BY_NAME["虎杖"]["flavors"], [{"element": "火", "flavor": "苦", "weight": 0.5}])
        self.assertEqual(written(BY_NAME["炮薑"]), ["辛"])
        self.assertEqual(written(BY_NAME["地黃"]), ["甘"])
        for lib in {*SIQI_CORRECTIONS, *WUWEI_CORRECTIONS}:
            self.assertTrue(any("front matter corrected" in n for n in BY_ID[f"herb-{lib}"]["data_quality"]), f"{lib}: the correction is noted on the record")

    def test_the_check_reads_the_sentence_not_the_front_matter(self):
        h = BY_NAME["生薑"]
        fm, _body = front_matter((ROOT / h["source"]["path"]).read_text(encoding="utf-8"))
        self.assertEqual([term(s) for s in fm["conditions"]["siqi"]], SIQI_CORRECTIONS["shengjiang"][0])
        self.assertEqual(stated(h), ("微溫", ["辛"], "性味辛，微溫"))
        self.assertEqual(stated(BY_ID["herb-dihuang"]), ("寒", ["甘"], "生地黃：甘，寒"))
        self.assertEqual(stated(BY_ID["herb-paojiang"]), ("熱", ["辛"], "性味辛、熱"))

    def test_corrections_forms_and_exceptions_name_records_and_known_values(self):
        libs = {h["slug"] for h in FROM_LIBRARY}
        flavors = {p + f for f in FLAVOR_ELEMENT for p in ("", "微")}
        for table, known in ((SIQI_CORRECTIONS, set(TEMP)), (WUWEI_CORRECTIONS, flavors)):
            for lib, (front, text) in table.items():
                self.assertIn(lib, libs)
                self.assertNotEqual(front, text, lib)
                self.assertTrue(set(text) <= known, lib)
        for hid in [*BY_FORM, *EXCEPTIONS]:
            self.assertIn(hid, BY_ID)
        for hid, (nature, kept, reason) in EXCEPTIONS.items():
            self.assertIn(nature, TEMP, hid)
            self.assertTrue(set(kept) <= flavors, hid)
            self.assertTrue(reason.strip(), f"{hid}: an exception needs its reason")

    def test_ginger_is_written_薑_in_herb_names(self):
        # 生姜 → 生薑 and 干姜 → 乾薑 come from OpenCC's phrases; 炮薑 and 薑半夏 from build_herbs.NAME_FIX
        self.assertEqual([h["name"]["zh-Hant"] for h in HERBS if "姜" in h["name"]["zh-Hant"]], [])
        self.assertIn("炮薑", BY_NAME)
        self.assertIn("薑半夏", BY_NAME)


if __name__ == "__main__":
    unittest.main()

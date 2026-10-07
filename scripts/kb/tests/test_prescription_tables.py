"""The prescription model's tables (PM-37): 七情 read from 《本草綱目》, processing from 《本草蒙筌》, dose bands from verified passages."""
from __future__ import annotations

import json
import unittest

from scripts.kb import build_prescription as bp
from scripts.kb.common import DATA, norm_ws, read_book
from scripts.kb.curated import prescription as cp

from .test_integrity import validate_with


def load(rel: str) -> dict:
    return json.loads((DATA / rel).read_text(encoding="utf-8"))


HERBS = {h["id"]: h for h in load("herbs/herbs.json")["items"]}
INDEX = load("herbs/herb-index.json")["index"]
PAIRS = load("herbs/pairings.json")


def pair(herb: str, typ: str, other: str) -> dict | None:
    return next((p for p in PAIRS["items"] if p["herb"] == INDEX[herb] and p["type"] == typ and p["other"] == INDEX[other]), None)


class Pairings(unittest.TestCase):
    def test_the_classical_examples_are_read_from_the_table(self):
        self.assertIsNotNone(pair("半夏", "相畏", "生薑"))           # 半夏畏生薑: the example of 本草經集注
        self.assertIsNotNone(pair("人參", "相使", "茯苓"))           # 茯苓為人參之使 (四君子湯)
        self.assertIsNotNone(pair("柴胡", "相使", "半夏"))           # 半夏為柴胡之使 (小柴胡湯)
        self.assertIsNotNone(pair("人參", "相畏", "五靈脂"))         # 人參畏五靈脂 (the 十九畏 pair, read as the classical 畏)

    def test_every_derived_pairing_keeps_the_entry_it_was_read_from_and_the_entry_is_in_the_book(self):
        text = norm_ws(read_book(cp.PAIRING_BOOK))
        derived = [p for p in PAIRS["items"] if p["status"] == "derived"]
        self.assertGreater(len(derived), 200)
        for p in derived:
            self.assertIn(p["source"]["entry_zh_hans"], text, p["id"])

    def test_the_textbook_examples_of_xiangxu_are_marked_unverified(self):
        xu = [p for p in PAIRS["items"] if p["type"] == "相須"]
        self.assertEqual(len(xu), len(cp.XIANGXU))
        self.assertTrue(all(p["status"] == "curated-draft" and "unverified" in p["source"]["note"] for p in xu))

    def test_names_the_knowledge_base_lacks_are_skipped_never_guessed(self):
        # 术 (白朮 or 蒼朮?) and the truncated 黄 are ambiguous: no pairing is made from them
        self.assertIsNone(cp.CLASSICAL_NAMES["术"])
        resolve = bp.resolver(INDEX)
        self.assertIsNone(resolve("术"))
        self.assertIsNone(resolve("马蔺"))
        self.assertEqual(resolve("干姜"), INDEX["乾薑"])
        self.assertGreater(PAIRS["_meta"]["names_not_in_the_knowledge_base"], 0)

    def test_the_clause_grammar(self):
        cases = {"茯苓、马蔺为之使": "相使", "得酒良": "相使", "恶卤咸、溲疏": "相惡", "畏五灵脂": "相畏", "反藜芦": "相反"}
        import re
        for clause, typ in cases.items():
            self.assertEqual(next(t for pat, t in cp.CLAUSES if re.match(pat, clause)), typ, clause)
        self.assertFalse(any(re.match(pat, "忌猪肉") for pat, _ in cp.CLAUSES))
        self.assertFalse(any(re.match(pat, "伏砒") for pat, _ in cp.CLAUSES))

    def test_the_build_is_deterministic(self):
        self.assertEqual(bp.build_pairings(INDEX), bp.build_pairings(INDEX))
        committed = load("herbs/pairings.json")
        committed["_meta"].pop("schema")
        self.assertEqual(json.loads(json.dumps(bp.build_pairings(INDEX), ensure_ascii=False)), committed)


class Yinjing(unittest.TestCase):
    def test_the_table_of_the_twelve_channels(self):
        y = load("herbs/yinjing.json")["channels"]
        self.assertEqual(len(y), 12)
        by_organ = {c["organ"]: c for c in y}
        self.assertIn(INDEX["升麻"], by_organ["脾"]["herbs"])            # 足太陰脾（升麻蒼朮葛根白芍）
        self.assertIn(INDEX["柴胡"], by_organ["膽"]["herbs"])            # 足少陽膽（柴胡青皮）
        self.assertIn(INDEX["桔梗"], by_organ["肺"]["herbs"])
        self.assertEqual(by_organ["小腸"]["unread"], "本")                # 藁本, whose first character the source lost
        text = norm_ws(read_book(cp.PAIRING_BOOK))
        self.assertTrue(all(c["entry_zh_hans"] in text for c in y))

    def test_the_validator_rejects_an_entry_not_in_the_book(self):
        problems = validate_with({"herbs/yinjing.json": lambda d: d["channels"][0].update(entry_zh_hans="手少阴心（人参）")}, check_sources=True)
        self.assertTrue(any("its entry is not in 本草綱目" in p for p in problems), problems[:3])


class ProcessingAndBands(unittest.TestCase):
    def test_every_method_rests_on_the_rhyme_or_says_it_is_unverified(self):
        for m in load("herbs/processing.json")["methods"]:
            self.assertTrue(m["citation"] is not None or "unverified" in m["says"], m["id"])

    def test_the_dose_bands_are_the_five_verified_passages(self):
        bands = load("herbs/dose-bands.json")["items"]
        self.assertEqual({b["name"] for b in bands}, {"葛根", "人參", "升麻", "蘇木", "紅花"})
        cites = {c["id"] for c in load("citations.json")["items"]}
        self.assertTrue(all(b["citation"] in cites for b in bands))

    def test_the_parameters(self):
        p = load("treatment/prescription.json")["params"]
        self.assertEqual(p, cp.PARAMS)
        self.assertLess(p["bands"]["small_below"], 1)
        self.assertGreater(p["bands"]["large_above"], 1)


class Sanyin(unittest.TestCase):
    def test_each_adaptation_rests_on_a_verified_passage(self):
        sy = load("treatment/sanyin.json")
        cites = {c["id"]: c for c in load("citations.json")["items"]}
        for cid in (sy["severity"]["citation"], sy["age"]["citation"], sy["season_citation"], sy["region"]["citation"], sy["general"]["citation"]):
            self.assertTrue(cites[cid]["verified"], cid)
        self.assertIn("用寒遠寒", cites[sy["season_citation"]]["quote_zh_hant"])
        self.assertIn("能毒者以厚藥", cites[sy["severity"]["citation"]]["quote_zh_hant"])

    def test_the_four_seasons_of_the_rule_and_none_for_the_long_summer(self):
        sy = load("treatment/sanyin.json")
        self.assertEqual(sorted(s["element"] for s in sy["season"]), sorted(["木", "火", "金", "水"]))
        self.assertTrue(sy["season_spares_jun"])

    def test_no_factor_raises_an_amount_except_severity(self):
        sy = load("treatment/sanyin.json")
        self.assertTrue(all(c["factor"] <= 1 for c in sy["constitution"]) and all(s["factor"] <= 1 for s in sy["season"]))
        self.assertEqual(sy["region"]["rules"], [], "因地 is off until a region pack states a rule")

    def test_the_directions_of_the_patterns(self):
        m = {x["pattern"]: x for x in load("treatment/mechanisms.json")["items"]}
        self.assertEqual(m["SP3"]["direction"], "升")
        self.assertEqual(m["LG1"]["direction"], "收")
        self.assertTrue(all(x["sign"] == (1 if x["direction"] in ("升", "宣") else -1) for x in m.values()))


class Corruptions(unittest.TestCase):
    def assertReported(self, mutations: dict, fragment: str, check_sources: bool = False):
        problems = validate_with(mutations, check_sources=check_sources)
        self.assertTrue(any(fragment in p for p in problems), f"expected {fragment!r}, got {problems[:4]}")

    def test_a_pairing_with_an_unknown_herb(self):
        self.assertReported({"herbs/pairings.json": lambda d: d["items"][0].update(other="herb-nope")}, "two different herbs")

    def test_a_pairing_listed_twice(self):
        self.assertReported({"herbs/pairings.json": lambda d: d["items"].append(dict(d["items"][0]))}, "listed twice")

    def test_a_derived_pairing_whose_entry_is_not_in_the_book(self):
        def m(d):
            p = next(p for p in d["items"] if p["status"] == "derived")
            p["source"]["entry_zh_hans"] = "人参（不存在之药为之使。）"
        self.assertReported({"herbs/pairings.json": m}, "not in 本草綱目", check_sources=True)

    def test_a_processing_word_in_two_methods(self):
        self.assertReported({"herbs/processing.json": lambda d: d["methods"][1]["words"].append(d["methods"][0]["words"][0])}, "belongs to two methods")

    def test_a_dose_band_with_an_invalid_target(self):
        self.assertReported({"herbs/dose-bands.json": lambda d: d["items"][0]["large"].update(effects_add={"nowhere.qi": 1})}, "nowhere.qi")   # the schema rejects it first

    def test_a_constitution_factor_that_raises(self):
        self.assertReported({"treatment/sanyin.json": lambda d: d["constitution"][0].update(factor=1.3)}, "a factor that raises")

    def test_a_mechanism_with_the_wrong_sign(self):
        self.assertReported({"treatment/mechanisms.json": lambda d: d["items"][0].update(sign=-1)}, "has the sign")

    def test_bands_on_the_wrong_side_of_the_typical_dose(self):
        self.assertReported({"treatment/prescription.json": lambda d: d["params"]["bands"].update(small_below=1.2)}, "dose bands must lie on each side")


if __name__ == "__main__":
    unittest.main()

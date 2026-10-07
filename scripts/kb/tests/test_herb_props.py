"""The herb property model v2 (PM-36): textbook values of well-known herbs, the rules one by one, and properties over every herb."""
from __future__ import annotations

import json
import unittest

from scripts.kb import herb_props as hp
from scripts.kb.common import DATA

HERBS = json.loads((DATA / "herbs" / "herbs.json").read_text(encoding="utf-8"))
BY_NAME = {h["name"]["zh-Hant"]: h for h in HERBS["items"]}
PHASE = dict(zip(hp.PHASES, range(5)))


def props(name: str) -> dict:
    return BY_NAME[name]["props"]


def leading_phase(name: str) -> str:
    fp = props(name)["five_phase"]
    return hp.PHASES[max(range(5), key=lambda i: fp[i])]


class TextbookHerbs(unittest.TestCase):
    """What a textbook says of each, in the model's terms."""

    def test_rhubarb_bitter_cold_purging_and_descending(self):
        p = props("大黃")
        self.assertEqual(p["bu_xie"], "瀉")
        self.assertLess(p["direction"], -0.5)
        self.assertLess(p["yinyang"], -0.5)
        self.assertEqual(leading_phase("大黃"), "火")       # 苦 → 火

    def test_ephedra_acrid_warm_dispersing_and_rising(self):
        p = props("麻黃")
        self.assertGreater(p["direction"], 0.3)
        self.assertGreater(p["yinyang"], 0.2)
        self.assertEqual(p["run_zao"], "燥")
        self.assertEqual(leading_phase("麻黃"), "金")       # 辛, 歸肺

    def test_aconite_toxic_hot_and_tonifying_the_fire(self):
        p = props("附子")
        self.assertEqual(p["toxicity"], "有毒")
        self.assertEqual(p["bu_xie"], "補")
        self.assertGreater(p["yinyang"], 0.6)

    def test_ginseng_sweet_tonic_of_qi_and_earth(self):
        p = props("人參")
        self.assertEqual((p["bu_xie"], p["qi_xue"], p["toxicity"]), ("補", "氣", "無毒"))
        self.assertEqual(leading_phase("人參"), "土")

    def test_coptis_bitter_cold_drying(self):
        p = props("黃連")
        self.assertEqual((p["bu_xie"], p["run_zao"]), ("瀉", "燥"))
        self.assertLess(p["yinyang"], -0.5)
        self.assertEqual(leading_phase("黃連"), "火")

    def test_rehmannia_prepared_moistening_tonic_of_blood(self):
        p = props("熟地黃")
        self.assertEqual((p["bu_xie"], p["run_zao"], p["qi_xue"]), ("補", "潤", "血"))

    def test_the_falling_flower_and_the_rising_seed(self):
        # 諸花皆升，旋覆獨降；諸子皆降，蔓荊獨升
        self.assertLess(props("旋覆花")["direction"], -0.2)
        self.assertGreater(props("蔓荊子")["direction"], 0.2)
        self.assertGreater(props("菊花")["direction"], 0.2)            # a flower that rises, by the rules alone
        self.assertLess(props("酸棗仁")["direction"], -0.2)            # a seed that settles, by the rules alone

    def test_platycodon_carries_upward_and_achyranthes_leads_downward(self):
        self.assertGreater(props("桔梗")["direction"], 0.4)
        self.assertLess(props("牛膝")["direction"], -0.4)

    def test_chuanxiong_is_the_qi_herb_within_the_blood(self):
        self.assertEqual(props("川芎")["qi_xue"], "兼")                # 活血行氣: 血中氣藥

    def test_gypsum_clears_the_qi_level_and_settles(self):
        p = props("石膏")
        self.assertEqual((p["bu_xie"], p["qi_xue"]), ("瀉", "氣"))
        self.assertLess(p["direction"], 0)
        self.assertEqual(p["run_zao"], "平")                            # 收濕斂瘡 is an external use

    def test_pinellia_toxic_and_drying(self):
        p = props("半夏")
        self.assertEqual((p["toxicity"], p["run_zao"]), ("有毒", "燥"))

    def test_dried_ginger_warms_without_tonifying_or_purging(self):
        self.assertEqual(props("乾薑")["bu_xie"], "平")


class Rules(unittest.TestCase):
    def test_toxicity_grades_from_the_property_sentence(self):
        self.assertEqual(hp.toxicity("性味苦，寒；有大毒。", None), ("大毒", ["tox.text"]))
        self.assertEqual(hp.toxicity("辛，温；有小毒。", None), ("小毒", ["tox.text"]))
        self.assertEqual(hp.toxicity("辛，热；有毒。", None), ("有毒", ["tox.text"]))
        self.assertEqual(hp.toxicity("甘，平。", None), ("無毒", ["tox.text"]))
        self.assertEqual(hp.toxicity("甘，平。", True), ("有毒", ["tox.curated"]))
        self.assertEqual(hp.toxicity("辛，热；有毒。", False), ("無毒", ["tox.curated"]))

    def test_the_part_class_is_the_head_of_the_text(self):
        cases = {"根莖和葉柄殘基": "根莖", "帶葉莖枝": "花葉", "外層果皮": "根莖", "成熟果實": "子實", "礦石": "重", "花蕾": "花葉", "腹甲及背甲": "重", "柱頭": "根莖"}
        for text, cls in cases.items():
            self.assertEqual(hp.part_class(text), cls, text)
        self.assertIsNone(hp.part_class(None))

    def test_warming_herbs_are_tonics_only_when_they_tonify_the_fire(self):
        self.assertEqual(hp.bu_xie("溫裡藥", ["回陽救逆", "補火助陽"])[0], "補")
        self.assertEqual(hp.bu_xie("溫裡藥", ["散寒止痛", "降逆止嘔", "助陽止瀉"])[0], "平")

    def test_both_qi_and_blood_the_first_function_decides(self):
        self.assertEqual(hp.qi_xue("補虛藥", ["大補元氣", "生津養血"], "平")[0], "氣")
        self.assertEqual(hp.qi_xue("補虛藥", ["補血活血", "行氣"], "平")[0], "血")
        self.assertEqual(hp.qi_xue("活血化瘀藥", ["活血行氣"], "平")[0], "兼")

    def test_the_texture_decides_only_when_nothing_else_does(self):
        self.assertEqual(hp.qi_xue("化濕藥", ["化濕"], "燥"), ("氣", ["qx.texture"]))
        self.assertEqual(hp.qi_xue("清熱藥", ["清熱"], "平"), (None, []))

    def test_the_overlay_wins_and_says_so(self):
        d, rules = hp.direction("桔梗", "化痰止咳平喘藥", ["宣肺"], [{"flavor": "苦", "weight": 1.0}], 0.0, "根")
        self.assertEqual((d, rules), (hp.DIRECTION_OVERLAY["桔梗"], ["dir.overlay"]))

    def test_sour_and_salty_never_rise_cold_never_floats(self):
        # 酸鹹無升，寒無浮: with nothing but taste and nature, a sour-salty cold herb points down, an acrid-sweet hot one up
        down, _ = hp.direction("—", "", [], [{"flavor": "酸", "weight": 1.0}, {"flavor": "鹹", "weight": 1.0}], -2.0, None)
        up, _ = hp.direction("—", "", [], [{"flavor": "辛", "weight": 1.0}, {"flavor": "甘", "weight": 1.0}], 2.0, None)
        self.assertLess(down, 0)
        self.assertGreater(up, 0)

    def test_tropism_weighs_the_first_channel_most_and_sums_to_one(self):
        t = hp.tropism(["脾", "肺", "心"])
        self.assertGreater(t["脾"], t["肺"])
        self.assertGreater(t["肺"], t["心"])
        self.assertAlmostEqual(sum(t.values()), 1.0, places=9)

    def test_every_rule_names_a_known_quotation_or_none(self):
        cites = {c["id"] for c in json.loads((DATA / "citations.json").read_text(encoding="utf-8"))["items"]}
        for rid, (_says, cit) in hp.RULES.items():
            self.assertTrue(cit is None or cit in cites, rid)


class EveryHerb(unittest.TestCase):
    def test_ranges_shares_and_consistency(self):
        for h in HERBS["items"]:
            p = h["props"]
            self.assertTrue(-1 <= p["yinyang"] <= 1 and -1 <= p["direction"] <= 1, h["id"])
            if p["five_phase"] is not None:
                self.assertAlmostEqual(sum(p["five_phase"]), 1.0, places=6)
                self.assertTrue(all(0 <= x <= 1 for x in p["five_phase"]), h["id"])
            self.assertEqual(set(p["tropism"]), set(h["organs"]), h["id"])
            self.assertEqual(h["toxic"], p["toxicity"] != "無毒", h["id"])
            self.assertTrue(all(r in hp.RULES for rs in h["props_rules"].values() for r in rs), h["id"])

    def test_the_derivation_is_deterministic(self):
        h = BY_NAME["當歸"]
        args = dict(name="當歸", category=h["category"], functions=h["functions"], flavors=h["flavors"], temperature=h["temperature"], organs=h["organs"],
                    tags=h["tags"], part=h["props"]["part"], property_sentence="", curated_toxic=None)
        self.assertEqual(hp.derive(**args), hp.derive(**args))
        self.assertEqual(hp.derive(**args)[0], h["props"])

    def test_the_spread_is_plausible(self):
        items = HERBS["items"]
        down = sum(1 for h in items if h["props"]["direction"] < -0.2)
        up = sum(1 for h in items if h["props"]["direction"] > 0.2)
        self.assertGreater(down, up)                                          # most herbs clear, drain, settle or purge
        self.assertGreater(up, 40)
        tonics = [h for h in items if h["category"] == "補虛藥"]
        self.assertTrue(all(h["props"]["bu_xie"] == "補" for h in tonics))
        self.assertEqual(sum(1 for h in items if h["props"]["toxicity"] == "大毒"), 17)      # the Pharmacopoeia's 有大毒 herbs

    def test_the_conventions_are_written_with_the_data(self):
        c = HERBS["_meta"]["conventions"]["props"]
        self.assertEqual(c["params"], hp.PARAMS)
        self.assertEqual(set(c["rules"]), set(hp.RULES))


if __name__ == "__main__":
    unittest.main()

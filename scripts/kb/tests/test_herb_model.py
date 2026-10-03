"""The rule set that derives herb attributes (herb_model.py) behaves as documented (K-03)."""
from __future__ import annotations

import unittest

from scripts.kb import herb_model as hm


class Temperature(unittest.TestCase):
    def test_signed_warmth_and_average(self):
        self.assertEqual(hm.parse_temps(["大寒"]), -3.0)
        self.assertEqual(hm.parse_temps(["溫"]), 1.0)
        self.assertEqual(hm.parse_temps(["寒", "溫"]), -0.5)
        self.assertEqual(hm.parse_temps(["unknown"]), 0.0)


class Flavors(unittest.TestCase):
    def test_micro_flavour_halves_and_temperature_words_are_dropped(self):
        flavors, notes = hm.parse_flavors(["辛", "微苦", "溫", "怪"])
        self.assertEqual(flavors, [{"flavor": "辛", "weight": 1.0}, {"flavor": "苦", "weight": 0.5}])
        self.assertEqual(len(notes), 2)

    def test_five_phase_of_flavours(self):
        self.assertEqual([hm.FLAVOR_ELEMENT[f] for f in "酸苦甘辛鹹"], ["木", "火", "土", "金", "水"])


class Effects(unittest.TestCase):
    def test_qi_tonic_raises_qi_of_its_zang(self):
        eff = hm.derive_effects(["补气", "健脾"], ["脾", "肺", "胃"])
        self.assertGreater(eff["脾.qi"], 0)
        self.assertGreater(eff["肺.qi"], 0)

    def test_heat_clearing_lowers_fire(self):
        self.assertLess(hm.derive_effects(["清热泻火"], ["心"])["liuxie.火"], 0)

    def test_effects_are_clamped(self):
        eff = hm.derive_effects(["补气", "益气", "大补元气", "补中益气", "健脾益气", "升阳举陷", "健脾", "补脾"], ["脾"])
        self.assertTrue(all(abs(v) <= 1.5 for v in eff.values()))

    def test_unknown_functions_give_no_effect(self):
        self.assertEqual(hm.derive_effects(["毫無關係"], ["脾"]), {})


class Harms(unittest.TestCase):
    def test_bitter_cold_burdens_spleen_and_kidney_yang(self):
        h = hm.derive_harms(-2.0, [{"flavor": "苦", "weight": 1.0}], [], ["胃"])
        self.assertLess(h["脾.yang"], 0)
        self.assertLess(h["腎.yang"], 0)
        self.assertLess(h["脾.qi"], 0)

    def test_acrid_hot_burdens_yin(self):
        h = hm.derive_harms(2.0, [{"flavor": "辛", "weight": 1.0}], [], ["肝"])
        self.assertLess(h["腎.yin"], 0)
        self.assertLess(h["肝.yin"], 0)

    def test_tag_burdens(self):
        h = hm.derive_harms(0.0, [], ["滋膩", "活血", "甘壅"], ["脾"])
        self.assertLess(h["脾.qi"], 0)
        self.assertLess(h["肝.blood"], 0)
        self.assertGreater(h["liuxie.濕"], 0)

    def test_neutral_herb_has_no_burden(self):
        self.assertEqual(hm.derive_harms(0.0, [{"flavor": "甘", "weight": 1.0}], [], ["脾"]), {})


class PregnancyAndToxicity(unittest.TestCase):
    def test_note_text_wins_over_category(self):
        self.assertEqual(hm.pregnancy_level("孕妇禁用", "补虚药", None), "avoid")
        self.assertEqual(hm.pregnancy_level("孕妇慎用", "补虚药", None), "caution")

    def test_category_floor_and_default(self):
        self.assertEqual(hm.pregnancy_level("", "活血化瘀药", None), "caution")
        self.assertEqual(hm.pregnancy_level("", "补虚药", None), "ok-unreviewed")

    def test_curated_value_wins(self):
        self.assertEqual(hm.pregnancy_level("孕妇禁用", "活血化瘀药", "ok"), "ok")

    def test_toxicity_from_sentence_or_curation(self):
        self.assertTrue(hm.is_toxic("性味 辛，有毒", None))
        self.assertFalse(hm.is_toxic("性味 甘", None))
        self.assertFalse(hm.is_toxic("有毒", False))
        self.assertTrue(hm.is_toxic("甘", True))


if __name__ == "__main__":
    unittest.main()

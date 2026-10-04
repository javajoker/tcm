"""The city list of the birth-place picker (K-10)."""
from __future__ import annotations

import csv
import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from scripts.kb import build_geo, geonames_extract, oracle
from scripts.kb.common import ROOT


class Cities(unittest.TestCase):
    def setUp(self):
        self.doc = oracle.load("geo/cities.json")
        self.items = self.doc["items"]

    def test_every_taiwan_hong_kong_and_macau_place_of_the_extract_is_in(self):
        with (ROOT / "reference" / "geonames" / "cities-extract.tsv").open(encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh, delimiter="\t"))
        want = {int(r["geonameid"]) for r in rows if r["country"] in ("TW", "HK", "MO")}
        self.assertEqual(want - {c["id"] for c in self.items}, set())
        self.assertGreaterEqual(len(want), 200)

    def test_the_longitude_is_near_the_meridian_of_the_time_zone(self):
        """A longitude and a zone that disagree by more than ~40° would put the hour pillar hours off (China, with one zone, is the widest case: Ürümqi is 32° west of 120°)."""
        for c in self.items:
            offset = ZoneInfo(c["tz"]).utcoffset(datetime(2026, 1, 1)).total_seconds() / 3600
            with self.subTest(c["en"], cc=c["cc"]):
                self.assertLess(abs(c["lon"] - offset * 15), 40, f"{c['en']}: lon {c['lon']} vs zone {c['tz']}")

    def test_chinese_names_are_traditional_where_the_data_has_one(self):
        by = {(c["cc"], c["en"]): c for c in self.items}
        self.assertEqual(by[("TW", "Taipei")]["zh"], "臺北")
        self.assertEqual(by[("CN", "Guangzhou")]["zh"], "廣州")
        self.assertIn("广州", by[("CN", "Guangzhou")]["alt_hans"])                # the simplified form is kept for the search
        self.assertEqual(by[("TW", "Chiayi City")]["zh"], "嘉義市")           # the English name says City, so the 市 stays
        self.assertEqual(by[("JP", "Hiroshima")]["zh"], "廣島")
        self.assertTrue(all("zh" in c for c in self.items if c["cc"] in ("TW", "MO")), "every Taiwan and Macau place has a Chinese name")

    def test_the_two_suzhou_are_two_cities(self):
        names = {c["zh"] for c in self.items if c["en"] == "Suzhou"}
        self.assertEqual(names, {"蘇州", "宿州"})

    def test_the_name_choice_prefers_the_form_most_alternates_agree_on(self):
        self.assertEqual(build_geo.best_zh(["台北", "台北市", "臺北市"], "Taipei"), "臺北")
        self.assertEqual(build_geo.best_zh(["桃園區", "桃園市"], "Taoyuan"), "桃園")
        self.assertIsNone(build_geo.best_zh(["Seoul"], "Seoul"))
        self.assertEqual(build_geo.strip_suffix("嘉義市", "Chiayi City"), "嘉義市")
        self.assertEqual(build_geo.strip_suffix("市", "X"), "市")

    def test_the_data_is_what_the_extract_builds(self):
        text = (ROOT / "reference" / "geonames" / "cities-extract.tsv").read_text(encoding="utf-8")
        self.assertTrue(text.startswith("\t".join(geonames_extract.COLUMNS)))
        self.assertEqual(len(build_geo.build()), len(self.items))

    def test_the_size_budget_of_the_chunk(self):
        import gzip
        import json
        raw = json.dumps(self.doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.assertLess(len(gzip.compress(raw)), 25 * 1024)


if __name__ == "__main__":
    unittest.main()

"""The Simplified → Traditional conversion of the sources (scripts/kb/common.py `tw`): OpenCC's Taiwan *phrase* table is written for software text, so the TCM
post-fixes must hold. Each case below was a real defect or a near miss."""
import unittest

from scripts.kb.common import tw


class TraditionalConversion(unittest.TestCase):
    def test_motion_of_the_five_periods_is_not_an_execution(self):
        # 《素問》五運行大論 was stored as 五執行大論 until the post-fix existed (found by the Simplified-Chinese review sheet)
        self.assertEqual(tw("五运行大论"), "五運行大論")
        self.assertEqual(tw("天地之气运行"), "天地之氣運行")

    def test_circulation_is_not_a_loop(self):
        self.assertEqual(tw("血液循环"), "血液循環")

    def test_taiwan_orthography_post_fixes_still_apply(self):
        self.assertEqual(tw("表里"), "表裡")
        self.assertEqual(tw("阴阳"), "陰陽")

    def test_no_stored_text_contains_the_software_senses(self):
        import json
        from pathlib import Path
        data = Path(__file__).resolve().parents[3] / "data"
        bad = []
        for p in sorted(data.rglob("*.json")):
            if "schema" in p.relative_to(data).parts:
                continue
            text = p.read_text(encoding="utf-8")
            bad += [f"{p.name}: {w}" for w in ("執行", "迴圈") if w in text]
        self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()

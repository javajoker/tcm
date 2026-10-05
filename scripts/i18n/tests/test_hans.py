"""The Simplified Chinese display dictionary and catalogues (docs/post-mvp/design/simplified-chinese.md §5, §6)."""
import json
import re
import unittest

from scripts.i18n import build_hans, hans

CONV = hans.Converter()
PLACEHOLDER = re.compile(r"\{[A-Za-z0-9_]+\}|</?[a-z]+>")


class KnownAnswers(unittest.TestCase):
    """The table of the design (§4) and the exceptions the review sheet found. A change here is a change of what readers see."""

    def check(self, trad: str, simp: str) -> None:
        self.assertEqual(CONV.convert(trad).text, simp, trad)

    def test_what_the_converter_gets_right(self):
        for trad, simp in [("設定", "设置"), ("儲存", "保存"), ("匯出", "导出"), ("搜尋", "搜索"), ("乾薑", "干姜"), ("炮製", "炮制"), ("五臟", "五脏"), ("痠痛", "酸痛"),
                           ("表裡", "表里"), ("鬱結", "郁结"), ("瀉下", "泻下"), ("濕熱", "湿热"), ("附著", "附着"), ("痺", "痹"), ("乾坤", "乾坤"), ("上顎", "上腭")]:
            self.check(trad, simp)

    def test_what_the_overrides_fix(self):
        for trad, simp in [("介面", "界面"), ("預設", "默认"), ("離線", "离线"), ("正中線上", "正中线上"), ("肚臍連線的中點", "肚脐连线的中点"), ("複製", "复制"), ("回饋", "反馈"),
                           ("進階", "进阶"), ("基本資料", "基本资料"), ("資料來源", "资料来源"), ("紀錄", "记录"), ("帳號", "账号"), ("五運行大論", "五运行大论"), ("功益著", "功益著"),
                           ("則剛木闢著", "则刚木辟著"), ("文字大小", "文字大小")]:
            self.check(trad, simp)

    def test_the_longest_phrase_wins_inside_a_longer_string(self):
        self.check("資料品質係數", "数据质量系数")
        self.assertEqual(CONV.convert("以較低的資料品質係數進入計算").text, "以较低的数据质量系数进入计算")

    def test_precedence_key_then_keep_then_exact_then_source_then_phrases(self):
        c = hans.Converter({"phrases": {"介面": {"to": "界面", "reason": "x"}}, "exact": {"介面設計": {"to": "界面设计！", "reason": "x"}},
                            "keys": {"k": {"to": "按键", "reason": "x"}}, "keep": {"保留": {"reason": "x"}}})
        self.assertEqual(c.convert("介面", key="k"), hans.Result("按键", "key"))
        self.assertEqual(c.convert("保留"), hans.Result("保留", "keep"))
        self.assertEqual(c.convert("介面設計"), hans.Result("界面设计！", "exact"))
        self.assertEqual(c.convert("介面設計", source="x").rule, "exact")
        self.assertEqual(c.convert("一個介面").rule, "phrase")
        self.assertEqual(c.convert("脾").rule, "unchanged")

    def test_source_text_is_used_only_when_it_round_trips(self):
        quote = "藻戟遂芫俱戰草。諸參辛芍叛藜蘆"
        self.assertEqual(CONV.convert(quote, source="藻戟遂芫俱战草。诸参辛芍叛藜芦"), hans.Result("藻戟遂芫俱战草。诸参辛芍叛藜芦", "source"))
        self.assertEqual(CONV.convert(quote, source="别的文字").rule, "opencc")

    def test_identifiers_and_ascii_pass_through(self):
        self.assertEqual(CONV.convert("{n} 個 <b>結果</b>").text, "{n} 个 <b>结果</b>")
        self.assertTrue(hans.is_traditional_only("腎"))
        self.assertFalse(hans.is_traditional_only("肾"))
        self.assertEqual(hans.purity_hits("肾 湿 脾"), [])
        self.assertEqual(hans.purity_hits("腎 湿"), ["腎"])
        self.assertEqual(hans.purity_hits("腎", frozenset({"腎"})), [])


class TheBuild(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files, cls.rules = build_hans.outputs()
        cls.strings = hans.collect()
        cls.dictionary = hans.load_dictionary()

    def test_the_committed_files_are_what_the_build_produces(self):
        stale = [str(p.relative_to(hans.ROOT)) for p, text in self.files.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
        self.assertEqual(stale, [], "run: .venv/bin/python -m scripts.i18n.build_hans")

    def test_it_is_deterministic(self):
        again, _ = build_hans.outputs()
        self.assertEqual(self.files, again)

    def test_every_chinese_string_of_the_data_has_an_entry(self):
        missing = sorted(s for s in self.strings if s not in self.dictionary)
        self.assertEqual(missing, [])

    def test_exempt_strings_map_to_themselves(self):
        self.assertTrue(any(self.strings.values()))
        for s, exempt in self.strings.items():
            if exempt:
                self.assertEqual(self.dictionary[s], s)

    def test_no_traditional_only_character_in_a_simplified_value(self):
        bad = {k: hans.purity_hits(v, CONV.keep) for k, v in self.dictionary.items() if not self.strings.get(k, False)}
        self.assertEqual({k: h for k, h in bad.items() if h}, {})

    def test_the_quotations_are_the_simplified_source_text(self):
        cites = json.loads((hans.DATA / "citations.json").read_text(encoding="utf-8"))["items"]
        self.assertGreater(len(cites), 100)
        for c in cites:
            self.assertEqual(self.dictionary[c["quote_zh_hant"]], c["quote_source_zh_hans"], c["id"])

    def test_the_catalogues_have_the_keys_parameters_and_tags_of_the_source(self):
        for name in sorted(p.name for p in (hans.CATALOGS / "zh-Hant").glob("*.json")):
            src = json.loads((hans.CATALOGS / "zh-Hant" / name).read_text(encoding="utf-8"))
            dst = json.loads(self.files[hans.CATALOGS / "zh-Hans" / name])
            self.assertEqual(list(src), list(dst), name)
            for key, msg in src.items():
                forms = [(msg, dst[key])] if isinstance(msg, str) else [(msg[f], dst[key][f]) for f in msg]
                for a, b in forms:
                    self.assertEqual(sorted(PLACEHOLDER.findall(a)), sorted(PLACEHOLDER.findall(b)), key)

    def test_no_traditional_only_character_in_a_simplified_catalogue_message(self):
        bad = []
        for p, text in self.files.items():
            if p == hans.DICTIONARY:
                continue
            for key, msg in json.loads(text).items():
                for t in ([msg] if isinstance(msg, str) else msg.values()):
                    if hans.purity_hits(t, CONV.keep) and key not in CONV.keys:
                        bad.append(key)
        self.assertEqual(bad, [])

    def test_forbidden_wording_is_the_same_in_both_scripts(self):
        """The Traditional wording rules, converted by the same pipeline, find exactly the same messages and data strings in Simplified: the conversion neither hides nor creates a claim."""
        wording = json.loads((hans.ROOT / "scripts" / "i18n-wording.json").read_text(encoding="utf-8"))
        rules = [(r["id"], re.compile(r["pattern"], re.I), re.compile(CONV.convert(r["pattern"]).text, re.I)) for r in wording["rules"] if r["lang"] == "zh-Hant"]
        self.assertGreaterEqual(len(rules), 8)

        def hits(text: str, which: int) -> set[str]:
            return {rid for rid, *res in rules if res[which].search(text)}

        checked = 0
        for name in sorted(p.name for p in (hans.CATALOGS / "zh-Hant").glob("*.json")):
            src = json.loads((hans.CATALOGS / "zh-Hant" / name).read_text(encoding="utf-8"))
            dst = json.loads(self.files[hans.CATALOGS / "zh-Hans" / name])
            for key, msg in src.items():
                for a, b in ([(msg, dst[key])] if isinstance(msg, str) else [(msg[f], dst[key][f]) for f in msg]):
                    self.assertEqual(hits(a, 0), hits(b, 1), f"{key}: {a} / {b}")
                    checked += 1
        for k, v in self.dictionary.items():
            if not self.strings.get(k, False):
                self.assertEqual(hits(k, 0), hits(v, 1), f"{k} / {v}")
                checked += 1
        self.assertGreater(checked, 5000)

    def test_a_glossary_term_is_rendered_the_same_way_wherever_it_is_used(self):
        """A term of the glossary has one Simplified form (the dictionary's); every catalogue message that uses the term contains it."""
        glossary = json.loads((hans.DATA / "glossary.json").read_text(encoding="utf-8"))["items"]
        terms = sorted((g["zh-Hant"] for g in glossary if len(g["zh-Hant"]) >= 2), key=lambda t: -len(t))
        bad = []
        for name in sorted(p.name for p in (hans.CATALOGS / "zh-Hant").glob("*.json")):
            src = json.loads((hans.CATALOGS / "zh-Hant" / name).read_text(encoding="utf-8"))
            dst = json.loads(self.files[hans.CATALOGS / "zh-Hans" / name])
            for key, msg in src.items():
                if key in CONV.keys:
                    continue
                for a, b in ([(msg, dst[key])] if isinstance(msg, str) else [(msg[f], dst[key][f]) for f in msg]):
                    rest = a
                    for t in terms:
                        if t in rest:
                            rest = rest.replace(t, " ")
                            if self.dictionary[t] not in b:
                                bad.append((key, t, self.dictionary[t]))
        self.assertEqual(bad, [])

    def test_the_dictionary_publishes_the_traditional_only_characters_for_the_checks(self):
        meta = json.loads(hans.DICTIONARY.read_text(encoding="utf-8"))["_meta"]
        chars = meta["traditionalOnly"]
        self.assertGreater(len(chars), 500)
        for c in "腎濕脈氣陰陽藥臟":
            self.assertIn(c, chars)
        for c in "脾肝心肺案答":
            self.assertNotIn(c, chars, c)
        self.assertTrue(all(hans.is_traditional_only(c) for c in chars))

    def test_the_review_sheet_can_be_made(self):
        from scripts.i18n import review_hans
        sheet = review_hans.sheet()
        self.assertIn("## Overrides in effect", sheet)
        self.assertIn("## Word-level changes in the knowledge base", sheet)


if __name__ == "__main__":
    unittest.main()

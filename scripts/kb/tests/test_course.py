"""The TCM course and its textbook (docs/course/zh-Hant): Traditional Chinese only and self-contained — a learner never has to open an original classic. Classical
excerpts are illustrations: each is a verified quotation of the book and chapter it names, followed by its explanation in modern Chinese. Every work the textbook names is
in the source registry, and every chapter it names of a work in the reference corpus exists there; every project record it names exists under that name, and every pattern,
pattern element, formula, constitution, acupoint and food is named somewhere; every glossary term is defined in some chapter; every exercise has an answer; no amount,
no instruction to take anything, no second person; the hours of the overview add up."""
from __future__ import annotations

import json
import re
import unittest
from functools import lru_cache
from pathlib import Path

from opencc import OpenCC

ROOT = Path(__file__).resolve().parents[3]
COURSE = ROOT / "docs" / "course" / "zh-Hant"
CHAPTERS = sorted(COURSE.glob("[0-9][0-9]-*.md"))
ANSWERS = COURSE / "answers.md"
SOURCES = COURSE / "sources.md"
PAGES = [COURSE / "README.md", *CHAPTERS, ANSWERS, SOURCES]
DATA = ROOT / "data"
LIB = ROOT / "reference" / "sources" / "TCM-Library" / "library"

NUMERALS = "一二三四五六七八九十"
# a chapter: its goals, its text in numbered sections, the excerpts, the summary, the terms, the app, the exercises
FIXED_BEFORE = ["學習目標"]
FIXED_AFTER = ["古籍原文選讀", "本章小結", "名詞", "與本 App 對照", "練習"]
# an excerpt is a blockquote of one line: > 「text」——《book·chapter》, and the next paragraph explains it in modern Chinese
QUOTE = re.compile(r"^> 「(.+?)」——《(.+?)》\s*$")
WORK = re.compile(r"《([^》]+)》")
REF = re.compile(r"［(證型|證素|方劑|本草|穴位|體質|食物|學習書|SOP) ([^］]+)］")
EXERCISE = re.compile(r"^(\d+)\. ", re.M)
TERM = re.compile(r"^- \*\*([^*]+)\*\*：(.+)$")
TRADITIONAL_BEYOND_BIG5 = {"髎", "瞤", "腨", "黅"}
OWN_WORKS = {"以模型讀中醫"}
_t2s = OpenCC("t2s")


def text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load(rel: str):
    return json.loads((DATA / rel).read_text(encoding="utf-8"))


CITATIONS = load("citations.json")["items"]


def chinese_number(n: int) -> str:
    if n <= 10:
        return NUMERALS[n - 1]
    if n < 20:
        return "十" + NUMERALS[n - 11]
    return NUMERALS[n // 10 - 1] + "十" + (NUMERALS[n % 10 - 1] if n % 10 else "")


@lru_cache(maxsize=1)
def registry() -> dict[str, dict]:
    """Every name a registered work goes by: its title, its aliases, and the parts of a title that lists several (the textbooks)."""
    out: dict[str, dict] = {}
    for w in load("sources.json")["items"]:
        names = {w["title"], *w.get("names", [])}
        for part in re.split(r"[（）、]", w["title"]):
            if part.strip():
                names.add(part.strip())
        for n in names:
            out[n] = w
    return out


# the classics whose chapters the reference library carries as front matter
LIBRARY_DIRS = {"素問": "jingdian/neijing/suwen", "黃帝內經素問": "jingdian/neijing/suwen", "靈樞": "jingdian/neijing/lingshu", "靈樞經": "jingdian/neijing/lingshu",
                "難經": "jingdian/nanjing", "傷寒論": "jingdian/shanghan", "金匱要略": "jingdian/jingui", "溫熱論": "jingdian/wenbing/wenrelun",
                "溫病條辨": "jingdian/wenbing/wenbingtiaobian", "神農本草經": "jingdian/bencao/shennong"}


@lru_cache(maxsize=None)
def library_chapters(book: str) -> str:
    out = []
    for f in (LIB / LIBRARY_DIRS[book]).rglob("*.md"):
        for line in f.read_text(encoding="utf-8").splitlines()[:12]:
            if line.startswith(("chapter:", "section_title:")):
                out.append(line.split(":", 1)[1].strip().strip('"'))
    return "\n".join(out)


@lru_cache(maxsize=None)
def corpus_text(path: str) -> str:
    p = ROOT / path
    if p.is_dir():
        return "\n".join(f.read_text(encoding="utf-8", errors="ignore") for f in sorted(p.rglob("*")) if f.is_file())
    raw = p.read_bytes()
    for enc in ("utf-8", "gb18030"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("gb18030", errors="ignore")


VARIANTS = str.maketrans({"痺": "痹"})  # variant forms OpenCC keeps but the corpus writes otherwise


def chapter_exists(book: str, chapter: str) -> bool:
    """The chapter (in Simplified, as the corpus writes it) is a chapter of the reference library's edition, or occurs in the work's corpus text."""
    parts = [_t2s.convert(p).translate(VARIANTS) for p in chapter.split("·") if p]
    if book in LIBRARY_DIRS and all(p in library_chapters(book) for p in parts):
        return True
    for c in registry()[book].get("corpus", []):
        if c.get("exists") and all(p in corpus_text(c["path"]) for p in parts):
            return True
    return False


def headings(path: Path) -> list[str]:
    return [line[3:].strip() for line in text(path).splitlines() if line.startswith("## ")]


def section(path: Path, name: str) -> str:
    return text(path).split(f"## {name}\n", 1)[1].split("\n## ", 1)[0]


class Course(unittest.TestCase):
    def test_every_chapter_is_listed_in_order_by_the_overview(self):
        self.assertGreaterEqual(len(CHAPTERS), 20)
        index = text(COURSE / "README.md")
        positions = [index.find(f"]({c.name})") for c in CHAPTERS]
        self.assertTrue(all(p > 0 for p in positions), "every chapter is linked from the overview")
        self.assertEqual(positions, sorted(positions), "in order")
        for extra in (ANSWERS, SOURCES):
            self.assertIn(f"]({extra.name})", index, extra.name)

    def test_every_chapter_is_a_textbook_chapter(self):
        for i, path in enumerate(CHAPTERS, start=1):
            self.assertTrue(text(path).startswith(f"# 第{chinese_number(i)}章　"), f"{path.name}: the title names the chapter's number")
            heads = headings(path)
            self.assertEqual(heads[:1], FIXED_BEFORE, path.name)
            self.assertEqual(heads[-len(FIXED_AFTER):], FIXED_AFTER, path.name)
            body = heads[1:-len(FIXED_AFTER)]
            self.assertGreaterEqual(len(body), 4, f"{path.name}: the text has at least four sections")
            for j, h in enumerate(body, start=1):
                self.assertTrue(h.startswith(f"{chinese_number(j)}、"), f"{path.name}: section {j} is numbered {chinese_number(j)}、 — {h}")

    def test_the_hours_add_up(self):
        index = text(COURSE / "README.md")
        hours = []
        for path in CHAPTERS:
            m = re.search(r"\*\*建議時數\*\* \| (\d+) 小時", text(path))
            self.assertIsNotNone(m, f"{path.name}: no 建議時數")
            hours.append(int(m.group(1)))
            row = re.search(rf"\]\({re.escape(path.name)}\) \| [^\n]*\| (\d+) \|", index)
            self.assertIsNotNone(row, f"{path.name}: no row with hours in the overview")
            self.assertEqual(int(row.group(1)), hours[-1], f"{path.name}: the overview and the chapter differ")
        total = re.search(r"\*\*合計 (\d+) 小時\*\*", index)
        self.assertIsNotNone(total, "the overview states the total")
        self.assertEqual(int(total.group(1)), sum(hours))

    def test_the_overview_maps_every_discipline_of_the_reference_library(self):
        index = text(COURSE / "README.md")
        for name in ["中醫基礎理論", "中醫診斷", "中藥學", "方劑學", "針灸推拿", "中醫臨床", "養生康復", "醫史醫家", "經典醫籍", "現代中醫"]:
            self.assertIn(name, index, name)

    def test_every_blockquote_is_an_excerpt_with_its_source_and_its_modern_explanation(self):
        for path in PAGES:
            lines = text(path).splitlines()
            for k, line in enumerate(lines):
                if not line.startswith(">"):
                    continue
                self.assertRegex(line, QUOTE, f"{path.name}: {line}")
                following = [l for l in lines[k + 1:k + 4] if l.strip()]
                self.assertTrue(following and following[0].startswith("**白話**："), f"{path.name}: 「{line[3:20]}…」 is not followed by its 白話 explanation")

    def test_every_excerpt_is_verified_in_the_book_and_chapter_it_names(self):
        found = 0
        used = set()
        for path in PAGES:
            for line in text(path).splitlines():
                m = QUOTE.match(line)
                if not m:
                    continue
                quote, source = m.group(1), m.group(2)
                body = quote.rstrip("。！？")
                book, _, chapter = source.partition("·")
                matches = [c for c in CITATIONS if c["verified"] and c["book"] == book and chapter in c["chapter"] and body in c["quote_zh_hant"]]
                self.assertTrue(matches, f"{path.name}: 「{quote}」 is not a verified quotation of 《{source}》")
                used.update(c["id"] for c in matches)
                found += 1
        self.assertGreaterEqual(found, 200, "the textbook illustrates its text with the verified passages")
        self.assertGreaterEqual(len(used), 170, "and uses nearly all of them")

    def test_each_chapter_explains_at_least_three_excerpts(self):
        for path in CHAPTERS:
            n = sum(1 for line in section(path, "古籍原文選讀").splitlines() if QUOTE.match(line))
            self.assertGreaterEqual(n, 3, path.name)

    def test_no_reading_assignment_of_an_original(self):
        # the textbook is self-contained: it never sends the learner to read an original work
        for path in PAGES:
            hit = re.search(r"全篇|原書全文|讀原文|研讀原典|參考庫中讀", text(path))
            self.assertIsNone(hit, f"{path.name}: {hit.group(0) if hit else ''}")

    def test_every_work_named_is_registered_and_every_chapter_named_exists_in_the_corpus(self):
        reg = registry()
        for path in PAGES:
            for m in WORK.finditer(text(path)):
                book, _, chapter = m.group(1).partition("·")
                if book in OWN_WORKS:
                    continue
                self.assertIn(book, reg, f"{path.name}: 《{book}》 is not in data/sources.json")
                if chapter:
                    self.assertTrue(chapter_exists(book, chapter), f"{path.name}: 《{book}·{chapter}》 — the chapter is not in the reference corpus")

    def test_every_project_record_named_exists_under_that_name(self):
        patterns = {p["id"]: p["name"]["zh-Hant"] for p in load("diagnosis/patterns.json")["items"]}
        elements = {e["name"]["zh-Hant"] for e in load("diagnosis/pattern-elements.json")["items"]}
        formulas = {f["name"]["zh-Hant"] for f in load("formulas/formulas.json")["items"]}
        herbs = {h["name"]["zh-Hant"] for h in load("herbs/herbs.json")["items"]}
        guidance = load("treatment/guidance.json")
        points, foods = set(guidance["acupoints"]), set(guidance["foods"])
        constitutions = {c["name"]["zh-Hant"] for c in load("diagnosis/constitutions.json")["items"]}
        book_chapters = sorted((ROOT / "docs" / "book" / "zh-Hant").glob("[0-9][0-9]-*.md"))
        sop_sections = set(re.findall(r"^#{2,3} (\d+(?:\.\d+)?|附錄 [A-E])", text(ROOT / "docs" / "diagnosis-sop.zh-TW.md"), re.M))
        count = 0
        for path in PAGES:
            for kind, value in REF.findall(text(path)):
                count += 1
                where = f"{path.name}: ［{kind} {value}］"
                if kind == "證型":
                    pid, _, name = value.partition(" ")
                    self.assertIn(pid, patterns, where)
                    self.assertTrue(name and patterns[pid].startswith(name), f"{where} — the knowledge base names it {patterns[pid]}")
                elif kind == "證素":
                    self.assertIn(value, elements, where)
                elif kind == "方劑":
                    self.assertIn(value, formulas, where)
                elif kind == "本草":
                    self.assertIn(value, herbs, where)
                elif kind == "穴位":
                    self.assertIn(value, points, where)
                elif kind == "體質":
                    self.assertIn(value, constitutions, where)
                elif kind == "食物":
                    self.assertIn(value, foods, where)
                elif kind == "學習書":
                    numbers = [chinese_number(n) for n in range(1, len(book_chapters) + 1)]
                    self.assertTrue(value.startswith("第") and value.endswith("章") and value[1:-1] in numbers, where)
                elif kind == "SOP":
                    self.assertTrue(value.startswith("§") and value[1:] in sop_sections, where)
        self.assertGreaterEqual(count, 600, "the textbook is tied to the project's own records")

    def test_every_pattern_element_formula_constitution_point_and_food_is_taught(self):
        named: dict[str, set[str]] = {}
        for path in PAGES:
            for kind, value in REF.findall(text(path)):
                named.setdefault(kind, set()).add(value.partition(" ")[0] if kind == "證型" else value)
        guidance = load("treatment/guidance.json")
        records = {
            "證型": {p["id"] for p in load("diagnosis/patterns.json")["items"]},
            "證素": {e["name"]["zh-Hant"] for e in load("diagnosis/pattern-elements.json")["items"]},
            "方劑": {f["name"]["zh-Hant"] for f in load("formulas/formulas.json")["items"]},
            "體質": {c["name"]["zh-Hant"] for c in load("diagnosis/constitutions.json")["items"]},
            "穴位": set(guidance["acupoints"]),
            "食物": set(guidance["foods"]),
        }
        for kind, every in records.items():
            self.assertEqual(sorted(every - named.get(kind, set())), [], f"{kind}: records the textbook never names")

    def test_every_term_defined_is_a_glossary_term_and_every_glossary_term_is_taught(self):
        glossary = {t["zh-Hant"] for t in load("glossary.json")["items"]}
        taught: set[str] = set()
        for path in CHAPTERS:
            lines = [line for line in section(path, "名詞").splitlines() if line.strip()]
            self.assertTrue(lines, path.name)
            for line in lines:
                m = TERM.match(line)
                self.assertIsNotNone(m, f"{path.name}: 「{line[:20]}」 is not a definition: - **term**：definition")
                term, definition = m.group(1), m.group(2)
                self.assertIn(term, glossary, f"{path.name}: 「{term}」 is not a glossary term")
                self.assertGreaterEqual(len(definition), 8, f"{path.name}: 「{term}」 is not defined")
                taught.add(term)
        self.assertEqual(sorted(glossary - taught), [], "glossary terms no chapter teaches")

    def test_every_exercise_has_an_answer(self):
        answers = text(ANSWERS)
        for i, path in enumerate(CHAPTERS, start=1):
            questions = EXERCISE.findall(section(path, "練習"))
            self.assertGreaterEqual(len(questions), 5, f"{path.name}: at least five exercises")
            head = f"## 第{chinese_number(i)}章"
            self.assertIn(head, answers, f"the answers have no section for {path.name}")
            block = answers.split(head, 1)[1].split("\n## ", 1)[0]
            self.assertEqual(len(EXERCISE.findall(block)), len(questions), f"{path.name}: {len(questions)} exercises, {len(EXERCISE.findall(block))} answers")

    def test_traditional_chinese_only(self):
        for path in PAGES:
            for ch in text(path):
                if "㐀" <= ch <= "鿿" and ch not in TRADITIONAL_BEYOND_BIG5:
                    try:
                        ch.encode("big5hkscs")
                    except UnicodeEncodeError:
                        self.fail(f"{path.name}: {ch} is not a Traditional character")

    def test_no_amount_and_no_instruction_to_take_anything(self):
        amount = re.compile(r"\d+(\.\d+)?\s*(克|公克|g\b|錢|兩|毫升|ml\b)")
        words = re.compile(r"劑量|用量|請服用|建議服用|每日服|可以服用|應該服用|服用方法")
        for path in PAGES:
            t = text(path)
            self.assertIsNone(amount.search(t), f"{path.name}: an amount")
            hit = words.search(t)
            self.assertIsNone(hit, f"{path.name}: {hit.group(0) if hit else ''}")

    def test_no_second_person(self):
        for path in PAGES:
            self.assertIsNone(re.search(r"[你妳您]", text(path)), path.name)

    def test_each_chapter_is_a_full_chapter_and_says_where_the_model_simplifies(self):
        for path in CHAPTERS:
            t = text(path)
            self.assertTrue(5000 <= len(t) <= 30000, f"{path.name}: {len(t)} characters")
            self.assertIn("模型的簡化", section(path, "與本 App 對照"), f"{path.name}: says where the project's model simplifies")

    def test_the_overview_says_what_the_course_is_and_is_not(self):
        index = text(COURSE / "README.md")
        for needle in ["草稿", "不是醫療建議", "執業中醫師", "白話", "核對", "不必"]:
            self.assertIn(needle, index, needle)


if __name__ == "__main__":
    unittest.main()

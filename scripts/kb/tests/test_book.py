"""The learning book (PM-42, PM-56; docs/book/zh-Hant): the course's companion volume, reading TCM from twelve perspectives — each chapter one question, the tradition's
view, how the model writes it, and the two compared. Traditional Chinese only, every classical quotation a verified one from the book and chapter it names, no amount
anywhere, no instruction to take anything, no second person (it is a page of the app's Learn section, PM-43), and every chapter short enough to read in a few minutes."""
from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
BOOK = ROOT / "docs" / "book" / "zh-Hant"
CHAPTERS = sorted(BOOK.glob("[0-9][0-9]-*.md"))
PAGES = [BOOK / "README.md", *CHAPTERS]
CITATIONS = json.loads((ROOT / "data" / "citations.json").read_text(encoding="utf-8"))["items"]
# a quotation is a blockquote of one line: > 「text」——《book·chapter》
QUOTE = re.compile(r"^> 「(.+?)」——《(.+?)》\s*$")
TRADITIONAL_BEYOND_BIG5 = {"髎", "瞤", "腨", "黅"}
# the four sections of every chapter, in order
PERSPECTIVE = ["一個問題", "中醫怎麼看", "模型怎麼寫", "兩相對照"]


def text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def quotations(path: Path) -> list[tuple[str, str]]:
    return [(m.group(1), m.group(2)) for line in text(path).splitlines() if (m := QUOTE.match(line))]


class Book(unittest.TestCase):
    def test_twelve_chapters_listed_in_order_by_the_index(self):
        self.assertEqual(len(CHAPTERS), 12)
        index = text(BOOK / "README.md")
        positions = [index.find(f"]({c.name})") for c in CHAPTERS]
        self.assertTrue(all(p > 0 for p in positions), "every chapter is linked from the index")
        self.assertEqual(positions, sorted(positions), "in order")

    def test_every_blockquote_is_a_quotation_with_its_source(self):
        for path in PAGES:
            for line in text(path).splitlines():
                if line.startswith(">"):
                    self.assertRegex(line, QUOTE, f"{path.name}: {line}")

    def test_every_quotation_is_verified_in_the_book_and_chapter_it_names(self):
        found = 0
        for path in PAGES:
            for quote, source in quotations(path):
                body = quote.rstrip("。！？")
                book, _, chapter = source.partition("·")
                matches = [c for c in CITATIONS if c["verified"] and c["book"] == book and chapter in c["chapter"] and body in c["quote_zh_hant"]]
                self.assertTrue(matches, f"{path.name}: 「{quote}」 is not a verified quotation of 《{source}》")
                found += 1
        self.assertGreaterEqual(found, 40)

    def test_traditional_chinese_only(self):
        for path in PAGES:
            for ch in text(path):
                if "㐀" <= ch <= "鿿" and ch not in TRADITIONAL_BEYOND_BIG5:
                    try:
                        ch.encode("big5hkscs")
                    except UnicodeEncodeError:
                        self.fail(f"{path.name}: {ch} is not a Traditional character")

    def test_no_amount_and_no_instruction_to_take_anything(self):
        amount = re.compile(r"\d+(\.\d+)?\s*(克|公克|g\b|錢|兩)")
        words = re.compile(r"劑量|用量|請服用|建議服用|每日服|可以服用|應該服用")
        for path in PAGES:
            t = text(path)
            self.assertIsNone(amount.search(t), f"{path.name}: an amount")
            self.assertIsNone(words.search(t), f"{path.name}: {words.search(t).group(0) if words.search(t) else ''}")

    def test_no_second_person(self):
        # the book is shown in the app's Learn section, whose pages address no reader (knowledge-browser design §4, R2)
        for path in PAGES:
            self.assertIsNone(re.search(r"[你妳您]", text(path)), path.name)

    def test_each_chapter_is_short(self):
        for path in CHAPTERS:
            n = len(text(path))
            self.assertTrue(400 <= n <= 3200, f"{path.name}: {n} characters")

    def test_each_chapter_says_where_the_model_simplifies(self):
        for path in CHAPTERS:
            self.assertIn("**模型的簡化", text(path), path.name)

    def test_each_chapter_takes_one_perspective(self):
        # a perspective, not a textbook topic: the question it asks, the tradition's view, the model's version, the two compared (the course teaches the topics)
        for path in CHAPTERS:
            heads = [line[3:].strip() for line in text(path).splitlines() if line.startswith("## ")]
            self.assertEqual(heads, PERSPECTIVE, path.name)

    def test_the_book_and_the_course_are_one_set(self):
        self.assertIn("](../../course/zh-Hant/README.md)", text(BOOK / "README.md"), "the book names the course")
        self.assertIn("](../../book/zh-Hant/README.md)", text(ROOT / "docs" / "course" / "zh-Hant" / "README.md"), "the course names the book")


if __name__ == "__main__":
    unittest.main()

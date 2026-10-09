"""The review packs of the texts outside data/ (task PM-57; content review §3): the interface text, and the learning book and the course as chapter-by-chapter worksheets —
every quotation with the citation it resolves to and the explanation that follows it, every term, every exercise with its answer, and the checks a reviewer signs for each chapter.
A record of these packs names pages (or namespaces) with the hash of their text; its `kb_version` is the hash of the whole text (`review.units_of_target`)."""
from __future__ import annotations

import re
from typing import Any, Callable

from scripts.kb import review
from scripts.review.areas_kb import QUOTE, citation_of
from scripts.review.base import Context, Pack, header, table

BOOK, COURSE = review.DOCUMENTS
CHAPTER = re.compile(r"^\d\d-.+\.md$")
DECIDE = "accept · change · remove · escalate"


def paragraphs_after(lines: list[str], i: int) -> str:
    """The paragraph that follows line i (blank lines skipped), joined."""
    j = i + 1
    while j < len(lines) and not lines[j].strip():
        j += 1
    out = []
    while j < len(lines) and lines[j].strip() and not re.match(r"^(#|>|\||```|\d+\. |- )", lines[j]):
        out.append(lines[j].strip())
        j += 1
    return "".join(out)


def section(text: str, heading: str) -> list[str]:
    """The lines of the `## heading` section, up to the next `## `."""
    out, inside = [], False
    for line in text.splitlines():
        if line.startswith("## "):
            if inside:
                break
            inside = line[3:].strip() == heading
            continue
        if inside:
            out.append(line)
    return out


def title_of(text: str) -> str:
    return next((line[2:].strip() for line in text.splitlines() if line.startswith("# ")), "")


def link(target: str, page: str) -> str:
    return f"[{page}](../../../{target}/{page})"


def chars(text: str) -> int:
    return len(re.findall(r"[㐀-鿿]", text))


CHAPTER_CHECKS = {
    BOOK: ["The perspective is fair to the tradition, and what it says the model does is what the model does",
           "Each quotation supports the sentence next to it, and the explanation renders it faithfully",
           "Plain Traditional Chinese that a cultured reader accepts",
           "No advice, no amount, no second person (the tests reject the words; the reviewer checks the sense)"],
    COURSE: ["The chapter teaches correctly at the level of the standard textbooks",
             "Each 白話 renders its excerpt faithfully, and each excerpt supports its place",
             "The tables of patterns, herbs and formulas match the textbooks and the Pharmacopoeia",
             "Plain Traditional Chinese; no advice, no amount, no second person (the tests reject the words; the reviewer checks the sense)"],
}


def checks(target: str) -> str:
    return "\n**Chapter checks**\n\n" + "\n".join(f"- [ ] {c}" for c in CHAPTER_CHECKS[target]) + "\n\nComment:\n"


# ── the learning book ───────────────────────────────────────────────────────

def book(ctx: Context) -> Pack:
    pages = ctx.targets[BOOK]
    units = ctx.units(BOOK)
    md = header(ctx, "the learning book 《以模型讀中醫》 (worksheets)", "Linguistic reviewer **and** TCM clinical reviewer.",
                ["**Each chapter's perspective:** fair to the tradition, and an accurate account of what the model does (*模型怎麼寫*) and where it simplifies (*模型的簡化*).",
                 "**Each quotation:** that it supports the sentence it stands next to — the build proves only that it is part of a verified citation, which is shown in full — and the explanation after it.",
                 "**The language:** plain Traditional Chinese a cultured reader accepts; no advice, no amount, no second person.",
                 "**The book is shown in the app's Learn section** of builds that carry draft content; a public build carries it only once every page is reviewed with its current hash (check-release rule 16)."],
                version=units["*"])
    md += "\nDecide each quotation with " + DECIDE + "; sign the chapter checks. The page hashes are in the record skeleton.\n"
    for page in ["README.md", *sorted(p for p in pages if CHAPTER.match(p))]:
        t = pages[page]
        lines = t.splitlines()
        heads = [line[3:].strip() for line in lines if line.startswith("## ")]
        md += f"\n---\n\n## {title_of(t)} — {link(BOOK, page)}\n\n{chars(t)} characters · sections: {' · '.join(heads) or '—'} · hash `{units[page]}`\n"
        rows = []
        for i, line in enumerate(lines):
            m = QUOTE.match(line)
            if m:
                cid = citation_of(m.group(1), m.group(2), ctx)
                full = ctx.citations[cid]["quote_zh_hant"] if cid else ""
                rows.append([len(rows) + 1, f"「{m.group(1)}」", f"《{m.group(2)}》", f"`{cid}` — {full}" if cid else "**not resolved**", paragraphs_after(lines, i), "", ""])
        if rows:
            md += "\n" + table(["#", "Quotation", "Source", "Verified citation (in full)", "The explanation that follows", "Decision", "Comment"], rows)
        simple = next((line.strip() for line in lines if line.startswith("**模型的簡化")), None)
        if simple:
            md += f"\n**The model's simplification, as the chapter states it:** {simple}\n"
        if page != "README.md":
            md += checks(BOOK)
    return Pack("book", "the learning book 《以模型讀中醫》", "linguistic + TCM clinical", md, [(BOOK, units)], version=units["*"])


# ── the course ──────────────────────────────────────────────────────────────

NUMBERED = re.compile(r"^(\d+)\. (.+)$")
TERM = re.compile(r"^- \*\*([^*]+)\*\*：(.+)$")
REF = re.compile(r"［(證型|證素|方劑|本草|穴位|體質|食物|學習書|SOP) ([^］]+)］")
PROPERTY = re.compile(r"^\| \*\*(.+?)\*\* \| (.+?) \|$")


def answers_by_chapter(text: str) -> dict[str, dict[int, str]]:
    """The answer key: chapter heading prefix (第N章) → exercise number → answer."""
    out: dict[str, dict[int, str]] = {}
    current = None
    for line in text.splitlines():
        if line.startswith("## "):
            current = line[3:].split("　")[0].strip()
            out[current] = {}
        elif current and (m := NUMBERED.match(line)):
            out[current][int(m.group(1))] = m.group(2)
    return out


def course(ctx: Context) -> Pack:
    pages = ctx.targets[COURSE]
    units = ctx.units(COURSE)
    answers = answers_by_chapter(pages["answers.md"])
    glossary = {i["zh-Hant"]: i["en"] for i in ctx.data["glossary.json"]["items"]}
    md = header(ctx, "the course and its textbook 《中醫學系統課程》 (worksheets)", "Linguistic reviewer **and** TCM clinical reviewer.",
                ["**Each chapter:** that it teaches correctly at the level of the standard textbooks, in plain Traditional Chinese; its learning goals and hours.",
                 "**Each excerpt:** that its 白話 renders it faithfully and that it supports its place (the tests prove only that the passage exists in the corpus).",
                 "**The tables** of common patterns, herbs and formulas against the textbooks and the Pharmacopoeia; **the danger signs** of chapters 18 and 22, right and sufficient.",
                 "**The terms, the exercises and the answer key** (`answers.md`), and **the sources** (`sources.md`): the works and the editions named.",
                 "No advice, no amount, no second person. The course is a document; in the app it is shown only under a review gate of its own (PM-60)."],
                version=units["*"])
    md += "\nDecide each excerpt, term and exercise with " + DECIDE + "; sign the chapter checks. The page hashes are in the record skeleton.\n"
    md += f"\n## The course — {link(COURSE, 'README.md')} · hash `{units['README.md']}`\n\n{title_of(pages['README.md'])}: the plan, the conventions and the reading order. The sources: {link(COURSE, 'sources.md')} (hash `{units['sources.md']}`); the answer key: {link(COURSE, 'answers.md')} (hash `{units['answers.md']}`), reviewed with each chapter's exercises below.\n"
    for page in sorted(p for p in pages if CHAPTER.match(p)):
        t = pages[page]
        lines = t.splitlines()
        title = title_of(t)
        props = {m.group(1): m.group(2) for line in lines if (m := PROPERTY.match(line))}
        md += (f"\n---\n\n## {title} — {link(COURSE, page)}\n\n" + " · ".join(f"**{k}** {v}" for k, v in props.items())
               + f" · {chars(t)} characters · hash `{units[page]}`\n\n**學習目標**\n\n" + "\n".join(line for line in section(t, "學習目標") if NUMBERED.match(line)) + "\n\n"
               + "**Sections:** " + " · ".join(line[3:].strip() for line in lines if line.startswith("## ")) + "\n")
        rows = []
        for i, line in enumerate(lines):
            m = QUOTE.match(line)
            if m:
                after = paragraphs_after(lines, i)
                rows.append([len(rows) + 1, f"「{m.group(1)}」", f"《{m.group(2)}》", after.removeprefix("**白話**：") if after.startswith("**白話**：") else f"**no 白話** — {after}", "", ""])
        md += "\n**Excerpts**\n\n" + table(["#", "原文", "出處", "白話", "Decision", "Comment"], rows)
        terms = [m.groups() for line in section(t, "名詞") if (m := TERM.match(line))]
        md += "\n**名詞**\n\n" + table(["名詞", "定義", "Glossary (English)", "Decision"], [[f"**{a}**", b, glossary.get(a, "—"), ""] for a, b in terms])
        refs = REF.findall("\n".join(section(t, "與本 App 對照")))
        md += f"\n**與本 App 對照** — {len(refs)} references: " + "、".join(f"［{k} {v}］" for k, v in refs) + "\n"
        key = answers.get(title.split("　")[0], {})
        ex = [(int(m.group(1)), m.group(2)) for line in section(t, "練習") if (m := NUMBERED.match(line))]
        md += "\n**練習 and the answer key**\n\n" + table(["#", "題目", "參考答案", "Decision"], [[n, q, key.get(n, "**no answer**"), ""] for n, q in ex])
        md += checks(COURSE)
    return Pack("course", "the course and its textbook 《中醫學系統課程》", "linguistic + TCM clinical", md, [(COURSE, units)], version=units["*"])


# ── the interface text ──────────────────────────────────────────────────────

# Where a namespace is shown, when not in every build (scripts/check-i18n.ts).
SHOWN = {"rx": "only in a build that shows the study reference (PM-41; `dose_display`)", "ai": "only in a development build with AI help (PM-46)",
         "safety": "the notices: the wording the safety policy owns — **the physician reviews this namespace too**"}


def ui(ctx: Context) -> Pack:
    t = review.CATALOGS
    cat: dict[str, Any] = ctx.targets[t]
    units = ctx.units(t)
    md = header(ctx, "the interface text (介面文字)", "Linguistic reviewer **and** regulatory reviewer; the `safety` namespace (the notices) also the physician.",
                ["**Tone and wording:** plain and calm, never alarming or promising. `pnpm check:i18n` already rejects the forbidden wording of the i18n guide, keeps the placeholders, tags "
                 "and plurals equal in both languages and enforces the glossary — the reviewer judges the sense, not the list.",
                 "**Clinical statements** on the result, formula and study-reference pages: nothing claims more than the knowledge base supports.",
                 "**Disclaimers and claims** (regulatory): the notices, the draft label, and the birth-chart, year and season wording framed as a cultural tendency reference.",
                 "**English:** a faithful rendering in the glossary's terms. The Simplified catalog is generated from the Traditional one; its word choices are reviewed with `pnpm i18n:review-hans`."],
                version=units["*"])
    for ns in sorted(cat):
        zh_cat, en_cat = cat[ns]["zh-Hant"], cat[ns]["en"]
        md += f"\n## `{ns}` ({len(zh_cat)} messages) · hash `{units[ns]}`\n\n" + (f"Shown {SHOWN[ns]}.\n\n" if ns in SHOWN and ns != "safety" else (f"{SHOWN[ns][0].upper()}{SHOWN[ns][1:]}.\n\n" if ns in SHOWN else ""))
        md += table(["Key", "zh-Hant", "English"], [[f"`{k}`", v, en_cat.get(k, "**missing**")] for k, v in zh_cat.items()]) if zh_cat else "No messages.\n"
    return Pack("ui", "the interface text (介面文字)", "linguistic + regulatory (+ physician for the notices)", md, [(t, units)], version=units["*"])


AREAS: dict[str, Callable[[Context], Pack]] = {"ui": ui, "book": book, "course": course}

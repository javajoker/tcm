// The learning book (PM-43, PM-56): the Markdown of docs/book/zh-Hant read into the structure the app renders, who carries it, and how the app reads it. Since PM-56 the book reads
// TCM from twelve perspectives — each chapter a question, the tradition's view, how the model writes it and the two compared — as the companion of the course in docs/course/zh-Hant.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { bookOf, checkBook, itemChildren, itemText, memoryBook } from "../src/book.ts";
import { buildChunks } from "../src/bundle.ts";
import { KbError } from "../src/errors.ts";
import type { BookBlock, BookChunk, BookText } from "../src/types.ts";
import { BOOK_DIR, BOOK_TARGET, citationOf, pageHash, parseBook, readBook, reviewStatus, textHash, type BookPage } from "../node/book.ts";
import { readDataFiles } from "../node/fromDisk.ts";

const files = readDataFiles();
const citations = files.citations.items;
const book = readBook(citations);
const IDS = ["model", "system", "ledger", "measurement", "inference", "time", "language", "herbs", "formulas", "person", "cases", "limits"];
/** The four sections of every chapter, in order. */
const PERSPECTIVE = ["一個問題", "中醫怎麼看", "模型怎麼寫", "兩相對照"];
const textOf = (t: BookText): string => t.map((s) => (typeof s === "string" ? s : "strong" in s ? s.strong : "code" in s ? s.code : s.text)).join("");
const allBlocks = (b: BookChunk): BookBlock[] => [...b.contents, ...b.chapters.flatMap((c) => c.blocks)];
const words = (b: BookBlock): string[] => {
  switch (b.kind) {
    case "heading": case "code": return [b.text];
    case "quote": return [b.text, b.source];
    case "paragraph": return [textOf(b.text)];
    case "list": return b.items.flatMap((it) => [itemText(it), ...itemChildren(it)].map(textOf));
    case "table": return [...b.head, ...b.rows.flat()].map(textOf);
  }
};

describe("the book's status comes from the review records (content review §5, PM-57)", () => {
  const pages: BookPage[] = [{ name: "README.md", text: "# 書\n" }, { name: "01-model.md", text: "# 一、模型\n\n正文。\n" }];
  const unit = (u: string, hash: string) => ({ file: BOOK_TARGET, unit: u, hash });

  test("a page and the whole text are hashed as scripts/kb/review.py hashes them", () => {
    // the values scripts/kb/review.py computes: text_hash and units_of_target
    assert.equal(pageHash("一\r\n二\n"), "088a990ee1fd039f");
    assert.equal(pageHash("一\n二\n"), "088a990ee1fd039f", "line ends do not count");
    assert.deepEqual(pages.map((p) => pageHash(p.text)), ["e05bbea045585c9b", "aa58bc11c64ef224"]);
    assert.equal(textHash(pages), "ae664b72ffda2259");
    assert.equal(textHash([...pages].reverse()), "ae664b72ffda2259", "in name order, whatever order the pages are read in");
  });

  test("reviewed when the records name the whole text, or every page, with the hash it has now — a draft otherwise", () => {
    assert.equal(reviewStatus(BOOK_TARGET, pages, []), "draft");
    assert.equal(reviewStatus(BOOK_TARGET, pages, [unit("*", "ae664b72ffda2259")]), "reviewed");
    assert.equal(reviewStatus(BOOK_TARGET, pages, [unit("README.md", "e05bbea045585c9b"), unit("01-model.md", "aa58bc11c64ef224")]), "reviewed");
    assert.equal(reviewStatus(BOOK_TARGET, pages, [unit("README.md", "e05bbea045585c9b")]), "draft", "a page not reviewed");
    assert.equal(reviewStatus(BOOK_TARGET, [...pages, { name: "02-system.md", text: "# 二\n" }], [unit("*", "ae664b72ffda2259")]), "draft", "a page added after the review");
    const edited = pages.map((p) => (p.name === "01-model.md" ? { ...p, text: p.text + "改了。\n" } : p));
    assert.equal(reviewStatus(BOOK_TARGET, edited, [unit("*", "ae664b72ffda2259"), unit("README.md", "e05bbea045585c9b"), unit("01-model.md", "aa58bc11c64ef224")]), "draft", "a page edited after its review");
    assert.equal(reviewStatus(BOOK_TARGET, pages, [{ file: "docs/course/zh-Hant", unit: "*", hash: "ae664b72ffda2259" }]), "draft", "another text's record");
  });

  test("the book read with a record of its current text is reviewed — the build then lets a public release carry it", () => {
    const real = readBook(citations, BOOK_DIR, []);
    assert.equal(real.status, "draft");
    const names = readdirSync(BOOK_DIR).filter((n) => n.endsWith(".md"));
    const hash = textHash(names.map((name) => ({ name, text: readFileSync(join(BOOK_DIR, name), "utf8") })));
    assert.equal(readBook(citations, BOOK_DIR, [unit("*", hash)]).status, "reviewed");
  });
});

describe("the book as the repository holds it", () => {
  test("a contents page and twelve chapters, in the order of their numbers, in Traditional Chinese and a draft", () => {
    assert.equal(book.lang, "zh-Hant");
    assert.equal(book.status, "draft", "no review record covers the book yet");
    assert.equal(files.book?.status, "draft");
    assert.equal(book.title, "以模型讀中醫——這個 App 怎麼想");
    assert.deepEqual(book.chapters.map((c) => c.id), IDS);
    assert.equal(book.chapters[0]!.title, "一、以模型讀中醫");
    assert.equal(book.chapters[11]!.title, "十二、邊界：驗證、安全與倫理");
  });

  test("the contents link every chapter, in order, as chapters of the book; the documents outside the book keep their names and lose their addresses", () => {
    const all = book.contents.flatMap((b) => (b.kind === "table" ? b.rows.flat() : b.kind === "paragraph" ? [b.text] : [])).flat().filter((s): s is { text: string; chapter: string; work?: "book" | "course" } => typeof s === "object" && "chapter" in s);
    const links = all.filter((l) => l.work === undefined);
    assert.deepEqual(links.map((l) => l.chapter), IDS);
    assert.equal(links[1]!.text, "二、系統：平衡與回饋");
    assert.ok(book.contents.some((b) => b.kind === "paragraph" && textOf(b.text).includes("《中醫學系統課程》")), "the contents name the course the book goes with");
    // the course is the other work of the set: its contents stay a link (PM-60), which the app shows where the build carries the course
    assert.deepEqual(all.filter((l) => l.work !== undefined).map((l) => [l.work, l.chapter]), [["course", ""]]);
    const last = book.contents.at(-1)!;
    assert.equal(last.kind, "paragraph");
    const text = last.kind === "paragraph" ? last.text : [];
    assert.ok(textOf(text).includes("處方模型設計") && textOf(text).includes("辨證 SOP"));
    assert.ok(text.every((s) => typeof s === "string" || !("chapter" in s)), "no link to a document the app does not hold");
    assert.doesNotMatch(JSON.stringify(book), /\.md\b|\.\.\//, "no file name or path of the repository");
  });

  test("every quotation is resolved to a verified citation of the book and chapter it names, and there are more than forty", () => {
    const quotes = allBlocks(book).filter((b): b is Extract<BookBlock, { kind: "quote" }> => b.kind === "quote");
    assert.ok(quotes.length >= 40, `${quotes.length}`);
    const byId = new Map(citations.map((c) => [c.id, c]));
    for (const q of quotes) {
      const c = byId.get(q.citation);
      assert.ok(c?.verified, q.citation);
      assert.ok(c!.quote_zh_hant.includes(q.text.replace(/[。！？]+$/u, "")), `${q.citation}: ${q.text}`);
      assert.equal(c!.book, q.source.split("·")[0]);
    }
    assert.equal(quotes.find((q) => q.text === "發表不遠熱，攻裡不遠寒。")?.citation, "suwen-071-4");
  });

  test("the blocks of every kind the book uses, each in its place: the four sections of a perspective, strong text, lists, tables, the fenced formula", () => {
    for (const c of book.chapters) {
      assert.deepEqual(c.blocks.filter((b) => b.kind === "heading").map((b) => (b.kind === "heading" ? b.text : "")), PERSPECTIVE, `${c.id} takes one perspective in four sections`);
    }
    const inference = book.chapters.find((c) => c.id === "inference")!;
    const code = inference.blocks.find((b) => b.kind === "code");
    assert.ok(code?.kind === "code" && code.text.startsWith("得分 = Σ") && code.text.includes("\n百分比"));
    const system = book.chapters.find((c) => c.id === "system")!;
    const table = system.blocks.find((b) => b.kind === "table");
    assert.ok(table?.kind === "table");
    assert.deepEqual(table.head.map(textOf), ["尺", "範圍", "讀法"]);
    assert.deepEqual(table.rows.map((r) => textOf(r[0]!)), ["寒熱", "虛實", "表"]);
    const list = book.chapters.find((c) => c.id === "person")!.blocks.find((b) => b.kind === "list");
    assert.ok(list?.kind === "list" && list.ordered && list.items.length === 4);
    assert.deepEqual(itemText(list.items[0]!)[0], { strong: "先去掉這個人不能用的藥" });
    const cases = book.chapters.find((c) => c.id === "cases")!.blocks.find((b) => b.kind === "table");
    assert.ok(cases?.kind === "table");
    assert.deepEqual(cases.head.map(textOf), ["", "阿明", "小芳", "陳伯"]);
    for (const c of book.chapters) {
      const last = c.blocks.at(-1)!;
      assert.ok(last.kind === "paragraph" && typeof last.text[0] === "object" && "strong" in last.text[0] && last.text[0].strong.startsWith("模型的簡化"), `${c.id} ends with where the model simplifies`);
    }
  });

  test("what a Learn page may say: no second person, no amount, no instruction to take anything", () => {
    for (const w of allBlocks(book).flatMap(words)) {
      assert.doesNotMatch(w, /[你妳您]/u);
      assert.doesNotMatch(w, /\d+(\.\d+)?\s*(克|公克|g\b|錢|兩)/u);
      assert.doesNotMatch(w, /劑量|用量|請服用|建議服用|每日服|可以服用|應該服用/u);
    }
  });
});

describe("the parser refuses what the app could not show", () => {
  const index: BookPage = { name: "README.md", text: "# 書\n\n| 章 | 想法 |\n|---|---|\n| [一](01-a.md) | 一個想法 |\n" };
  const quote = "> 「謹守病機，各司其屬。」——《素問·至真要大論》";
  const chapter = (text: string, name = "01-a.md"): BookPage => ({ name, text: `# 一\n\n${text}\n` });
  const parse = (...pages: BookPage[]): BookChunk => parseBook([index, ...pages], citations);

  test("a small book: its chapters, a link between pages, a quotation and its citation", () => {
    const b = parse(chapter(`第一段，**要點**，見[目錄](README.md)。\n\n${quote}\n\n- 甲\n- 乙`));
    assert.deepEqual(b.chapters.map((c) => c.id), ["a"]);
    assert.deepEqual(b.chapters[0]!.blocks[0], { kind: "paragraph", text: ["第一段，", { strong: "要點" }, "，見", { text: "目錄", chapter: "" }, "。"] });
    assert.equal(b.chapters[0]!.blocks[1]!.kind, "quote");
    assert.deepEqual(b.chapters[0]!.blocks[2], { kind: "list", ordered: false, items: [["甲"], ["乙"]] });
    assert.equal(citationOf("謹守病機，各司其屬。", "素問·至真要大論", citations)?.startsWith("suwen-074"), true);
  });

  test("the pages: no contents, a file name that is not NN-<id>.md, a gap in the numbers, a page without its title", () => {
    assert.throws(() => parseBook([chapter("文")], citations), /no README\.md/);
    assert.throws(() => parse(chapter("文", "01-A.md")), /a chapter is named NN-<id>\.md/);
    assert.throws(() => parse(chapter("文", "01-a.md"), chapter("文", "03-c.md")), /numbered 01, 02 … without a gap/);
    assert.throws(() => parse({ name: "01-a.md", text: "沒有標題\n" }), /a page starts with its title/);
  });

  test("the blocks: a deeper heading, HTML or an indented line, a table without its separator or with a short row, an unclosed fence, a list out of order", () => {
    assert.throws(() => parse(chapter("#### 小小節")), /nothing deeper/);
    assert.throws(() => parse(chapter("<b>粗</b>")), /HTML/);
    assert.throws(() => parse(chapter("    縮排")), /indented text/);
    assert.throws(() => parse(chapter("| a | b |\n| c | d |")), /a header row and a separator row/);
    assert.throws(() => parse(chapter("| a | b |\n|---|---|\n| c |")), /every row of the table has 2 cells/);
    assert.throws(() => parse(chapter("```\n得分")), /the fenced block is not closed/);
    assert.throws(() => parse(chapter("```js\nx\n```")), /no language/);
    assert.throws(() => parse(chapter("1. 甲\n3. 乙")), /numbered 1 … in order/);
    assert.throws(() => parse(chapter("  - 無所屬")), /indented text|belongs to an item before it/);
    assert.throws(() => parse(chapter("1. 甲\n   1. 乙")), /bullets of one level inside an item/);
    assert.throws(() => parse(chapter("- 甲\n  - 乙\n    - 丙")), /bullets of one level inside an item/);
  });

  test("what the course adds (PM-60): a sub-heading, bullets inside an item, a numbered list that goes on after a table, inline code", () => {
    assert.deepEqual(parse(chapter("### 小節")).chapters[0]!.blocks[0], { kind: "heading", text: "小節", level: 3 });
    assert.deepEqual(parse(chapter("1. 甲\n   - 子一\n   - 子二\n2. 乙")).chapters[0]!.blocks[0], { kind: "list", ordered: true, items: [{ text: ["甲"], items: [["子一"], ["子二"]] }, ["乙"]] });
    assert.deepEqual(parse(chapter("4. 丁\n5. 戊")).chapters[0]!.blocks[0], { kind: "list", ordered: true, start: 4, items: [["丁"], ["戊"]] });
    assert.deepEqual(parse(chapter("見 `data/citations.json`。")).chapters[0]!.blocks[0], { kind: "paragraph", text: ["見 ", { code: "data/citations.json" }, "。"] });
    assert.throws(() => parse(chapter("`未完")), /` is not closed/);
  });

  test("the text: an unclosed or nested mark, a link to nowhere, a stray mark", () => {
    assert.throws(() => parse(chapter("**未完")), /\*\* is not closed/);
    assert.throws(() => parse(chapter("**[連結](README.md)**")), /strong text holds plain text only/);
    assert.throws(() => parse(chapter("[別處](02-b.md)")), /neither a page of docs\/book\/zh-Hant nor a document outside it/);
    assert.throws(() => parse(chapter("單一 *星號")), /a mark the app does not show/);
    assert.throws(() => parse(chapter("<i>斜</i>")), /HTML/);
    assert.deepEqual(parse(chapter("見[設計](../../x.md)。")).chapters[0]!.blocks[0], { kind: "paragraph", text: ["見設計。"] });
  });

  test("a quotation: one line with its source, and part of a verified citation of that book and chapter", () => {
    assert.throws(() => parse(chapter("> 謹守病機")), /a quotation is one line/);
    assert.throws(() => parse(chapter("> 「謹守病機，各司其屬。」——《靈樞·本神》")), /not part of a verified quotation of 《靈樞·本神》/);
    assert.throws(() => parse(chapter("> 「天下無病。」——《素問·至真要大論》")), /not part of a verified quotation/);
    const unverified = citations.map((c) => ({ ...c, verified: false }));
    assert.throws(() => parseBook([index, chapter(quote)], unverified), /not part of a verified quotation/);
  });
});

describe("who carries the book, and how the app reads it", () => {
  test("the dev build and the closed beta carry it; a public build only a reviewed book — none yet", () => {
    const build = (profile: "dev" | "release", draftLabel: boolean, b: BookChunk = book) => buildChunks({ ...files, book: b }, { profile, version: "t", draftLabel });
    assert.ok(build("dev", false).bookFile !== null && build("dev", false).chunks.book?.chapters.length === 12);
    assert.ok(build("release", true).bookFile !== null);
    assert.equal(build("release", false).bookFile, null);
    assert.equal(build("release", false).chunks.book, null);
    assert.ok(build("release", false, { ...book, status: "reviewed" }).bookFile !== null);
    assert.equal(buildChunks({ ...files, book: null }, { profile: "dev", version: "t" }).chunks.book, null, "a caller without the book has none");
  });

  test("the file is asked for once, again after a failure, and refused when it is not the book the manifest lists", async () => {
    let asked = 0;
    let fail = true;
    const b = bookOf({ chapters: IDS, load: () => { asked++; return fail ? Promise.reject(new KbError("chunk-missing", "book: HTTP 503")) : Promise.resolve(book); } });
    assert.deepEqual(b.chapters, IDS);
    await assert.rejects(b.get(), (e: unknown) => e instanceof KbError && e.code === "chunk-missing");
    fail = false;
    assert.equal((await b.get()).chapters.length, 12);
    await b.get();
    assert.equal(asked, 2, "kept once it came");

    const other = bookOf({ chapters: IDS.slice(0, 11), load: () => Promise.resolve(book) });
    await assert.rejects(other.get(), (e: unknown) => e instanceof KbError && e.code === "chunk-invalid");
    assert.throws(() => checkBook({ ...book, lang: "zh-Hans" }, IDS), /not the book the manifest lists/);
    assert.throws(() => checkBook({ ...book, chapters: [...book.chapters].reverse() }, IDS), /not the book the manifest lists/);
    assert.deepEqual(memoryBook(book).chapters, IDS);
  });
});

// The course in the app (PM-60): the Markdown of docs/course/zh-Hant read into an index and one file per page, who carries it, and how the app reads it. The course's own content rules —
// self-contained, every excerpt found in the corpus and explained in 白話, no amount, no second person — are scripts/kb/tests/test_course.py's; these are the app's.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { itemChildren, itemText } from "../src/book.ts";
import { buildChunks } from "../src/bundle.ts";
import { checkCourseIndex, checkCoursePage, courseOf, memoryCourse } from "../src/course.ts";
import { KbError } from "../src/errors.ts";
import type { BookBlock, BookText } from "../src/types.ts";
import { BOOK_DIR, pageIdsOf, readPages } from "../node/book.ts";
import { APPENDICES, COURSE_DIR, parseCourse, readCourse } from "../node/course.ts";
import { readDataFiles } from "../node/fromDisk.ts";

const files = readDataFiles();
const citations = files.citations.items;
const course = readCourse(citations);
const IDS = ["introduction", "history", "yinyang", "wuxing", "zangxiang", "qi-blood-fluids", "channels", "causes", "four-exams", "tongue-pulse", "eight-principles", "organ-patterns",
  "six-channels", "principles", "materia-theory", "materia-classes", "formulas", "clinical", "constitution", "yunqi", "classics", "capstone", "answers", "sources"];
const textOf = (t: BookText): string => t.map((s) => (typeof s === "string" ? s : "strong" in s ? s.strong : "code" in s ? s.code : s.text)).join("");
const all = (blocks: readonly BookBlock[]): BookText[] => blocks.flatMap((b) => {
  switch (b.kind) {
    case "paragraph": return [b.text];
    case "list": return b.items.flatMap((it) => [itemText(it), ...itemChildren(it)]);
    case "table": return [...b.head, ...b.rows.flat()];
    default: return [];
  }
});
const spans = (blocks: readonly BookBlock[]) => all(blocks).flat().filter((s): s is { text: string; chapter: string; work?: "book" | "course" } => typeof s === "object" && "chapter" in s);

describe("the course as the repository holds it", () => {
  test("an index and 24 pages — the 22 chapters in the order of their numbers, then the answer key and the sources — in Traditional Chinese and a draft", () => {
    assert.equal(course.index.lang, "zh-Hant");
    assert.equal(course.index.status, "draft", "no review record covers the course yet");
    assert.equal(course.index.title, "中醫學系統課程——教科書");
    assert.deepEqual(course.index.pages.map((p) => p.id), IDS);
    assert.deepEqual(course.pages.map((p) => p.id), IDS);
    assert.equal(course.index.pages[0]!.title, "第一章　導論：中醫學的思維方式與學習方法");
    assert.equal(course.index.pages[21]!.title.startsWith("第二十二章"), true);
    for (const p of course.pages) assert.equal(p.title, course.index.pages.find((x) => x.id === p.id)!.title, p.id);
    assert.deepEqual(APPENDICES, ["answers.md", "sources.md"]);
  });

  test("what the course adds to the book's Markdown is read: sub-headings, bullets inside an item, a numbered list that goes on, inline code", () => {
    const blocks = course.pages.flatMap((p) => p.blocks);
    assert.ok(blocks.filter((b) => b.kind === "heading" && b.level === 3).length > 300, "the （一）（二） sub-sections");
    const zangxiang = course.pages.find((p) => p.id === "zangxiang")!.blocks;
    const nested = zangxiang.flatMap((b) => (b.kind === "list" ? b.items : [])).filter((it) => itemChildren(it).length > 0);
    assert.ok(nested.length >= 1 && itemChildren(nested[0]!).some((c) => textOf(c).startsWith("調暢情志")));
    assert.ok(course.pages.find((p) => p.id === "wuxing")!.blocks.some((b) => b.kind === "list" && b.ordered && b.start === 4), "the list that goes on after a table");
    assert.ok(all(course.index.contents).flat().some((s) => typeof s === "object" && "code" in s), "the contents name a file of the knowledge base as code");
  });

  test("every quotation is part of a verified citation, and there are more than two hundred", () => {
    const quotes = course.pages.flatMap((p) => p.blocks).filter((b): b is Extract<BookBlock, { kind: "quote" }> => b.kind === "quote");
    assert.ok(quotes.length >= 200, `${quotes.length}`);
    const byId = new Map(citations.map((c) => [c.id, c]));
    for (const q of quotes) assert.ok(byId.get(q.citation)?.verified, q.citation);
  });

  test("the links: the contents link every chapter and the two appendices, a chapter links the book, and no link keeps an address of the repository", () => {
    const own = spans(course.index.contents).filter((s) => s.work === undefined).map((s) => s.chapter);
    for (const id of IDS) assert.ok(own.includes(id), id);
    const toBook = course.pages.flatMap((p) => spans(p.blocks)).concat(spans(course.index.contents)).filter((s) => s.work === "book");
    assert.ok(toBook.length >= 1, "the course names its companion");
    const bookIds = new Set(["", ...pageIdsOf(readPages(BOOK_DIR).map((p) => p.name)).values()]);
    for (const s of toBook) assert.ok(bookIds.has(s.chapter), s.chapter);
    assert.doesNotMatch(JSON.stringify(course.pages.flatMap((p) => spans(p.blocks))), /\.md\b|\.\.\//);
  });

  test("a page is a chapter, the answer key or the sources; the chapters run from 01 without a gap", () => {
    const pages = readPages(COURSE_DIR);
    assert.throws(() => parseCourse([...pages, { name: "notes.md", text: "# 筆記\n" }], citations), /a page is a chapter \(NN-<id>\.md\), the answer key \(answers\.md\) or the sources/);
    assert.throws(() => parseCourse(pages.filter((p) => p.name !== "02-history.md"), citations), /numbered 01, 02 … without a gap/);
    assert.throws(() => parseCourse(pages.filter((p) => p.name !== "README.md"), citations), /no README\.md/);
    const reviewed = parseCourse(pages, citations, [{ file: "docs/course/zh-Hant", unit: "*", hash: "0".repeat(16) }]);
    assert.equal(reviewed.index.status, "draft", "a record of another text is not this one");
  });
});

describe("who carries the course, and how the app reads it", () => {
  test("the dev build and the closed beta carry it; a public build only a reviewed course — none yet", () => {
    const build = (profile: "dev" | "release", draftLabel: boolean, c = course) => buildChunks({ ...files, course: c }, { profile, version: "t", draftLabel });
    assert.ok(build("dev", false).courseFiles !== null && build("dev", false).chunks.course?.pages.length === 24);
    assert.ok(build("release", true).courseFiles !== null);
    assert.equal(build("release", false).courseFiles, null);
    assert.equal(build("release", false).chunks.course, null);
    assert.ok(build("release", false, { ...course, index: { ...course.index, status: "reviewed" } }).courseFiles !== null);
    assert.equal(buildChunks({ ...files, course: null }, { profile: "dev", version: "t" }).chunks.course, null, "a caller without the course has none");
  });

  test("the index and each page are asked for once, again after a failure; a page the course does not have, or a file that is not the page, is refused", async () => {
    let asked = 0, fail = true;
    const source = memoryCourse(course);
    const c = courseOf({ ...source, page: (id) => { asked++; return fail ? Promise.reject(new KbError("chunk-missing", "course: HTTP 503")) : source.page(id); } });
    assert.deepEqual(c.pages, IDS);
    await assert.rejects(c.page("yinyang"), (e: unknown) => e instanceof KbError && e.code === "chunk-missing");
    fail = false;
    assert.equal((await c.page("yinyang")).id, "yinyang");
    await c.page("yinyang");
    assert.equal(asked, 2, "kept once it came");
    assert.equal((await c.index()).pages.length, 24);
    await assert.rejects(c.page("nonsense"), (e: unknown) => e instanceof KbError && e.code === "chunk-invalid");

    const swapped = courseOf({ ...source, page: () => source.page("history") });
    await assert.rejects(swapped.page("yinyang"), /not that page/);
    const shorter = courseOf({ ...source, pages: IDS.slice(0, 23) });
    await assert.rejects(shorter.index(), /not the one the manifest lists/);
    assert.throws(() => checkCourseIndex({ ...course.index, lang: "zh-Hans" }, IDS), /not the one the manifest lists/);
    assert.throws(() => checkCoursePage({ ...course.pages[0]!, lang: "zh-Hans" }, "introduction"), /not that page/);
  });
});

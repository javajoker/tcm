// The printable editions (task PM-61): every block prints as the app shows it; each edition holds its cover with the review status, its introduction and every page as a section of its
// own; links stay inside the edition; the footer says the status on every page. Printing to PDF needs the installed Chrome and is checked only with PRINT_PDF=1 (`pnpm print:editions`
// prints both).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { BookBlock } from "../packages/kb/src/types.ts";
import { anchor, blocks, editionHtml, editions, footerOf, printPdf, spans } from "./print-editions.ts";

const [book, course] = editions();

test("every kind of block prints as the app shows it, the text escaped", () => {
  const sample: BookBlock[] = [
    { kind: "heading", text: "一、總論" }, { kind: "heading", text: "（一）細目", level: 3 },
    { kind: "paragraph", text: ["見", { strong: "重點" }, "與 ", { code: "data/x.json" }, "，及", { text: "第二章", chapter: "yinyang" }, "、", { text: "學習書", chapter: "", work: "book" }, "；a<b"] },
    { kind: "quote", text: "陰陽者，天地之道也", source: "素問·陰陽應象大論", citation: "suwen-005-1" },
    { kind: "table", head: [["甲"], ["乙"]], rows: [[["一"], ["二"]]] },
    { kind: "list", ordered: true, start: 4, items: [{ text: ["丁"], items: [["子"]] }, ["戊"]] },
    { kind: "code", text: "得分 = Σ" },
  ];
  const html = blocks(sample, "course");
  assert.match(html, /<h2>一、總論<\/h2>\n<h3>（一）細目<\/h3>/);
  assert.match(html, /<p>見<strong>重點<\/strong>與 <code>data\/x\.json<\/code>，及<a href="#page-yinyang">第二章<\/a>、學習書；a&lt;b<\/p>/);
  assert.match(html, /<figure class="quote"><blockquote>「陰陽者，天地之道也」<\/blockquote><figcaption>——《素問·陰陽應象大論》<\/figcaption><\/figure>/);
  assert.match(html, /<thead><tr><th scope="col">甲<\/th><th scope="col">乙<\/th><\/tr><\/thead><tbody><tr><th scope="row">一<\/th><td>二<\/td><\/tr><\/tbody>/);
  assert.match(html, /<ol start="4"><li>丁<ul><li>子<\/li><\/ul><\/li><li>戊<\/li><\/ol>/);
  assert.match(html, /<pre>得分 = Σ<\/pre>/);
  assert.equal(spans([{ text: "目錄", chapter: "" }], "book"), `<a href="#${anchor("")}">目錄</a>`);
});

test("each edition: a cover with the review status, the introduction and every page as a section of its own, in Traditional Chinese", () => {
  for (const e of [book!, course!]) {
    const html = editionHtml(e);
    assert.match(html, /^<!doctype html>\n<html lang="zh-Hant">/);
    assert.match(html, /<section class="cover">/);
    assert.equal(e.status, "draft", "nothing is reviewed yet");
    assert.ok(html.includes("草稿：本書尚未經語文與中醫臨床審閱。只供學習與教學，不是醫療建議"), e.work);
    assert.ok(html.includes(`文本版本 ${e.version}`) && /^[0-9a-f]{16}$/.test(e.version));
    assert.equal((html.match(/<section id="[^"]+" class="chapter">/g) ?? []).length, e.pages.length + 1);
    for (const p of e.pages) assert.ok(html.includes(`<section id="${anchor(p.id)}" class="chapter"><h1>${p.title}</h1>`), p.id);
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]!);
    assert.ok(hrefs.length > 10, e.work);
    for (const h of hrefs) assert.ok(h.startsWith("#") && html.includes(`id="${h.slice(1)}"`), `${e.work}: ${h} stays inside the edition`);
    // the course's sources name the knowledge base's files as code, on purpose; nothing else is an address
    assert.doesNotMatch(html.replace(/<code>[^<]*<\/code>/g, ""), /\.md\b|https?:\/\//, "no address of the repository or of the web");
    assert.match(footerOf(e), /草稿・未經審閱・不是醫療建議.*class="pageNumber".*class="totalPages"/);
  }
  assert.deepEqual([book!.pages.length, course!.pages.length], [12, 24]);
  assert.ok(editionHtml(course!).includes("<h1>第五章　藏象學說</h1>"));
});

test("printing to PDF with the installed Chrome", { skip: process.env.PRINT_PDF !== "1" && "set PRINT_PDF=1: it needs the installed Chrome and a Traditional Chinese font" }, async () => {
  const pdf = await printPdf(book!, editionHtml(book!));
  const text = pdf.toString("latin1");
  assert.ok(text.startsWith("%PDF-"));
  assert.ok((text.match(/\/Type\s*\/Page[^s]/g) ?? []).length >= 13, "the cover, the introduction and twelve chapters, each from a new page");
  assert.match(text, /\/Outlines/, "an outline of the headings");
});

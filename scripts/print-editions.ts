// The printable editions of the learning book and the course (task PM-61), for teaching: each work as one A4 PDF — a cover that says how far it has been reviewed and that it is not medical
// advice, the introduction with its contents, every chapter on a new page, the quotations with their sources, the draft line and the page number on every page, and an outline of the
// headings. Rendered from the blocks the app shows (packages/kb/node/book.ts, course.ts) into HTML, then printed by the installed Chrome through Playwright (`channel: "chrome"`): nothing is
// downloaded, and the fonts are the system's Traditional Chinese ones (Songti TC, Noto Serif TC … falling back to PingFang TC or Heiti TC).
//   node scripts/print-editions.ts            write print/book-zh-Hant.{html,pdf} and print/course-zh-Hant.{html,pdf}   (pnpm print:editions)
//   node scripts/print-editions.ts --html     the HTML only (no browser needed)
// The editions are derived files, git-ignored like the review packs: regenerate them after a change to the texts. A draft edition says so on its cover and on every page, so that it is never
// handed out as a reviewed text (content review §3).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { itemChildren, itemText } from "../packages/kb/src/book.ts";
import type { BookBlock, BookText, Citation } from "../packages/kb/src/types.ts";
import { BOOK_DIR, pageIdsOf, readBook, readPages, textHash, type ReviewedUnit } from "../packages/kb/node/book.ts";
import { COURSE_DIR, readCourse } from "../packages/kb/node/course.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const OUT = join(root, "print");

export type Work = "book" | "course";
export interface EditionPage { readonly id: string; readonly title: string; readonly blocks: readonly BookBlock[] }
export interface Edition {
  readonly work: Work;
  /** The file name without its extension: book-zh-Hant, course-zh-Hant. */
  readonly file: string;
  readonly title: string;
  readonly subtitle: string;
  readonly status: "draft" | "reviewed";
  /** The hash of the whole text (as a review record names it, `review.target_hash`): which text this edition is. */
  readonly version: string;
  readonly contents: readonly BookBlock[];
  readonly pages: readonly EditionPage[];
}

export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** The anchor of a page inside its edition ("" is the introduction and contents). */
export const anchor = (id: string): string => (id === "" ? "contents" : `page-${id}`);

/** A run of text. A link to a page of the same work goes to that page in the edition; the other work is a volume of its own, so a link to it keeps its text. */
export function spans(text: BookText, work: Work): string {
  return text.map((s) => {
    if (typeof s === "string") return esc(s);
    if ("strong" in s) return `<strong>${esc(s.strong)}</strong>`;
    if ("code" in s) return `<code>${esc(s.code)}</code>`;
    return (s.work ?? work) === work ? `<a href="#${anchor(s.chapter)}">${esc(s.text)}</a>` : esc(s.text);
  }).join("");
}

/** The blocks of a page, as the app shows them. */
export function blocks(list: readonly BookBlock[], work: Work): string {
  return list.map((b) => {
    switch (b.kind) {
      case "heading": return b.level === 3 ? `<h3>${esc(b.text)}</h3>` : `<h2>${esc(b.text)}</h2>`;
      case "paragraph": return `<p>${spans(b.text, work)}</p>`;
      case "quote": return `<figure class="quote"><blockquote>「${esc(b.text)}」</blockquote><figcaption>——《${esc(b.source)}》</figcaption></figure>`;
      case "table": return `<table><thead><tr>${b.head.map((h) => `<th scope="col">${spans(h, work)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, k) => (k === 0 ? `<th scope="row">${spans(c, work)}</th>` : `<td>${spans(c, work)}</td>`)).join("")}</tr>`).join("")}</tbody></table>`;
      case "list": {
        const items = b.items.map((it) => {
          const children = itemChildren(it);
          return `<li>${spans(itemText(it), work)}${children.length > 0 ? `<ul>${children.map((c) => `<li>${spans(c, work)}</li>`).join("")}</ul>` : ""}</li>`;
        }).join("");
        return b.ordered ? `<ol${b.start !== undefined ? ` start="${b.start}"` : ""}>${items}</ol>` : `<ul>${items}</ul>`;
      }
      case "code": return `<pre>${esc(b.text)}</pre>`;
    }
  }).join("\n");
}

const SERIF = `"Songti TC", "Noto Serif TC", "Source Han Serif TC", "Noto Serif CJK TC", "PMingLiU", "PingFang TC", "Heiti TC", serif`;
const SANS = `"PingFang TC", "Noto Sans TC", "Source Han Sans TC", "Noto Sans CJK TC", "Microsoft JhengHei", "Heiti TC", sans-serif`;
const STYLE = `
@page { size: A4; margin: 20mm 19mm 22mm; }
html { font-family: ${SERIF}; font-size: 10.5pt; line-height: 1.8; color: #111; }
body { margin: 0; }
h1, h2, h3, th, .cover, figcaption { font-family: ${SANS}; }
.chapter { break-before: page; }
h1 { font-size: 17pt; line-height: 1.4; margin: 0 0 7mm; }
h2 { font-size: 13pt; margin: 7mm 0 2.5mm; break-after: avoid; }
h3 { font-size: 11pt; margin: 5mm 0 1.5mm; break-after: avoid; }
p { margin: 0 0 2.5mm; text-align: justify; orphans: 2; widows: 2; }
ul, ol { margin: 0 0 2.5mm; padding-inline-start: 6mm; }
li { margin: 0.8mm 0; }
figure.quote { margin: 3mm 0 3mm 4mm; padding: 0 0 0 4mm; border-left: 1.5pt solid #8a8a8a; break-inside: avoid; break-after: avoid; page-break-after: avoid; }      /* a quotation stays with the 白話 after it */
figure.quote blockquote { margin: 0; font-size: 11pt; }
figure.quote figcaption { text-align: right; color: #444; font-size: 9pt; }
table { border-collapse: collapse; width: 100%; margin: 3mm 0; font-size: 9.5pt; line-height: 1.6; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { border: 0.5pt solid #9a9a9a; padding: 1.2mm 2mm; vertical-align: top; text-align: left; }
thead th { background: #eeeeee; }
pre { white-space: pre-wrap; background: #f3f3f3; padding: 3mm; font-family: inherit; break-inside: avoid; }
code { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 8.5pt; }
a { color: inherit; text-decoration: none; }
.cover { min-height: 230mm; display: flex; flex-direction: column; justify-content: center; text-align: center; }
.cover .kind { font-size: 11pt; letter-spacing: 0.2em; color: #555; margin: 0 0 6mm; }
.cover h1 { font-size: 26pt; margin: 0 0 5mm; }
.cover .subtitle { font-size: 12pt; margin: 0; text-align: center; }
.cover .status { margin: 18mm auto 0; max-width: 125mm; padding: 4mm 5mm; border: 1pt solid #a40000; color: #a40000; text-align: left; font-size: 10pt; }
.cover .reviewed { border-color: #226622; color: #226622; }
.cover .version { margin-top: 10mm; font-size: 8.5pt; color: #666; text-align: center; }
`;

const STATUS: Readonly<Record<Edition["status"], string>> = {
  draft: "草稿：本書尚未經語文與中醫臨床審閱。只供學習與教學，不是醫療建議，不能取代執業中醫師的診察；書中不給任何劑量。",
  reviewed: "本書已經語文與中醫臨床審閱。只供學習與教學，不是醫療建議，不能取代執業中醫師的診察；書中不給任何劑量。",
};
const FOOTER_STATUS: Readonly<Record<Edition["status"], string>> = { draft: "草稿・未經審閱・不是醫療建議", reviewed: "已審閱・不是醫療建議" };

/** The whole edition as one HTML document. */
export function editionHtml(e: Edition): string {
  const kind = e.work === "book" ? "學習書" : "課程與教科書";
  return [
    "<!doctype html>", `<html lang="zh-Hant"><head><meta charset="utf-8"><title>${esc(e.title)}</title><style>${STYLE}</style></head><body>`,
    `<section class="cover"><p class="kind">${kind}</p><h1>${esc(e.title)}</h1><p class="subtitle">${esc(e.subtitle)}</p>`,
    `<p class="status${e.status === "reviewed" ? " reviewed" : ""}">${STATUS[e.status]}</p><p class="version">文本版本 ${esc(e.version)}</p></section>`,
    `<section id="${anchor("")}" class="chapter"><h1>導讀與目錄</h1>`, blocks(e.contents, e.work), "</section>",
    ...e.pages.map((p) => `<section id="${anchor(p.id)}" class="chapter"><h1>${esc(p.title)}</h1>\n${blocks(p.blocks, e.work)}\n</section>`),
    "</body></html>", "",
  ].join("\n");
}

/** The footer Chrome prints on every page: the work, its review status and the page number (its template sets its own size and font: the page's styles do not reach it). */
export function footerOf(e: Edition): string {
  return `<div style="width:100%;margin:0 19mm;display:flex;justify-content:space-between;font-size:7.5pt;color:#555;font-family:${SANS.replace(/"/g, "'")}">`
    + `<span>${esc(e.title)} · ${FOOTER_STATUS[e.status]}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
}

/** The two editions, from the texts as the repository holds them. */
export function editions(): Edition[] {
  const data = (rel: string): unknown => JSON.parse(readFileSync(join(root, "data", rel), "utf8"));
  const citations = (data("citations.json") as { items: Citation[] }).items;
  const reviewed = (data("review/records.json") as { reviewed: ReviewedUnit[] }).reviewed;
  const bookPages = readPages(BOOK_DIR), coursePages = readPages(COURSE_DIR);
  const book = readBook(citations, BOOK_DIR, reviewed, pageIdsOf(coursePages.map((p) => p.name)));
  const course = readCourse(citations, COURSE_DIR, reviewed, pageIdsOf(bookPages.map((p) => p.name)));
  return [
    { work: "book", file: "book-zh-Hant", title: book.title, subtitle: "《中醫學系統課程》的姊妹冊：以十二個角度讀中醫", status: book.status, version: textHash(bookPages), contents: book.contents, pages: book.chapters },
    { work: "course", file: "course-zh-Hant", title: course.index.title, subtitle: "二十二章，附習題解答與資料來源", status: course.index.status, version: textHash(coursePages), contents: course.index.contents, pages: course.pages },
  ];
}

/** The part of Playwright the printing uses (Playwright is the web app's dependency, not the scripts'). */
interface PrintPage { setContent(html: string, options: { waitUntil: "load" }): Promise<void>; evaluate(expression: string): Promise<unknown>; pdf(options: Record<string, unknown>): Promise<Buffer> }
interface PrintBrowser { newPage(): Promise<PrintPage>; close(): Promise<void> }
interface Chromium { launch(options: { channel: string }): Promise<PrintBrowser> }

/** Print an edition's HTML to PDF with the installed Chrome. */
export const printPdf = (e: Edition, html: string): Promise<Buffer> => printHtml(html, footerOf(e));

/** Print a document to an A4 PDF with the installed Chrome: the footer on every page, an outline of the headings, tagged (the herb handbook prints through this too). */
export async function printHtml(html: string, footerTemplate: string): Promise<Buffer> {
  // Playwright is a dependency of the web app (its end-to-end tests), so it is resolved from there; the browser is the installed Chrome — nothing is downloaded
  const require = createRequire(join(root, "apps", "web", "package.json"));
  const pw = (await import(pathToFileURL(require.resolve("@playwright/test")).href)) as { chromium?: Chromium; default?: { chromium: Chromium } };
  const chromium = pw.chromium ?? pw.default!.chromium;
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate("document.fonts.ready.then(() => true)");
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: "<div></div>", footerTemplate, outline: true, tagged: true });
  } finally {
    await browser.close();
  }
}

if (import.meta.main) {
  const htmlOnly = process.argv.includes("--html");
  mkdirSync(OUT, { recursive: true });
  for (const e of editions()) {
    const html = editionHtml(e);
    writeFileSync(join(OUT, `${e.file}.html`), html);
    if (!htmlOnly) writeFileSync(join(OUT, `${e.file}.pdf`), await printPdf(e, html));
    console.log(`print: ${e.file} — ${e.pages.length} pages of text, ${e.status}, text ${e.version}${htmlOnly ? " (HTML only)" : ""}`);
  }
}

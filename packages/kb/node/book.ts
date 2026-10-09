// The learning book read from its Markdown (tasks PM-42, PM-43; docs/post-mvp/design/knowledge-browser.md §7.3): docs/book/zh-Hant into the structure the app renders. Node-only — the
// bundler writes the result as one file that the app fetches when a reader opens the book, so the app never parses Markdown. The parser knows exactly the part of Markdown the book uses
// (a title, section headings, paragraphs with strong text and links, one-line quotations, tables, lists, a fenced block) and refuses anything else: an edit the app could not show fails
// the build instead of reaching a reader half-shown. Every quotation is resolved to the verified citation it is part of, by the rule scripts/kb/tests/test_book.py checks.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAPTER_ID } from "../src/book.ts";
import type { BookBlock, BookChunk, BookSpan, BookText, Citation } from "../src/types.ts";

export const BOOK_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "book", "zh-Hant");

/** Where the review records name the book (scripts/kb/review.py `DOCUMENTS`). */
export const BOOK_TARGET = "docs/book/zh-Hant";

export interface BookPage { readonly name: string; readonly text: string }

/** One entry of `reviewed` in data/review/records.json: a unit whose valid, current records satisfy the roles its file or text needs. */
export interface ReviewedUnit { readonly file: string; readonly unit: string; readonly hash: string }

const sha16 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
/** The hash a review record names for a page (scripts/kb/review.py `text_hash`): of its text, line ends "\n". */
export const pageHash = (text: string): string => sha16(text.replace(/\r\n/g, "\n"));
/** The hash of the whole text (`target_hash`): over the pages' hashes, `name:hash` lines in name order. */
export const textHash = (pages: readonly BookPage[]): string =>
  sha16([...pages].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).map((p) => `${p.name}:${pageHash(p.text)}`).join("\n"));

/**
 * How far a text outside data/ has been reviewed (content review §3, §5; PM-57): `reviewed` when the review records name the whole text, or every page, with the hash it has now — so
 * a page edited after its review makes the text a draft again, whether or not the records were rebuilt since — and `draft` otherwise. The book needs its linguistic and TCM-clinical
 * review; until then a public build carries no book (`buildChunks`, and `check-release` rule 16).
 */
export function reviewStatus(target: string, pages: readonly BookPage[], reviewed: readonly ReviewedUnit[]): BookChunk["status"] {
  const hashes = new Map(reviewed.filter((u) => u.file === target).map((u) => [u.unit, u.hash]));
  if (hashes.get("*") === textHash(pages)) return "reviewed";
  return pages.length > 0 && pages.every((p) => hashes.get(p.name) === pageHash(p.text)) ? "reviewed" : "draft";
}

const CHAPTER_FILE = /^(\d\d)-(.+)\.md$/;
const QUOTE = /^> 「(.+?)」——《(.+?)》\s*$/u;
/** What starts a block other than a paragraph. */
const BLOCK_START = /^(#|>|\||```|\d+\. |- )/;

interface Context {
  /** Chapter file name → chapter id, for the links between pages. */
  readonly files: ReadonlyMap<string, string>;
  readonly citations: readonly Citation[];
}

/** The citation a quotation is part of: a verified one of the book it names, whose chapter holds the chapter it names and whose text holds the quotation (its closing stop aside). */
export function citationOf(quote: string, source: string, citations: readonly Citation[]): string | undefined {
  const body = quote.replace(/[。！？]+$/u, "");
  const [book = "", ...rest] = source.split("·");
  const chapter = rest.join("·");
  return citations.find((c) => c.verified && c.book === book && c.chapter.includes(chapter) && c.quote_zh_hant.includes(body))?.id;
}

function plain(text: string, at: string): string {
  if (/[*[\]`<]/.test(text)) throw new Error(`${at}: a title or heading is plain text`);
  return text.trim();
}

function inline(text: string, at: string, ctx: Context): BookText {
  const out: BookSpan[] = [];
  const push = (s: string): void => {
    if (s === "") return;
    const last = out.length - 1;
    if (typeof out[last] === "string") out[last] = `${out[last] as string}${s}`;
    else out.push(s);
  };
  let rest = text;
  while (rest.length > 0) {
    const strong = rest.indexOf("**");
    const link = rest.indexOf("[");
    const next = Math.min(strong < 0 ? Infinity : strong, link < 0 ? Infinity : link);
    if (next === Infinity) { push(rest); break; }
    push(rest.slice(0, next));
    rest = rest.slice(next);
    if (rest.startsWith("**")) {
      const end = rest.indexOf("**", 2);
      if (end < 0) throw new Error(`${at}: ** is not closed`);
      const inner = rest.slice(2, end);
      if (inner.trim() === "" || /[*[\]`<]/.test(inner)) throw new Error(`${at}: strong text holds plain text only`);
      out.push({ strong: inner });
      rest = rest.slice(end + 2);
      continue;
    }
    const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (m === null) throw new Error(`${at}: a [ that does not start a link`);
    const [whole, label, href] = m as unknown as [string, string, string];
    if (/[*`<]/.test(label)) throw new Error(`${at}: the text of a link is plain text`);
    const chapter = href === "README.md" ? "" : ctx.files.get(href);
    if (chapter !== undefined) out.push({ text: label, chapter });
    // a document outside the book keeps its name; the app does not hold it, so there is nothing to link to
    else if (href.startsWith("../") || /^https?:\/\//.test(href)) push(label);
    else throw new Error(`${at}: the link ${href} is neither a chapter of the book nor a document outside it`);
    rest = rest.slice(whole.length);
  }
  for (const s of out) if (typeof s === "string" && /[*`<]|\]\(/.test(s)) throw new Error(`${at}: a mark the app does not show (*, \`, < or a broken link)`);
  return out;
}

function parsePage(page: BookPage, ctx: Context): { title: string; blocks: BookBlock[] } {
  const lines = page.text.replace(/\r\n?/g, "\n").split("\n");
  const at = (i: number): string => `docs/book/zh-Hant/${page.name}:${i + 1}`;
  const line = (i: number): string => lines[i] ?? "";
  let i = 0;
  const skipBlank = (): void => { while (i < lines.length && line(i).trim() === "") i++; };
  skipBlank();
  const h1 = /^# (.+)$/.exec(line(i));
  if (h1 === null) throw new Error(`${at(i)}: a page starts with its title (# …)`);
  const title = plain(h1[1]!, at(i));
  i++;
  const blocks: BookBlock[] = [];
  for (skipBlank(); i < lines.length; skipBlank()) {
    const l = line(i);
    if (l.startsWith("```")) {
      const start = i;
      if (l !== "```") throw new Error(`${at(i)}: a fenced block is plain text, with no language`);
      const body: string[] = [];
      for (i++; i < lines.length && line(i) !== "```"; i++) body.push(line(i));
      if (i >= lines.length) throw new Error(`${at(start)}: the fenced block is not closed`);
      i++;
      blocks.push({ kind: "code", text: body.join("\n") });
    } else if (l.startsWith("## ")) {
      blocks.push({ kind: "heading", text: plain(l.slice(3), at(i)) });
      i++;
    } else if (l.startsWith("#")) {
      throw new Error(`${at(i)}: a page has one title (#) and section headings (##), nothing deeper`);
    } else if (l.startsWith(">")) {
      const m = QUOTE.exec(l);
      if (m === null) throw new Error(`${at(i)}: a quotation is one line, > 「text」——《book·chapter》`);
      const [, text, source] = m as unknown as [string, string, string];
      const citation = citationOf(text, source, ctx.citations);
      if (citation === undefined) throw new Error(`${at(i)}: 「${text}」 is not part of a verified quotation of 《${source}》 (data/citations.json)`);
      blocks.push({ kind: "quote", text, source, citation });
      i++;
    } else if (l.startsWith("|")) {
      const start = i;
      const rows: string[] = [];
      for (; i < lines.length && line(i).startsWith("|"); i++) rows.push(line(i).trim());
      const cells = (row: string): string[] => {
        if (!row.endsWith("|") || row.length < 2) throw new Error(`${at(start)}: a table row starts and ends with |`);
        return row.slice(1, -1).split("|").map((c) => c.trim());
      };
      const head = cells(rows[0]!);
      const separator = rows[1] === undefined ? [] : cells(rows[1]);
      if (separator.length !== head.length || !separator.every((c) => /^:?-{3,}:?$/.test(c))) throw new Error(`${at(start)}: a table has a header row and a separator row (|---|)`);
      const body = rows.slice(2).map(cells);
      if (body.length === 0 || body.some((r) => r.length !== head.length)) throw new Error(`${at(start)}: every row of the table has ${head.length} cells`);
      blocks.push({ kind: "table", head: head.map((c) => inline(c, at(start), ctx)), rows: body.map((r, k) => r.map((c) => inline(c, at(start + 2 + k), ctx))) });
    } else if (/^(\d+\. |- )/.test(l)) {
      const ordered = /^\d+\. /.test(l);
      const item = ordered ? /^(\d+)\. (.+)$/ : /^()- (.+)$/;
      const items: BookText[] = [];
      for (; i < lines.length && line(i).trim() !== ""; i++) {
        const m = item.exec(line(i));
        if (m === null) throw new Error(`${at(i)}: a list holds items of one kind, one per line`);
        if (ordered && Number(m[1]) !== items.length + 1) throw new Error(`${at(i)}: the items are numbered 1 … in order`);
        items.push(inline(m[2]!, at(i), ctx));
      }
      blocks.push({ kind: "list", ordered, items });
    } else if (/^(\s|<|[*+] )/.test(l)) {
      throw new Error(`${at(i)}: indented text, HTML and other list marks are not shown`);
    } else {
      // a paragraph: its lines up to a blank line or another block, joined without a space (Chinese text has none between lines)
      const start = i;
      const parts: string[] = [];
      for (; i < lines.length && line(i).trim() !== "" && (i === start || !BLOCK_START.test(line(i))); i++) parts.push(line(i).trim());
      blocks.push({ kind: "paragraph", text: inline(parts.join(""), at(start), ctx) });
    }
  }
  return { title, blocks };
}

/** The book from its pages: `README.md` is the contents, `NN-<id>.md` the chapters in the order of their numbers, which run from 01 without a gap. `reviewed`: the review records'
 * reviewed units, which give the book its status. */
export function parseBook(pages: readonly BookPage[], citations: readonly Citation[], reviewed: readonly ReviewedUnit[] = []): BookChunk {
  const index = pages.find((p) => p.name === "README.md");
  if (index === undefined) throw new Error("docs/book/zh-Hant has no README.md, the contents");
  const chapters = pages.filter((p) => p !== index).sort((a, b) => (a.name < b.name ? -1 : 1)).map((p, n) => {
    const m = CHAPTER_FILE.exec(p.name);
    if (m === null || !CHAPTER_ID.test(m[2]!)) throw new Error(`docs/book/zh-Hant/${p.name}: a chapter is named NN-<id>.md (lower-case letters, digits and hyphens)`);
    if (Number(m[1]) !== n + 1) throw new Error(`docs/book/zh-Hant/${p.name}: the chapters are numbered 01, 02 … without a gap`);
    return { page: p, id: m[2]! };
  });
  if (chapters.length === 0) throw new Error("docs/book/zh-Hant has no chapter");
  const ctx: Context = { files: new Map(chapters.map((c) => [c.page.name, c.id])), citations };
  const contents = parsePage(index, ctx);
  return {
    lang: "zh-Hant", status: reviewStatus(BOOK_TARGET, pages, reviewed), title: contents.title, contents: contents.blocks,
    chapters: chapters.map((c) => { const { title, blocks } = parsePage(c.page, ctx); return { id: c.id, title, blocks }; }),
  };
}

/** The book as the repository holds it (`dir`: docs/book/zh-Hant), its quotations resolved against `citations`, its status from the review records' reviewed units. */
export function readBook(citations: readonly Citation[], dir: string = BOOK_DIR, reviewed: readonly ReviewedUnit[] = []): BookChunk {
  const pages = readdirSync(dir).filter((n) => n.endsWith(".md")).map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
  return parseBook(pages, citations, reviewed);
}

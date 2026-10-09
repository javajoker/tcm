// The course read from its Markdown (task PM-60; docs/post-mvp/design/knowledge-browser.md §7.4): docs/course/zh-Hant into an index and one file per page, which the app fetches as a reader
// opens them — the course is some 200,000 characters, too long for one file. Node-only, with the book's parser (node/book.ts): sub-headings, bullets inside an item and inline code are
// what the course adds. Every quotation is resolved to the verified citation it is part of, as in the book (and every excerpt is found in the corpus by scripts/kb/tests/test_course.py).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHAPTER_ID } from "../src/book.ts";
import type { Citation, CourseIndexChunk, CoursePageChunk } from "../src/types.ts";
import { BOOK_DIR, CHAPTER_FILE, pageIdsOf, parsePage, readPages, reviewStatus, type BookPage, type Reader, type ReviewedUnit } from "./book.ts";

export const COURSE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "course", "zh-Hant");
/** Where the review records name the course (scripts/kb/review.py `DOCUMENTS`). */
export const COURSE_TARGET = "docs/course/zh-Hant";
/** The pages after the chapters, in this order: the answer key and the sources. */
export const APPENDICES = ["answers.md", "sources.md"] as const;

/** What the bundler writes for the course: the index and the pages, in order. */
export interface CourseFiles { readonly index: CourseIndexChunk; readonly pages: readonly CoursePageChunk[] }

/**
 * The course from its pages: `README.md` is the contents, `NN-<id>.md` the chapters in the order of their numbers (from 01 without a gap), then the answer key and the sources.
 * `reviewed`: the review records' reviewed units, which give the course its status; `book`: the book's pages (`pageIdsOf`), so that a link to one of them stays a link.
 */
export function parseCourse(pages: readonly BookPage[], citations: readonly Citation[], reviewed: readonly ReviewedUnit[] = [], book: ReadonlyMap<string, string> = new Map()): CourseFiles {
  const index = pages.find((p) => p.name === "README.md");
  if (index === undefined) throw new Error(`${COURSE_TARGET} has no README.md, the contents`);
  const chapters = pages.filter((p) => CHAPTER_FILE.test(p.name)).sort((a, b) => (a.name < b.name ? -1 : 1));
  chapters.forEach((p, n) => {
    const m = CHAPTER_FILE.exec(p.name)!;
    if (!CHAPTER_ID.test(m[2]!)) throw new Error(`${COURSE_TARGET}/${p.name}: a chapter is named NN-<id>.md (lower-case letters, digits and hyphens)`);
    if (Number(m[1]) !== n + 1) throw new Error(`${COURSE_TARGET}/${p.name}: the chapters are numbered 01, 02 … without a gap`);
  });
  if (chapters.length === 0) throw new Error(`${COURSE_TARGET} has no chapter`);
  for (const p of pages) if (p !== index && !CHAPTER_FILE.test(p.name) && !(APPENDICES as readonly string[]).includes(p.name)) throw new Error(`${COURSE_TARGET}/${p.name}: a page is a chapter (NN-<id>.md), the answer key (answers.md) or the sources (sources.md)`);
  const ordered = [...chapters, ...APPENDICES.flatMap((name) => pages.filter((p) => p.name === name))];
  const files = pageIdsOf(pages.map((p) => p.name));
  const ctx: Reader = { dir: COURSE_TARGET, files, other: { work: "book", prefix: "../../book/zh-Hant/", files: book }, citations };
  const contents = parsePage(index, ctx);
  const parsed = ordered.map((p) => ({ id: files.get(p.name)!, ...parsePage(p, ctx) }));
  return {
    index: { lang: "zh-Hant", status: reviewStatus(COURSE_TARGET, pages, reviewed), title: contents.title, contents: contents.blocks, pages: parsed.map(({ id, title }) => ({ id, title })) },
    pages: parsed.map(({ id, title, blocks }) => ({ lang: "zh-Hant", id, title, blocks })),
  };
}

/** The course as the repository holds it (`dir`: docs/course/zh-Hant). */
export function readCourse(citations: readonly Citation[], dir: string = COURSE_DIR, reviewed: readonly ReviewedUnit[] = [], book: ReadonlyMap<string, string> = pageIdsOf(readPages(BOOK_DIR).map((p) => p.name))): CourseFiles {
  return parseCourse(readPages(dir), citations, reviewed, book);
}

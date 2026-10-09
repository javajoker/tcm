// The course in the app (task PM-60, docs/post-mvp/design/knowledge-browser.md §7.4): an index and one file per page, written by the bundler from docs/course/zh-Hant, each fetched when a
// reader first opens it and checked against the manifest like every chunk. Pure: this module checks what a file holds and keeps it once read; it fetches nothing and parses no Markdown
// (the bundler does, in packages/kb/node/course.ts).
import { CHAPTER_ID } from "./book.ts";
import { KbError } from "./errors.ts";
import type { Course, CourseIndexChunk, CoursePageChunk, CourseSource } from "./types.ts";

/** The index is the one the manifest announced: Traditional Chinese, the same pages in the same order. A file that is not is a damaged chunk, never a shorter course. */
export function checkCourseIndex(value: unknown, pages: readonly string[]): CourseIndexChunk {
  const c = value as CourseIndexChunk;
  const ok = typeof c === "object" && c !== null && c.lang === "zh-Hant" && (c.status === "draft" || c.status === "reviewed") && typeof c.title === "string" && Array.isArray(c.contents) &&
    Array.isArray(c.pages) && c.pages.length === pages.length && c.pages.every((p, i) => p.id === pages[i] && typeof p.title === "string");
  if (!ok) throw new KbError("chunk-invalid", "course: the index is not the one the manifest lists");
  return c;
}

/** A page file is the page it was asked for. */
export function checkCoursePage(value: unknown, id: string): CoursePageChunk {
  const p = value as CoursePageChunk;
  if (!(typeof p === "object" && p !== null && p.lang === "zh-Hant" && p.id === id && CHAPTER_ID.test(id) && typeof p.title === "string" && Array.isArray(p.blocks))) {
    throw new KbError("chunk-invalid", `course: the file of ${id} is not that page`);
  }
  return p;
}

/** A course whose files are in memory (tests, the dev server and the bundler's own checks). */
export function memoryCourse(files: { readonly index: CourseIndexChunk; readonly pages: readonly CoursePageChunk[] }): CourseSource {
  const byId = new Map(files.pages.map((p) => [p.id, p]));
  return {
    pages: files.index.pages.map((p) => p.id),
    index: () => Promise.resolve(files.index),
    page: (id) => {
      const p = byId.get(id);
      return p === undefined ? Promise.reject(new KbError("chunk-invalid", `course: no page ${id}`)) : Promise.resolve(p);
    },
  };
}

/** Asked for once, kept; asked for again after a failure. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let file: Promise<T> | null = null;
  return () => {
    if (file === null) {
      const made = load();
      file = made;
      made.catch(() => { if (file === made) file = null; });
    }
    return file;
  };
}

/** The course the app uses over a source: the index and each page are asked for once (a failed one again on the next use), then kept. A page the course does not have is refused without a fetch. */
export function courseOf(source: CourseSource): Course {
  const index = once(() => source.index().then((c) => checkCourseIndex(c, source.pages)));
  const pages = new Map(source.pages.map((id) => [id, once(() => source.page(id).then((p) => checkCoursePage(p, id)))]));
  return {
    pages: source.pages,
    index,
    page: (id) => pages.get(id)?.() ?? Promise.reject(new KbError("chunk-invalid", `course: no page ${id}`)),
  };
}

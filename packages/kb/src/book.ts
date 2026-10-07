// The learning book in the app (task PM-43, docs/post-mvp/design/knowledge-browser.md §7.3): one file, written by the bundler from docs/book/zh-Hant, fetched when a reader first opens
// the book and checked against the manifest like every chunk. Pure: this module checks what a file holds and keeps it once read; it fetches nothing and parses no Markdown (the
// bundler does, in packages/kb/node/book.ts).
import { KbError } from "./errors.ts";
import type { Book, BookChunk, BookSource } from "./types.ts";

/** A chapter id as the book's file names give it (`02-yinyang.md` → `yinyang`). */
export const CHAPTER_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The file is the book the manifest announced: Traditional Chinese, the same chapters in the same order. A file that is not is a damaged chunk, never a shorter book. */
export function checkBook(value: unknown, chapters: readonly string[]): BookChunk {
  const b = value as BookChunk;
  const ok = typeof b === "object" && b !== null && b.lang === "zh-Hant" && (b.status === "draft" || b.status === "reviewed") && typeof b.title === "string" && Array.isArray(b.contents) &&
    Array.isArray(b.chapters) && b.chapters.length === chapters.length && b.chapters.every((c, i) => c.id === chapters[i] && typeof c.title === "string" && Array.isArray(c.blocks));
  if (!ok) throw new KbError("chunk-invalid", "book: the file is not the book the manifest lists");
  return b;
}

/** A book whose file is in memory (tests, the dev server and the bundler's own checks). */
export function memoryBook(chunk: BookChunk): BookSource {
  return { chapters: chunk.chapters.map((c) => c.id), load: () => Promise.resolve(chunk) };
}

/** The book the app uses over a source: the file is asked for once (a failed one again on the next use), then kept. */
export function bookOf(source: BookSource): Book {
  let file: Promise<BookChunk> | null = null;
  return {
    chapters: source.chapters,
    get() {
      if (file === null) {
        const made = source.load().then((b) => checkBook(b, source.chapters));
        file = made;
        made.catch(() => { if (file === made) file = null; });
      }
      return file;
    },
  };
}

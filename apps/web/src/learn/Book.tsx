// /learn/book and /learn/book/<chapter> (PM-43; docs/post-mvp/design/knowledge-browser.md §7.3): the learning book, in Traditional Chinese whatever the interface, fetched when a reader opens
// it. In English a line says so above the text. A Simplified page holds no Traditional text, so there the page says where the book is and links to the same page in Traditional Chinese.
// Every quotation links to its page among the quotations, where the original and how far it has been checked are shown (R6); the book addresses no reader (R2, test).
import type { ReactNode } from "react";
import { Link } from "wouter";
import type { Book, BookChunk } from "@tcm/kb";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useLoaded } from "../app/knowledge.tsx";
import { useTitleText } from "../app/usePageTitle.ts";
import { Notice } from "../ui/index.ts";
import { Failed, Loading } from "./Herbs.tsx";
import { Blocks } from "./Reader.tsx";
import { bookHref } from "./registry.ts";
import { useAsync } from "./useAsync.ts";
import styles from "./Learn.module.css";

function ChapterNav({ book, index }: { book: BookChunk; index: number }): ReactNode {
  const { t } = useI18n();
  const prev = book.chapters[index - 1];
  const next = book.chapters[index + 1];
  return (
    <nav aria-label={t.t("learn.book.nav")} data-noprint>
      <ul className={styles.bookNav}>
        {prev !== undefined ? <li><Link href={bookHref(prev.id)} rel="prev"><span className={styles.bookNavLabel}>{t.t("learn.book.prev")}</span> <span lang="zh-Hant">{prev.title}</span></Link></li> : null}
        <li><Link href={bookHref()}>{t.t("learn.book.contents")}</Link></li>
        {next !== undefined ? <li><Link href={bookHref(next.id)} rel="next"><span className={styles.bookNavLabel}>{t.t("learn.book.next")}</span> <span lang="zh-Hant">{next.title}</span></Link></li> : null}
      </ul>
    </nav>
  );
}

/** The contents (no chapter) or a chapter, as the file has it. */
function Pages({ book, chapter }: { book: Book; chapter: number | null }): ReactNode {
  const { t, lang } = useI18n();
  const { state, retry } = useAsync(book, () => book.get());
  const file = state.status === "ready" ? state.value : null;
  const page = file === null ? null : chapter === null ? { title: file.title, blocks: file.contents } : file.chapters[chapter]!;
  useTitleText(page?.title ?? t.t("learn.book.title"));
  return (
    <article className={styles.page}>
      <p data-noprint style={{ margin: 0 }}>{chapter === null ? <Link href="/learn">{t.t("learn.back")}</Link> : <Link href={bookHref()}>{t.t("learn.book.contents")}</Link>}</p>
      {state.status === "loading" ? <Loading /> : state.status === "error" || file === null || page === null ? <Failed message={t.t("learn.book.error")} retry={retry} /> : (
        <>
          <header><h1 lang={file.lang}>{page.title}</h1></header>
          {lang === "en" ? <p className="muted" style={{ margin: 0 }}>{t.t("learn.book.language")}</p> : null}
          {file.status !== "reviewed" ? <Notice kind="caution" kindLabel={t.t("common.notice.caution")}>{t.t("learn.book.draft")}</Notice> : null}
          <div lang={file.lang} className={styles.book}><Blocks blocks={page.blocks} title={page.title} work="book" /></div>
          {chapter !== null ? <ChapterNav book={file} index={chapter} /> : null}
        </>
      )}
    </article>
  );
}

/** A Simplified page: where the book is, in Simplified words, and the same page in Traditional Chinese — the language of the address changes, the preferred language does not. */
function InTraditional({ chapter }: { chapter: string | undefined }): ReactNode {
  const { t } = useI18n();
  useTitleText(t.t("learn.book.title"));
  return (
    <div className={styles.list}>
      <p data-noprint style={{ margin: 0 }}><Link href="/learn">{t.t("learn.back")}</Link></p>
      <h1>{t.t("learn.book.title")}</h1>
      <p style={{ margin: 0 }}>{t.t("learn.book.blurb")}</p>
      <p style={{ margin: 0 }}>{t.t("learn.book.language")}</p>
      <p style={{ margin: 0 }}><Link href={`~/zh-Hant${bookHref(chapter)}`} hrefLang="zh-Hant">{t.t("learn.book.language.read")}</Link></p>
    </div>
  );
}

/** The book's route: a chapter the book does not have is the section's own not-found page, in every language (the chapters are known without a fetch). */
export function BookRoute({ chapter, missing }: { chapter: string | undefined; missing: ReactNode }): ReactNode {
  const { lang } = useI18n();
  const { kb } = useLoaded();
  const book = kb.book;
  const index = chapter === undefined ? null : book?.chapters.indexOf(chapter) ?? -1;
  if (book === null || index === -1) return missing;
  return lang === "zh-Hans" ? <InTraditional chapter={chapter} /> : <Pages book={book} chapter={index} />;
}

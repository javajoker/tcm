// /learn/book and /learn/book/<chapter> (PM-43; docs/post-mvp/design/knowledge-browser.md §7.3): the learning book, in Traditional Chinese whatever the interface, fetched when a reader opens
// it. In English a line says so above the text. A Simplified page holds no Traditional text, so there the page says where the book is and links to the same page in Traditional Chinese.
// Every quotation links to its page among the quotations, where the original and how far it has been checked are shown (R6); the book addresses no reader (R2, test).
import type { ReactNode } from "react";
import { Link } from "wouter";
import type { Book, BookBlock, BookChunk, BookText } from "@tcm/kb";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useLoaded } from "../app/knowledge.tsx";
import { useTitleText } from "../app/usePageTitle.ts";
import { Notice } from "../ui/index.ts";
import { Failed, Loading } from "./Herbs.tsx";
import { bookHref, hrefOf } from "./registry.ts";
import { useAsync } from "./useAsync.ts";
import styles from "./Learn.module.css";

function Spans({ text }: { text: BookText }): ReactNode {
  return <>{text.map((s, i) => (typeof s === "string" ? s : "strong" in s ? <strong key={i}>{s.strong}</strong> : <Link key={i} href={bookHref(s.chapter)}>{s.text}</Link>))}</>;
}

/** The name of each table's box, by the block's position: the section it is in (the page's title before the first section), numbered when a section holds more than one. */
function tableNames(blocks: readonly BookBlock[], title: string): ReadonlyMap<number, string> {
  const names = new Map<number, string>();
  const count = new Map<string, number>();
  let section = title;
  blocks.forEach((b, i) => {
    if (b.kind === "heading") section = b.text;
    if (b.kind !== "table") return;
    const n = (count.get(section) ?? 0) + 1;
    count.set(section, n);
    names.set(i, n === 1 ? section : `${section}（${n}）`);
  });
  return names;
}

/** The blocks of a page. A table scrolls inside its own box, named after the section it is in. */
function Blocks({ blocks, title }: { blocks: readonly BookBlock[]; title: string }): ReactNode {
  const names = tableNames(blocks, title);
  return <>{blocks.map((b, i) => {
    switch (b.kind) {
      case "heading": return <h2 key={i}>{b.text}</h2>;
      case "paragraph": return <p key={i}><Spans text={b.text} /></p>;
      case "quote": return (
        <figure key={i} className={styles.bookQuote}>
          <blockquote className={`quote ${styles.quote}`}>「{b.text}」</blockquote>
          <figcaption>——<Link href={hrefOf("quotation", b.citation)}>《{b.source}》</Link></figcaption>
        </figure>
      );
      case "table": return (
        // a scrollable box has to be reachable with the keyboard (WCAG 2.1.1), so it is focusable and named
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        <div key={i} className={styles.tableWrap} tabIndex={0} role="region" aria-label={names.get(i)}>
          <table className={styles.table}>
            <thead><tr>{b.head.map((h, k) => <th key={k} scope="col"><Spans text={h} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => (k === 0 ? <th key={k} scope="row"><Spans text={c} /></th> : <td key={k}><Spans text={c} /></td>))}</tr>)}</tbody>
          </table>
        </div>
      );
      case "list": {
        const items = b.items.map((it, k) => <li key={k}><Spans text={it} /></li>);
        return b.ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
      }
      case "code": return <pre key={i} className={styles.bookCode}>{b.text}</pre>;
    }
  })}</>;
}

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
          <div lang={file.lang} className={styles.book}><Blocks blocks={page.blocks} title={page.title} /></div>
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

// /learn/course and /learn/course/<page> (PM-60; docs/post-mvp/design/knowledge-browser.md §7.4): the course and its textbook, in Traditional Chinese whatever the interface. The index
// (the contents and every page's title) and each page come when a reader opens them — the course is too long to fetch at once — and are not part of the offline copy. In English a line
// says so above the text; a Simplified page holds no Traditional text, so there the page says where the course is and links to the same page in Traditional Chinese, as the book does.
// Every quotation links to its page among the quotations (R6); the course addresses no reader and gives no amount (scripts/kb/tests/test_course.py).
import { useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import type { Course, CourseIndexChunk } from "@tcm/kb";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useLoaded } from "../app/knowledge.tsx";
import { useTitleText } from "../app/usePageTitle.ts";
import { Notice } from "../ui/index.ts";
import { Failed, Loading } from "./Herbs.tsx";
import { Blocks } from "./Reader.tsx";
import { courseHref } from "./registry.ts";
import { useAsync } from "./useAsync.ts";
import styles from "./Learn.module.css";

function PageNav({ index, at }: { index: CourseIndexChunk; at: number }): ReactNode {
  const { t } = useI18n();
  const prev = index.pages[at - 1];
  const next = index.pages[at + 1];
  return (
    <nav aria-label={t.t("learn.course.nav")} data-noprint>
      <ul className={styles.bookNav}>
        {prev !== undefined ? <li><Link href={courseHref(prev.id)} rel="prev"><span className={styles.bookNavLabel}>{t.t("learn.course.prev")}</span> <span lang="zh-Hant">{prev.title}</span></Link></li> : null}
        <li><Link href={courseHref()}>{t.t("learn.course.contents")}</Link></li>
        {next !== undefined ? <li><Link href={courseHref(next.id)} rel="next"><span className={styles.bookNavLabel}>{t.t("learn.course.next")}</span> <span lang="zh-Hant">{next.title}</span></Link></li> : null}
      </ul>
    </nav>
  );
}

/** The contents (no page) or a page, with what the index says of the course: its status and the pages around this one. */
function Pages({ course, page, at }: { course: Course; page: string | undefined; at: number | null }): ReactNode {
  const { t, lang } = useI18n();
  // what is loaded: the index, and the page's own file when a page is asked for — a new page is a new source
  const source = useMemo(() => ({ course, page }), [course, page]);
  const { state, retry } = useAsync(source, () => Promise.all([course.index(), page === undefined ? Promise.resolve(null) : course.page(page)]));
  const ready = state.status === "ready" ? state.value : null;
  const index = ready?.[0] ?? null;
  const shown = ready === null ? null : ready[1] === null ? { title: ready[0].title, blocks: ready[0].contents } : ready[1];
  useTitleText(shown?.title ?? t.t("learn.course.title"));
  return (
    <article className={styles.page}>
      <p data-noprint style={{ margin: 0 }}>{at === null ? <Link href="/learn">{t.t("learn.back")}</Link> : <Link href={courseHref()}>{t.t("learn.course.contents")}</Link>}</p>
      {state.status === "loading" ? <Loading /> : state.status === "error" || index === null || shown === null ? <Failed message={t.t("learn.course.error")} retry={retry} /> : (
        <>
          <header><h1 lang={index.lang}>{shown.title}</h1></header>
          {lang === "en" ? <p className="muted" style={{ margin: 0 }}>{t.t("learn.course.language")}</p> : null}
          {index.status !== "reviewed" ? <Notice kind="caution" kindLabel={t.t("common.notice.caution")}>{t.t("learn.course.draft")}</Notice> : null}
          <div lang={index.lang} className={styles.book}><Blocks blocks={shown.blocks} title={shown.title} work="course" /></div>
          {at !== null ? <PageNav index={index} at={at} /> : null}
        </>
      )}
    </article>
  );
}

/** A Simplified page: where the course is, in Simplified words, and the same page in Traditional Chinese — the language of the address changes, the preferred language does not. */
function InTraditional({ page }: { page: string | undefined }): ReactNode {
  const { t } = useI18n();
  useTitleText(t.t("learn.course.title"));
  return (
    <div className={styles.list}>
      <p data-noprint style={{ margin: 0 }}><Link href="/learn">{t.t("learn.back")}</Link></p>
      <h1>{t.t("learn.course.title")}</h1>
      <p style={{ margin: 0 }}>{t.t("learn.course.blurb")}</p>
      <p style={{ margin: 0 }}>{t.t("learn.course.language")}</p>
      <p style={{ margin: 0 }}><Link href={`~/zh-Hant${courseHref(page)}`} hrefLang="zh-Hant">{t.t("learn.course.language.read")}</Link></p>
    </div>
  );
}

/** The course's route: a page the course does not have is the section's own not-found page, in every language (the pages are known without a fetch). */
export function CourseRoute({ page, missing }: { page: string | undefined; missing: ReactNode }): ReactNode {
  const { lang } = useI18n();
  const { kb } = useLoaded();
  const course = kb.course;
  const at = page === undefined ? null : course?.pages.indexOf(page) ?? -1;
  if (course === null || at === -1) return missing;
  return lang === "zh-Hans" ? <InTraditional page={page} /> : <Pages course={course} page={page} at={at} />;
}

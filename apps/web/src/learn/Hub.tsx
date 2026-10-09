import type { ReactNode } from "react";
import { Link } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import { useLoaded } from "../app/knowledge.tsx";
import { usePageTitle } from "../app/usePageTitle.ts";
import { Notice } from "../ui/index.ts";
import { compareHref } from "./compare.ts";
import { listOf } from "./pages.ts";
import { availableIn, bookHref, courseHref, hrefOf } from "./registry.ts";
import { kindTitle, SearchBox, useIndex } from "./SearchBox.tsx";
import styles from "./Learn.module.css";

/** /learn — what the section is, a search field, the learning book and the course when the build carries them, and one card per kind of page that exists. */
export function Hub(): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const index = useIndex(kb);
  usePageTitle("learn.title");
  const kinds = availableIn(kb);
  // the herbs come on demand: how many there are is in the manifest, so the card needs no fetch
  const count = (type: (typeof kinds)[number]["type"]): number => (type === "herb" ? kb.herbBrowser?.count ?? 0 : listOf(kb, type, t).reduce((n, g) => n + g.items.length, 0));
  return (
    <div className={styles.hub}>
      <h1>{t.t("learn.title")}</h1>
      <p>{t.t("learn.hub.intro")}</p>
      {kb.params._meta.status !== "reviewed" ? <Notice kind="caution" kindLabel={t.t("common.notice.caution")}>{t.t("safety.notice.draft.text")}</Notice> : null}
      <SearchBox kb={kb} index={index} />
      <section aria-labelledby="learn-browse">
        <h2 id="learn-browse">{t.t("learn.hub.browse")}</h2>
        <ul className={styles.cards}>
          {kb.book !== null ? (
            <li>
              <Link className={styles.card} href={bookHref()}>
                <span className={styles.cardTitle}>{t.t("learn.book.title")}</span>
                <span>{t.t("learn.book.blurb")}</span>
                <span className="muted">{t.plural("learn.book.count", kb.book.chapters.length)}</span>
              </Link>
            </li>
          ) : null}
          {kb.course !== null ? (
            <li>
              <Link className={styles.card} href={courseHref()}>
                <span className={styles.cardTitle}>{t.t("learn.course.title")}</span>
                <span>{t.t("learn.course.blurb")}</span>
                {/* the chapters, without the answer key and the sources that follow them */}
                <span className="muted">{t.plural("learn.course.count", kb.course.pages.filter((p) => p !== "answers" && p !== "sources").length)}</span>
              </Link>
            </li>
          ) : null}
          {kinds.map(({ type }) => (
            <li key={type}>
              <Link className={styles.card} href={hrefOf(type)}>
                <span className={styles.cardTitle}>{t.t(kindTitle(type))}</span>
                <span>{t.t(`learn.type.${type}.blurb` as MessageKey)}</span>
                <span className="muted">{t.plural("learn.type.count", count(type))}</span>
              </Link>
            </li>
          ))}
          <li>
            <Link className={styles.card} href={compareHref([])}>
              <span className={styles.cardTitle}>{t.t("learn.compare.title")}</span>
              <span>{t.t("learn.hub.compare.blurb")}</span>
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}

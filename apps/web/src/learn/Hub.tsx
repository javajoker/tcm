import type { ReactNode } from "react";
import { Link } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import { useLoaded } from "../app/knowledge.tsx";
import { usePageTitle } from "../app/usePageTitle.ts";
import { Notice } from "../ui/index.ts";
import { listOf } from "./pages.ts";
import { AVAILABLE, hrefOf } from "./registry.ts";
import { kindTitle, SearchBox, useIndex } from "./SearchBox.tsx";
import styles from "./Learn.module.css";

/** /learn — what the section is, a search field, and one card per kind of page that exists. */
export function Hub(): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const index = useIndex(kb);
  usePageTitle("learn.title");
  const count = (type: (typeof AVAILABLE)[number]["type"]): number => listOf(kb, type, t).reduce((n, g) => n + g.items.length, 0);
  return (
    <div className={styles.hub}>
      <h1>{t.t("learn.title")}</h1>
      <p>{t.t("learn.hub.intro")}</p>
      {kb.params._meta.status !== "reviewed" ? <Notice kind="caution" kindLabel={t.t("common.notice.caution")}>{t.t("safety.notice.draft.text")}</Notice> : null}
      <SearchBox kb={kb} index={index} />
      <section aria-labelledby="learn-browse">
        <h2 id="learn-browse">{t.t("learn.hub.browse")}</h2>
        <ul className={styles.cards}>
          {AVAILABLE.map(({ type }) => (
            <li key={type}>
              <Link className={styles.card} href={hrefOf(type)}>
                <span className={styles.cardTitle}>{t.t(kindTitle(type))}</span>
                <span>{t.t(`learn.type.${type}.blurb` as MessageKey)}</span>
                <span className="muted">{t.t("learn.type.count", { n: count(type) })}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

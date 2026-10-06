import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useLoaded } from "../app/knowledge.tsx";
import { useTitleText } from "../app/usePageTitle.ts";
import { Field, Notice, TextInput } from "../ui/index.ts";
import { listOf } from "./pages.ts";
import { hrefOf } from "./registry.ts";
import { kindTitle, readingsOf, useIndex } from "./SearchBox.tsx";
import { matching } from "./search.ts";
import { NameLine } from "./Title.tsx";
import type { LearnType } from "./types.ts";
import styles from "./Learn.module.css";

/** /learn/<kind> — every entry of one kind in the data's own order, grouped, with a filter whose result count is announced. `?q=` pre-fills the filter (the search box's "show all"). */
export function List({ type }: { type: LearnType }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const index = useIndex(kb);
  const initial = new URLSearchParams(useSearch()).get("q") ?? "";
  const [query, setQuery] = useState(initial);
  const title = t.t(kindTitle(type));
  useTitleText(title);
  const groups = useMemo(() => listOf(kb, type, t), [kb, type, t]);
  const keep = useMemo(() => matching(index, type, query, readingsOf(kb, query)), [index, kb, type, query]);
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((i) => keep.has(i.id)) })).filter((g) => g.items.length > 0);
  const total = shown.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className={styles.list}>
      <p data-noprint style={{ margin: 0 }}><Link href="/learn">{t.t("learn.back")}</Link></p>
      <h1>{title}</h1>
      {kb.params._meta.status !== "reviewed" ? <Notice kind="caution" kindLabel={t.t("common.notice.caution")}>{t.t("safety.notice.draft.text")}</Notice> : null}
      <div data-noprint>
        <Field label={t.t("learn.list.filter")} hint={t.t("learn.list.filter.hint")}>
          <TextInput type="search" value={query} autoComplete="off" spellCheck={false} onChange={(e) => setQuery(e.currentTarget.value)} />
        </Field>
      </div>
      <p role="status" className="muted" style={{ margin: 0 }}>{total === 0 ? t.t("learn.list.empty") : t.plural("learn.list.count", total)}</p>
      <div className={styles.groups}>
        {shown.map((g) => (
          <section key={g.key} aria-labelledby={`learn-g-${g.key}`}>
            {g.heading !== null ? <h2 id={`learn-g-${g.key}`}>{g.heading}</h2> : null}
            <ul className={styles.items}>
              {g.items.map((item) => (
                <li key={item.id}>
                  <Link className={styles.item} href={hrefOf(type, item.id)}>
                    <span className={styles.itemName}><NameLine name={item.name} /></span>
                    {item.note !== undefined ? (item.noteLang === "zh" ? <span className="muted" lang={t.zhLang}>{item.note}</span> : <i className="muted" lang={item.noteLang === "pinyin" ? "zh-Latn-pinyin" : undefined}>{item.note}</i>) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

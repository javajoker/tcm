// /learn/herbs and /learn/herbs/<slug> (PM-25): the only kind of page whose data comes on demand — a list asks for the browse index, a page for its one shard (docs/post-mvp/design/knowledge-browser.md §7).
// A fetch that fails is a state with a way to try again; a herb the build does not hold is the section's own not-found page.
import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useLoaded } from "../app/knowledge.tsx";
import { usePageTitle, useTitleText } from "../app/usePageTitle.ts";
import { Button, Field, Notice, Select, Skeleton, TextInput } from "../ui/index.ts";
import { formsOf, herbGroups, herbPage, matchingHerbs, natureLabel, naturesOf } from "./herbs.ts";
import { Page } from "./Page.tsx";
import { hrefOf } from "./registry.ts";
import { kindTitle, readingsOf } from "./SearchBox.tsx";
import { NameLine } from "./Title.tsx";
import { useAsync } from "./useAsync.ts";
import styles from "./Learn.module.css";

/** What a Learn page shows while its data comes (the herb pages, the book). */
export function Loading(): ReactNode {
  const { t } = useI18n();
  return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span><Skeleton height="2rem" width="50%" /><br /><Skeleton /><br /><Skeleton /></div>;
}

/** A fetch that failed: what failed, a way to try again and a way back. */
export function Failed({ message, retry }: { message: string; retry: () => void }): ReactNode {
  const { t } = useI18n();
  return (
    <div role="alert" style={{ display: "grid", gap: "var(--space-3)", justifyItems: "start" }}>
      <p style={{ margin: 0 }}>{message}</p>
      <Button onClick={retry}>{t.t("learn.herb.retry")}</Button>
      <p style={{ margin: 0 }}><Link href="/learn">{t.t("learn.back")}</Link></p>
    </div>
  );
}

/** /learn/herbs — the herbs by category, with a filter whose result count is announced and a native select for the nature. `?q=` pre-fills the filter. */
export function HerbList(): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const title = t.t(kindTitle("herb"));
  useTitleText(title);
  const { state, retry } = useAsync(kb, () => kb.herbBrowser!.rows());
  const initial = new URLSearchParams(useSearch()).get("q") ?? "";
  const [query, setQuery] = useState(initial);
  const [nature, setNature] = useState("");
  const rows = state.status === "ready" ? state.value : null;
  const groups = useMemo(() => (rows === null ? [] : herbGroups(t, rows)), [t, rows]);
  const cache = useMemo(() => new Map((rows ?? []).map((r) => [r.slug, formsOf(kb, r)] as const)), [kb, rows]);
  const keep = useMemo(() => (rows === null ? new Set<string>() : matchingHerbs(kb, rows, { query, readings: readingsOf(kb, query), nature }, cache)), [kb, rows, cache, query, nature]);
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((i) => keep.has(i.id)) })).filter((g) => g.items.length > 0);
  const total = shown.reduce((n, g) => n + g.items.length, 0);
  const natures = useMemo(() => (rows === null ? [] : naturesOf(rows)), [rows]);
  return (
    <div className={styles.list}>
      <p data-noprint style={{ margin: 0 }}><Link href="/learn">{t.t("learn.back")}</Link></p>
      <h1>{title}</h1>
      {kb.params._meta.status !== "reviewed" ? <Notice kind="caution" kindLabel={t.t("common.notice.caution")}>{t.t("safety.notice.draft.text")}</Notice> : null}
      {state.status === "loading" ? <Loading /> : state.status === "error" ? <Failed message={t.t("learn.herb.error")} retry={retry} /> : (
        <>
          <div data-noprint style={{ display: "grid", gap: "var(--space-3)" }}>
            <Field label={t.t("learn.list.filter")} hint={t.t("learn.list.filter.hint")}>
              <TextInput type="search" value={query} autoComplete="off" spellCheck={false} onChange={(e) => setQuery(e.currentTarget.value)} />
            </Field>
            <Field label={t.t("learn.herb.filter.nature")}>
              <Select value={nature} onChange={(e) => setNature(e.currentTarget.value)}>
                <option value="">{t.t("learn.herb.filter.nature.all")}</option>
                {natures.map((n) => <option key={n} value={n}>{natureLabel(t, n)}</option>)}
              </Select>
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
                      <Link className={styles.item} href={hrefOf("herb", item.id)}>
                        <span className={styles.itemName}><NameLine name={item.name} /></span>
                        {item.note !== undefined && item.note !== "" ? <span className="muted" lang={t.zhLang}>{item.note}</span> : null}
                        {item.marks !== undefined && item.marks.length > 0 ? <span className={styles.marks}>{item.marks.join(" · ")}</span> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** /learn/herbs/<slug> — the page of one herb: its shard is fetched, then the same template as every other page. `missing` is the not-found page of the section. */
export function HerbPage({ slug, missing }: { slug: string; missing: ReactNode }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  usePageTitle("learn.type.herb.title");
  const { state, retry } = useAsync(slug, () => kb.herbBrowser!.detail(slug));
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <Failed message={t.t("learn.herb.error.page")} retry={retry} />;
  if (state.value === undefined) return missing;
  return <Page model={herbPage(kb, state.value, t)} />;
}

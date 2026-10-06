// The search field of the hub and of the list pages (design §5): an ARIA combobox whose results are real links (`<a role="option">`), grouped by kind, at most eight per kind, with a link to the whole list for the rest.
import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import type { KnowledgeBase } from "@tcm/kb";
import { useI18n } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import { Field, TextInput } from "../ui/index.ts";
import { NameLine } from "./Title.tsx";
import { hrefOf } from "./registry.ts";
import { buildIndex, search, type Hit, type Index } from "./search.ts";
import type { LearnType } from "./types.ts";
import styles from "./Learn.module.css";

export const kindTitle = (type: LearnType): MessageKey => `learn.type.${type}.title` as MessageKey;

/** What a Simplified query can stand for in the data's script (empty when the page shows Traditional). */
export const readingsOf = (kb: KnowledgeBase, query: string): readonly string[] => (kb.script === "Hans" && query.trim() !== "" ? kb.traditional(query) : []);

export function useIndex(kb: KnowledgeBase): Index {
  return useMemo(() => buildIndex(kb), [kb]);
}

function Note({ hit }: { hit: Hit }): ReactNode {
  const { t } = useI18n();
  const { note, noteLang } = hit.entry;
  if (note === undefined) return null;
  return noteLang === "zh" ? <span className="muted" lang={t.zhLang}>{note}</span> : <i className="muted" lang={noteLang === "pinyin" ? "zh-Latn-pinyin" : undefined}>{note}</i>;
}

export function SearchBox({ kb, index }: { kb: KnowledgeBase; index: Index }): ReactNode {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const base = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const results = useMemo(() => search(index, query, readingsOf(kb, query)), [index, kb, query]);
  const flat = useMemo(() => [...results.byType.values()].flatMap((g) => g.hits), [results]);
  const open = query.trim() !== "" && flat.length > 0;
  const optionId = (i: number): string => `${base}-o${i}`;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown" && flat.length > 0) { e.preventDefault(); setActive((a) => (a + 1) % flat.length); }
    else if (e.key === "ArrowUp" && flat.length > 0) { e.preventDefault(); setActive((a) => (a <= 0 ? flat.length - 1 : a - 1)); }
    else if (e.key === "Enter" && open && active >= 0) { e.preventDefault(); const hit = flat[active]!; navigate(hrefOf(hit.entry.type, hit.entry.id)); }
    else if (e.key === "Escape") { if (query !== "") { e.preventDefault(); setQuery(""); setActive(-1); } }
  };

  let n = 0;
  return (
    <div className={styles.search} role="search">
      <Field label={t.t("learn.search.label")} hint={t.t("learn.search.hint")}>
        <TextInput type="search" value={query} autoComplete="off" spellCheck={false} role="combobox" aria-expanded={open} aria-controls={`${base}-list`} aria-autocomplete="list" {...(open && active >= 0 ? { "aria-activedescendant": optionId(active) } : {})}
          onChange={(e) => { setQuery(e.currentTarget.value); setActive(-1); }} onKeyDown={onKeyDown} />
      </Field>
      <div role="status" className={open ? "visually-hidden" : "muted"}>
        {query.trim() === "" ? null : results.total === 0 ? t.t("learn.search.none", { query: query.trim() }) : t.t("learn.search.results", { n: results.total })}
      </div>
      <div id={`${base}-list`} role="listbox" aria-label={t.t("learn.search.label")} className={styles.listbox} hidden={!open}>
        {[...results.byType.entries()].map(([type, g]) => {
          const heading = `${base}-g-${type}`;
          return (
            <div key={type} role="group" aria-labelledby={heading} className={styles.group}>
              <p id={heading} className={styles.groupHeading}>{t.t(kindTitle(type))}</p>
              {g.hits.map((hit) => {
                const i = n++;
                return (
                  <Link key={`${type}:${hit.entry.id}`} id={optionId(i)} role="option" aria-selected={i === active} className={styles.option} href={hrefOf(type, hit.entry.id)}>
                    <span><NameLine name={hit.entry.name} /></span>
                    <Note hit={hit} />
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
      {open ? (
        <ul className={styles.more}>
          {[...results.byType.entries()].filter(([, g]) => g.total > g.hits.length).map(([type, g]) => (
            <li key={type}><Link href={`${hrefOf(type)}?q=${encodeURIComponent(query.trim())}`}>{t.t("learn.search.showAll", { n: g.total, type: t.t(kindTitle(type)) })}</Link></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

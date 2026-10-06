// /learn/compare?ids=SP1,SP4 — two or three patterns side by side (design §6). Without two known patterns in the address the page is the chooser.
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import type { KnowledgeBase } from "@tcm/kb";
import { useI18n } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import { useLoaded } from "../app/knowledge.tsx";
import { useTitleText } from "../app/usePageTitle.ts";
import { Button, Card, Field, Notice, Select } from "../ui/index.ts";
import { comparisonPage, compareHref, parseIds } from "./compare.ts";
import { Blocks } from "./Page.tsx";
import { hrefOf } from "./registry.ts";
import { NameLine } from "./Title.tsx";
import styles from "./Learn.module.css";

function Chooser({ kb, initial, message }: { kb: KnowledgeBase; initial: readonly string[]; message: string | null }): ReactNode {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const [picked, setPicked] = useState<readonly string[]>([initial[0] ?? "", initial[1] ?? "", initial[2] ?? ""]);
  const [problem, setProblem] = useState<string | null>(null);
  const groups = [...new Set(kb.patterns.map((p) => p.group))];
  const label = (i: number): string => t.t(i === 0 ? "learn.compare.first" : i === 1 ? "learn.compare.second" : "learn.compare.third");
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const ids = [...new Set(picked.filter((x) => x !== ""))];
    if (ids.length < 2) { setProblem(t.t("learn.compare.needTwo")); return; }
    navigate(compareHref(ids));
  };
  return (
    <form onSubmit={submit} className={styles.chooser} aria-labelledby="learn-choose">
      <h2 id="learn-choose">{t.t("learn.compare.choose")}</h2>
      <p className="muted" style={{ margin: 0 }}>{t.t("learn.compare.choose.hint")}</p>
      {message !== null ? <Notice kind="info" kindLabel={t.t("common.notice.info")}>{message}</Notice> : null}
      {[0, 1, 2].map((i) => (
        <Field key={i} label={label(i)} {...(i === 0 && problem !== null ? { error: problem } : {})}>
          <Select value={picked[i] ?? ""} onChange={(e) => { setProblem(null); setPicked(picked.map((x, j) => (j === i ? e.currentTarget.value : x))); }}>
            <option value="">{t.t("learn.compare.none")}</option>
            {groups.map((g) => (
              <optgroup key={g} label={t.t(`learn.group.${g}` as MessageKey)}>
                {kb.patterns.filter((p) => p.group === g).map((p) => <option key={p.id} value={p.id}>{t.lang === "en" && p.name.en !== null ? p.name.en : t.zh(p.name["zh-Hant"])}</option>)}
              </optgroup>
            ))}
          </Select>
        </Field>
      ))}
      <p style={{ margin: 0 }}><Button variant="primary" type="submit">{t.t("learn.compare.go")}</Button></p>
    </form>
  );
}

export function Compare(): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const search = useSearch();
  const wanted = parseIds(kb, search);
  const model = wanted.ids.length >= 2 ? comparisonPage(kb, wanted.ids, t) : null;
  useTitleText(model === null ? t.t("learn.compare.title") : `${t.t("learn.compare.title")}: ${model.names.map((n) => (t.lang === "en" && n.en !== null ? n.en : t.zh(n["zh-Hant"]))).join(" / ")}`);
  const changeId = useId();
  return (
    <div className={styles.page}>
      <p data-noprint style={{ margin: 0 }}><Link href="/learn">{t.t("learn.back")}</Link></p>
      <h1>{t.t("learn.compare.title")}</h1>
      <p>{t.t("learn.compare.intro")}</p>
      {kb.params._meta.status !== "reviewed" ? <Notice kind="caution" kindLabel={t.t("common.notice.caution")}>{t.t("safety.notice.draft.text")}</Notice> : null}
      {model === null ? <Chooser kb={kb} initial={wanted.ids} message={wanted.unknown ? t.t("learn.compare.unknown") : null} /> : (
        <>
          <p data-noprint><a href={`#${changeId}`} onClick={(e) => { e.preventDefault(); document.getElementById(changeId)?.scrollIntoView(); document.getElementById(changeId)?.querySelector("select")?.focus(); }}>{t.t("learn.compare.change")}</a></p>
          {wanted.unknown ? <Notice kind="info" kindLabel={t.t("common.notice.info")}>{t.t("learn.compare.unknown")}</Notice> : null}
          <ul className={styles.index}>{model.ids.map((id, i) => <li key={id}><Link href={hrefOf("pattern", id)}><NameLine name={model.names[i]!} /></Link></li>)}</ul>
          {model.sections.map((s) => <Card key={s.id} title={s.heading} headingLevel={2} id={`learn-${s.id}`}><Blocks blocks={s.blocks} /></Card>)}
          <p className={styles.foot}>{t.t("learn.compare.foot")}</p>
          <div id={changeId} data-noprint><Chooser kb={kb} initial={model.ids} message={null} /></div>
        </>
      )}
    </div>
  );
}

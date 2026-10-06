// The one template every Learn page is rendered with (design §4): the anonymous-context rules are enforced here and nowhere else.
//   R1 cautions come first on a page about something a person might use · R2 no second-person text (the catalogue is scanned by a test) · R3 the standing line under the title
//   R5 the only link to the assessment is the neutral one at the foot · R6 every page lists a source or says there is none · R7 the flags of the record are shown beside the cautions
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import { CitationChips } from "../app/citations.tsx";
import { useLoaded } from "../app/knowledge.tsx";
import { useTitleText } from "../app/usePageTitle.ts";
import { Card, Notice } from "../ui/index.ts";
import { Prose } from "../screens/result/shared.tsx";
import { hrefOf } from "./registry.ts";
import { kindTitle } from "./SearchBox.tsx";
import { NameLine, nameText } from "./Title.tsx";
import type { Block, PageModel } from "./types.ts";
import styles from "./Learn.module.css";

function Blocks({ blocks }: { blocks: readonly Block[] }): ReactNode {
  const { t } = useI18n();
  return <>{blocks.map((b, i) => {
    switch (b.kind) {
      case "text": return <p key={i}><Prose zh={b.zh} en={b.en} status={b.status} /></p>;
      case "plain": return <p key={i}>{b.text}</p>;
      case "quote": return <blockquote key={i} lang={t.zhLang} className={`quote ${styles.quote}`}>{t.zh(b.zh)}</blockquote>;
      case "facts": return (
        <dl key={i} className={styles.facts}>
          {b.rows.map((r) => (
            <div key={r.label} style={{ display: "contents" }}>
              <dt>{r.label}</dt>
              <dd>{typeof r.value !== "string" ? <NameLine name={r.value} /> : r.lang === "zh" ? <span lang={t.zhLang}>{r.value}</span> : r.lang === "pinyin" ? <i lang="zh-Latn-pinyin">{r.value}</i> : r.lang === "en" ? <span lang="en">{r.value}</span> : r.value}</dd>
            </div>
          ))}
        </dl>
      );
      case "table": return (
        <div key={i} className={styles.tableWrap}>
          <table className={styles.table}>
            <caption>{b.caption}</caption>
            <thead><tr>{b.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => (k === 0 ? <th key={k} scope="row">{typeof c === "string" ? c : <NameLine name={c} />}</th> : <td key={k}>{typeof c === "string" ? c : <NameLine name={c} />}</td>))}</tr>)}</tbody>
          </table>
        </div>
      );
      case "links": return (
        <div key={i} className={styles.bands}>
          {b.groups.map((g, j) => (
            <div key={j}>
              {g.label !== null ? <h3 className={styles.bandHeading}>{g.label}</h3> : null}
              <ul className={styles.names}>{g.items.map((r) => <li key={r.href}><Link href={r.href}><NameLine name={r.name} /></Link></li>)}</ul>
            </div>
          ))}
        </div>
      );
      case "groups": return (
        <div key={i} className={styles.bands}>
          {b.groups.map((g, j) => (
            <div key={j}>
              {g.label !== null ? <h3 className={styles.bandHeading}>{g.label}</h3> : null}
              <ul className={styles.names}>{g.items.map((n, k) => <li key={k}><NameLine name={n} /></li>)}</ul>
            </div>
          ))}
        </div>
      );
    }
  })}</>;
}

/** The cautions and the stored flags of a page about something a person might use. Always the first section, never behind a toggle (R1, R7). */
function Cautions({ model }: { model: PageModel }): ReactNode {
  const { t, lang } = useI18n();
  if (model.cautions.length === 0 && model.flags.length === 0) return null;
  const text = (c: { readonly "zh-Hant": string; readonly en: string }): ReactNode => (lang === "en" ? <span lang="en">{c.en}</span> : <span lang={t.zhLang}>{t.zh(c["zh-Hant"])}</span>);
  return (
    <section aria-labelledby="learn-cautions" id="learn-cautions-section">
      <Notice kind="caution" kindLabel={t.t("common.notice.caution")} title={<span id="learn-cautions">{t.t("learn.page.cautions")}</span>}>
        <ul className={styles.flags}>{model.cautions.map((c, i) => <li key={`c${i}`}>{text(c)}</li>)}</ul>
        {model.flags.length > 0 ? <><p style={{ margin: "var(--space-2) 0 0" }}><strong>{t.t("learn.page.flags")}</strong></p><ul className={styles.flags}>{model.flags.map((f, i) => <li key={`f${i}`}>{f}</li>)}</ul></> : null}
      </Notice>
    </section>
  );
}

export function Page({ model }: { model: PageModel }): ReactNode {
  const { t, lang } = useI18n();
  const { kb } = useLoaded();
  useTitleText(nameText(t, lang, model.title));
  const showIndex = model.sections.length >= 4;
  return (
    <article className={styles.page}>
      <p data-noprint style={{ margin: 0 }}><Link href={hrefOf(model.type)}>{t.t("learn.backTo", { kind: t.t(kindTitle(model.type)) })}</Link></p>
      <header>
        <h1><NameLine name={model.title} /></h1>
        {model.alias !== undefined ? <p className={styles.alias}>{model.aliasLang === "pinyin" ? <i lang="zh-Latn-pinyin">{model.alias}</i> : <code>{model.alias}</code>}</p> : null}
        {model.adviceLike ? <p className="muted" style={{ margin: "var(--space-2) 0 0" }}>{t.t("learn.page.standing")} <Link href="/sources">{t.t("learn.page.standing.link")}</Link></p> : null}
      </header>
      {kb.params._meta.status !== "reviewed" ? <Notice kind="caution" kindLabel={t.t("common.notice.caution")}>{t.t("safety.notice.draft.text")}</Notice> : null}
      {model.adviceLike ? <Cautions model={model} /> : null}
      {showIndex ? (
        <nav aria-label={t.t("learn.page.index")}>
          <ul className={styles.index}>{model.sections.map((s) => <li key={s.id}><a href={`#learn-${s.id}`}>{s.heading}</a></li>)}</ul>
        </nav>
      ) : null}
      {model.sections.map((s) => (
        <Card key={s.id} title={s.heading} headingLevel={2} id={`learn-${s.id}`}><Blocks blocks={s.blocks} /></Card>
      ))}
      <Card title={t.t("learn.page.sources")} headingLevel={2} id="learn-sources">
        {model.citations.length > 0 ? <p><CitationChips ids={model.citations} /></p> : null}
        {model.sourceLabel !== undefined ? <p>{t.t("learn.page.source", { source: model.sourceLabel })}</p> : model.citations.length === 0 ? <p>{t.t("learn.page.noSource")}</p> : null}
        <p className="muted" style={{ marginBottom: 0 }}>{t.t("learn.page.review")}: {t.t(`learn.review.${model.review}` as MessageKey)}</p>
      </Card>
      {model.related.length > 0 ? (
        <Card title={t.t("learn.page.related")} headingLevel={2} id="learn-related">
          <ul className={styles.index}>{model.related.map((r) => <li key={r.href}><Link href={r.href}><NameLine name={r.name} /></Link></li>)}</ul>
        </Card>
      ) : null}
      <p className={styles.foot}>{t.t("learn.page.foot")} <Link href="/start">{t.t("learn.page.foot.link")}</Link></p>
    </article>
  );
}


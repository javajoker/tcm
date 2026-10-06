import { Fragment, useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { formatDate, formatLocal, formatShortDate } from "../../app/format.ts";
import { useLoaded } from "../../app/knowledge.tsx";
import type { SavedAssessment } from "../../storage/types.ts";
import { Card } from "../../ui/index.ts";
import { FigureBlock } from "../result/figures/FigureBlock.tsx";
import { signed } from "../result/words.ts";
import { BilingualName } from "../result/shared.tsx";
import { TrendFigure } from "./TrendFigure.tsx";
import { ROWS, trend, type Segment } from "./trend.ts";
import { rowBandWord, rowName, seasonName } from "./trendWords.ts";
import styles from "./Trends.module.css";

/**
 * Trends (design §5): three or more results of one version on one timeline, in bands. It says what changed and never whether that is good: a movement is "from the … band to the … band", a movement
 * inside a band is not reported, and a different version of the rules starts a new segment after a visible gap, with nothing compared across it.
 */
export function Trends({ items }: { items: readonly SavedAssessment[] }): ReactNode {
  const { t, lang } = useI18n();
  const { kb } = useLoaded();
  const data = useMemo(() => trend(items), [items]);
  const date = (ms: number): string => formatDate(lang, ms);
  /** Two results of one day are told apart by the time of day. */
  const between = (a: number, b: number): { from: string; to: string } => (date(a) === date(b) ? { from: formatLocal(lang, a), to: formatLocal(lang, b) } : { from: date(a), to: date(b) });
  const sep = t.lang === "en" ? ", " : "、";
  const symptom = (id: string): string => { const s = kb.symptoms.get(id); return s ? (t.lang === "en" ? s.en : t.zh(s["zh-Hant"])) : id; };
  const at = (seg: Segment, id: string): number => seg.points.find((p) => p.id === id)!.createdAt;
  const num = (v: number): string => signed(v, (n) => t.number(n, { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const patternRows = (seg: Segment): { id: string; bands: (string | null)[] }[] => {
    const ids: string[] = [];
    for (const p of seg.points) for (const x of p.patterns) if (!ids.includes(x.id)) ids.push(x.id);
    return ids.map((id) => ({ id, bands: seg.points.map((p) => p.patterns.find((x) => x.id === id)?.band ?? null) }));
  };
  const range = (seg: Segment): string => (seg.points.length === 1 ? t.t("trends.segment.one", { from: date(seg.points[0]!.createdAt) }) : t.t("trends.segment", { from: date(seg.points[0]!.createdAt), to: date(seg.points.at(-1)!.createdAt) }));
  const sentences = data.segments.flatMap((seg) => seg.steps.flatMap((step) => step.changes.map((c) => ({
    key: `${step.fromId}-${step.toId}-${c.row}`,
    text: t.t("trends.change.item", { ...between(at(seg, step.fromId), at(seg, step.toId)), item: rowName(t, c.row), fromBand: rowBandWord(t, c.row, c.from), toBand: rowBandWord(t, c.row, c.to) }),
  }))));
  const profileNotes = data.segments.flatMap((seg) => seg.steps.filter((s) => s.profile.length > 0).map((s) => ({ key: `${s.fromId}-${s.toId}`, text: t.t("trends.profile.note", { ...between(at(seg, s.fromId), at(seg, s.toId)), what: s.profile.map((m) => t.t(`trends.profile.${m}` as MessageKey)).join(sep) }) })));
  const symptomSteps = data.segments.flatMap((seg) => seg.steps.filter((s) => s.added.length > 0 || s.removed.length > 0).map((s) => ({
    key: `${s.fromId}-${s.toId}`,
    text: t.t("trends.symptoms.item", { ...between(at(seg, s.fromId), at(seg, s.toId)), parts: [s.added.length > 0 ? t.t("trends.symptoms.added", { names: s.added.map(symptom).join(sep) }) : "", s.removed.length > 0 ? t.t("trends.symptoms.removed", { names: s.removed.map(symptom).join(sep) }) : ""].filter(Boolean).join("; ") }),
  })));
  const withPatterns = data.segments.some((seg) => patternRows(seg).length > 0);

  const tables = (
    <>
      {data.segments.map((seg, i) => (
        <div key={seg.points[0]!.id} className={styles.scroll} tabIndex={0} role="region" aria-label={`${t.t("trends.table.caption")} — ${range(seg)}`}>      {/* eslint-disable-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable with the keyboard */}
          <table className={styles.table}>
            <caption>{data.segments.length > 1 ? `${t.t("trends.table.caption")} — ${range(seg)}` : t.t("trends.table.caption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t.t("trends.table.col.row")}</th>
                {seg.points.map((p) => (
                  <th key={p.id} scope="col">{formatShortDate(lang, p.createdAt)} · {seasonName(t, p.season)}<br /><Link href={`/result/${p.id}`} aria-label={t.t("trends.table.open", { date: date(p.createdAt) })}>{t.t("report.history.open")}</Link></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => <tr key={row}><th scope="row">{rowName(t, row)}</th>{seg.points.map((p) => <td key={p.id}>{rowBandWord(t, row, p.bands[row])} ({num(p.values[row])})</td>)}</tr>)}
            </tbody>
          </table>
          {i < data.segments.length - 1 ? <p className={styles.gapNote}>{t.t("trends.segment.other")}</p> : null}
        </div>
      ))}
    </>
  );

  return (
    <div className={styles.wrap}>
      <div>
        <h2>{t.t("trends.title")}</h2>
        <p>{t.t("trends.intro")}</p>
        <p className="muted">{t.t("trends.note")}</p>
      </div>
      {data.segments.map((seg, i) => (
        <Fragment key={seg.points[0]!.id}>
          {i > 0 ? <p className={styles.gapNote}>{t.t("trends.segment.other")}</p> : null}
          <p style={{ margin: 0 }}><strong>{range(seg)}</strong></p>
        </Fragment>
      ))}
      <FigureBlock summary={t.t("trends.figure.summary")} figure={<TrendFigure segments={data.segments} />} table={tables} />
      <Card title={t.t("trends.changes.title")} headingLevel={3} id="trends-changes">
        {sentences.length > 0 ? <ul className={styles.list}>{sentences.map((s) => <li key={s.key}>{s.text}</li>)}</ul> : <p>{t.t("trends.changes.none")}</p>}
        {profileNotes.length > 0 ? <ul className={styles.list}>{profileNotes.map((s) => <li key={s.key}>{s.text}</li>)}</ul> : null}
      </Card>
      <Card title={t.t("trends.symptoms.title")} headingLevel={3} id="trends-symptoms">
        {symptomSteps.length > 0 ? <ul className={styles.list}>{symptomSteps.map((s) => <li key={s.key}>{s.text}</li>)}</ul> : <p>{t.t("trends.symptoms.none")}</p>}
      </Card>
      <Card title={t.t("trends.patterns.title")} headingLevel={3} id="trends-patterns">
        {withPatterns ? data.segments.map((seg) => (
          <div key={seg.points[0]!.id} className={styles.scroll} tabIndex={0} role="region" aria-label={data.segments.length > 1 ? `${t.t("trends.patterns.caption")} — ${range(seg)}` : t.t("trends.patterns.caption")}>      {/* eslint-disable-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable with the keyboard */}
            <table className={`${styles.table} ${styles.onCard}`}>
              <caption>{data.segments.length > 1 ? `${t.t("trends.patterns.caption")} — ${range(seg)}` : t.t("trends.patterns.caption")}</caption>
              <thead><tr><th scope="col">{t.t("trends.patterns.col.pattern")}</th>{seg.points.map((p) => <th key={p.id} scope="col">{formatShortDate(lang, p.createdAt)}</th>)}</tr></thead>
              <tbody>
                {patternRows(seg).map((row) => (
                  <tr key={row.id}>
                    <th scope="row">{kb.patternById.get(row.id) ? <BilingualName v={kb.patternById.get(row.id)!.name} /> : row.id}</th>
                    {row.bands.map((b, j) => <td key={seg.points[j]!.id} className={b === null ? undefined : styles.present}>{b === null ? t.t("trends.patterns.absent") : t.t(`report.band.${b}` as MessageKey)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )) : <p>{t.t("trends.patterns.none")}</p>}
      </Card>
    </div>
  );
}

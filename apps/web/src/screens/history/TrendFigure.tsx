import { useId, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { formatShortDate } from "../../app/format.ts";
import { rowBandWord, rowName, seasonName } from "./trendWords.ts";
import { BANDS, ROWS, type Segment } from "./trend.ts";
import styles from "./Trends.module.css";

const LABEL = 134;
const COL = 62;
const GAP = 34;
const ROW_H = 58;
const TOP = 6;
const STEP = 10;            // between two bands
const FOOT = 40;

/**
 * Band dot-strips (design §5.2): one small row for each of the five phases and the two axes, one mark for each assessment at its band, equally spaced in time order with the date and the season under
 * it. A single neutral colour; position carries the meaning. No line joins two marks (a line would imply a continuous measurement), and a different version of the rules is a visible gap. A mark is a
 * link that opens its result. The table twin is beside it.
 */
export function TrendFigure({ segments }: { segments: readonly Segment[] }): ReactNode {
  const { t, lang } = useI18n();
  const [, navigate] = useLocation();
  const id = useId();
  const xs: { x: number; segment: number; index: number }[] = [];
  let x = LABEL;
  segments.forEach((s, segment) => { if (segment > 0) x += GAP; s.points.forEach((_, index) => { xs.push({ x: x + COL / 2, segment, index }); x += COL; }); });
  const width = x;
  const height = ROWS.length * ROW_H + FOOT;
  const at = (segment: number, index: number): number => xs.find((p) => p.segment === segment && p.index === index)!.x;
  const boundaries = segments.slice(1).map((_, i) => at(i + 1, 0) - COL / 2 - GAP / 2);
  return (
    <div className={styles.scroll} tabIndex={0} role="region" aria-label={t.t("trends.figure.title")}>      {/* eslint-disable-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be reachable with the keyboard */}
      <svg role="group" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", minWidth: Math.min(width, 520), maxWidth: width * 1.4, height: "auto", display: "block" }}>
        <title id={`${id}-t`}>{t.t("trends.figure.title")}</title>
        <desc id={`${id}-d`}>{t.t("trends.figure.desc")}</desc>
        {boundaries.map((b) => <line key={b} x1={b} y1={0} x2={b} y2={height - FOOT + 8} stroke="var(--ink-muted)" strokeDasharray="3 4" />)}
        {ROWS.map((row, r) => {
          const y0 = r * ROW_H + TOP;
          return (
            <g key={row}>
              <text x={LABEL - 10} y={y0 + 2 * STEP + 4} textAnchor="end" fontSize={12} fill="var(--ink)">{rowName(t, row)}</text>
              {BANDS.map((_, k) => <line key={k} x1={LABEL} y1={y0 + (BANDS.length - 1 - k) * STEP} x2={width} y2={y0 + (BANDS.length - 1 - k) * STEP} stroke="var(--border)" strokeWidth={k === 2 ? 1.25 : 0.5} />)}
            </g>
          );
        })}
        {segments.map((s, segment) => s.points.map((p, index) => {
          const cx = at(segment, index);
          const when = formatShortDate(lang, p.createdAt);
          return (
            <g key={p.id}>
              {ROWS.map((row, r) => {
                const level = BANDS.indexOf(p.bands[row]);
                const cy = r * ROW_H + TOP + (BANDS.length - 1 - level) * STEP;
                return (
                  <a key={row} className={styles.mark} href={`/${lang}/result/${p.id}`} aria-label={t.t("trends.figure.mark", { row: rowName(t, row), date: when, band: rowBandWord(t, row, p.bands[row]) })}
                    onClick={(e) => { e.preventDefault(); navigate(`/result/${p.id}`); }}>
                    <circle className={styles.hit} cx={cx} cy={cy} r={22} fill="transparent" stroke="transparent" />
                    <circle className={styles.dot} cx={cx} cy={cy} r={4.5} fill="var(--ink)" />
                  </a>
                );
              })}
              <text x={cx} y={ROWS.length * ROW_H + 16} textAnchor="middle" fontSize={11} fill="var(--ink)">{when}</text>
              {p.season !== null ? <text x={cx} y={ROWS.length * ROW_H + 30} textAnchor="middle" fontSize={11} fill="var(--ink-muted)">{seasonName(t, p.season)}</text> : null}
            </g>
          );
        }))}
      </svg>
    </div>
  );
}


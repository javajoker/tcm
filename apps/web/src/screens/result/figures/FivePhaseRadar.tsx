import { useId, type ReactNode } from "react";
import { ELEMENTS, type Element } from "@tcm/wuxing";
import { useI18n } from "../../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../../i18n/catalogs.ts";
import { ELEMENT_SLUG, level5 } from "../words.ts";
import { CENTER, labelOf, pointOf, polygonOf, ringOf } from "./geometry.ts";

export interface Series { readonly label: string; readonly values: Readonly<Record<Element, number>>; /** SVG dash pattern: series are told apart by line style and marker shape, never by colour alone. */ readonly dash?: string; readonly marker: "circle" | "square" | "diamond" }

/** The one-sentence description of a radar: what stands out in the first series, in words. */
export function describeRadar(t: ReturnType<typeof useI18n>["t"], values: Readonly<Record<Element, number>>): string {
  const strongest = [...ELEMENTS].map((e) => ({ e, v: values[e] })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0]!;
  const name = t.t(`report.element.${ELEMENT_SLUG[strongest.e]}` as MessageKey);
  return level5(strongest.v) === "normal" ? t.t("report.panel.summary.none") : t.t("report.panel.summary.some", { element: name, level: t.t(`report.level.${level5(strongest.v)}` as MessageKey) });
}

/** The five-phase radar. The middle ring is "a typical healthy person" (dashed grey); every series is a polygon with its own line style and marker. The table twin carries the numbers. */
export function FivePhaseRadar({ title, series }: { title: string; series: readonly Series[] }): ReactNode {
  const { t } = useI18n();
  const id = useId();
  const first = series[0];
  if (first === undefined) return null;
  const marker = (kind: Series["marker"], x: number, y: number): ReactNode => (kind === "circle" ? <circle cx={x} cy={y} r={4} /> : kind === "square" ? <rect x={x - 4} y={y - 4} width={8} height={8} /> : <polygon points={`${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}`} />);
  return (
    <figure style={{ margin: 0 }}>
      <svg role="img" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} viewBox="0 0 260 260" style={{ width: "100%", maxWidth: 360, height: "auto", display: "block", margin: "0 auto" }}>
        <title id={`${id}-t`}>{title}</title>
        <desc id={`${id}-d`}>{describeRadar(t, first.values)}</desc>
        {[-1.5, 1.5, 3].map((v) => <polygon key={v} points={ringOf(v)} fill="none" stroke="var(--border)" strokeWidth={1} />)}
        <polygon points={ringOf(0)} fill="none" stroke="var(--ink-muted)" strokeWidth={1.5} strokeDasharray="2 4" />
        {ELEMENTS.map((_, i) => { const [x, y] = pointOf(i, 3); return <line key={i} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />; })}
        {series.map((s, k) => (
          <g key={s.label} fill={k === 0 ? "var(--primary)" : "var(--surface)"} stroke={k === 0 ? "var(--primary)" : "var(--ink)"} strokeWidth={2}>
            <polygon points={polygonOf(s.values)} fill={k === 0 ? "var(--scale-3)" : "none"} fillOpacity={k === 0 ? 0.45 : 0} {...(s.dash ? { strokeDasharray: s.dash } : {})} />
            {ELEMENTS.map((e, i) => { const [x, y] = pointOf(i, s.values[e]); return <g key={e}>{marker(s.marker, x, y)}</g>; })}
          </g>
        ))}
        {ELEMENTS.map((e, i) => { const l = labelOf(i); return <text key={e} x={l.x} y={l.y} textAnchor={l.anchor} fontSize={13} fill="var(--ink)">{t.t(`report.element.${ELEMENT_SLUG[e]}` as MessageKey)}</text>; })}
      </svg>
      <figcaption className="muted" style={{ textAlign: "center" }}>
        {series.map((s) => <span key={s.label} style={{ marginInline: "var(--space-2)" }}>{s.marker === "circle" ? "●" : s.marker === "square" ? "■" : "◆"} {s.label}</span>)}
        <span style={{ marginInline: "var(--space-2)" }}>┈ {t.t("report.figure.normalRing")}</span>
      </figcaption>
    </figure>
  );
}

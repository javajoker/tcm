import type { ReactNode } from "react";
import { ELEMENTS, type Element } from "@tcm/wuxing";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import type { SavedAssessment } from "../../storage/types.ts";
import { Card } from "../../ui/index.ts";
import { BagangAxes, SignedBars } from "./figures/BarFigures.tsx";
import { FigureBlock } from "./figures/FigureBlock.tsx";
import { describeRadar, FivePhaseRadar } from "./figures/FivePhaseRadar.tsx";
import { OffsetCompare } from "./figures/OffsetCompare.tsx";
import { OrganHeat } from "./figures/OrganHeat.tsx";
import { HourNote } from "./HourNote.tsx";
import { SeasonLine } from "./SeasonLine.tsx";
import { ELEMENT_SLUG, level5, LIUXIE_SLUG, ORGAN_SLUG, PRODUCT_SLUG, signed, YINGWEI_SLUG } from "./words.ts";

const th = { textAlign: "start", padding: "0.4rem 0.6rem", borderBottom: "2px solid var(--border-strong)" } as const;
const td = { padding: "0.4rem 0.6rem", borderBottom: "1px solid var(--border)" } as const;

/** A real table (caption, column and row headers): the text equivalent of every figure. */
export function DataTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }): ReactNode {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", marginBottom: "var(--space-4)" }}>
        <caption style={{ textAlign: "start", fontWeight: 600, padding: "0.4rem 0" }}>{caption}</caption>
        <thead><tr>{head.map((h) => <th key={h} scope="col" style={th}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row" style={{ ...td, textAlign: "start", fontWeight: 500 }}>{c}</th> : <td key={j} style={td}>{c}</td>))}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** ③ Panel (盤面): figures (radar, bars, axes, organ heat map, offsets) each with a one-sentence description and its table twin; values are words first, numbers in the tables. */
export function Panel({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const p = saved.result.panel;
  const ref = saved.result.reference;
  const num = (v: number): string => signed(v, (n) => t.number(n, { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const element = (e: Element): string => t.t(`report.element.${ELEMENT_SLUG[e]}` as MessageKey);
  const level = (v: number, range = 3): string => t.t(`report.level.${level5(v, range)}` as MessageKey);

  const liuxie = (Object.keys(LIUXIE_SLUG) as (keyof typeof LIUXIE_SLUG)[]).map((k) => ({ label: t.t(`report.liuxie.${LIUXIE_SLUG[k]}` as MessageKey), v: p.observed[`liuxie.${k}`] ?? 0 }));
  const products = (Object.keys(PRODUCT_SLUG) as (keyof typeof PRODUCT_SLUG)[]).map((k) => ({ label: t.t(`report.product.${PRODUCT_SLUG[k]}` as MessageKey), v: p.observed[`product.${k}`] ?? 0 }));
  const bars = [...liuxie, ...products];
  const strongestBar = [...bars].sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
  const barSummary = strongestBar !== undefined && level5(strongestBar.v) !== "normal" ? t.t("report.figure.bars.summary.some", { item: strongestBar.label, level: level(strongestBar.v) }) : t.t("report.figure.bars.summary.none");

  // 營衛 (PM-52): 衛氣, 營氣 and the pores, in words; the pores read as open (sweating) or closed (no sweat) rather than low or high
  const yingwei = (Object.keys(YINGWEI_SLUG) as (keyof typeof YINGWEI_SLUG)[]).map((k) => ({ key: k, label: t.t(`report.yingwei.${YINGWEI_SLUG[k]}` as MessageKey), v: p.observed[`yingwei.${k}`] ?? 0 }));
  const yingweiLevel = (k: keyof typeof YINGWEI_SLUG, v: number): string => {
    if (k !== "開闔") return level(v);
    const l = level5(v);
    return l === "normal" ? level(v) : t.t(`report.yingwei.kaihe.${l === "low" ? "open" : l === "somewhatLow" ? "somewhatOpen" : l === "somewhatHigh" ? "somewhatClosed" : "closed"}` as MessageKey);
  };
  const strongestYingwei = [...yingwei].sort((a, c) => Math.abs(c.v) - Math.abs(a.v))[0];
  const yingweiSummary = strongestYingwei !== undefined && level5(strongestYingwei.v) !== "normal"
    ? t.t("report.figure.yingwei.summary.some", { item: strongestYingwei.label, level: yingweiLevel(strongestYingwei.key, strongestYingwei.v) }) : t.t("report.figure.yingwei.summary.none");
  const showYingwei = yingwei.some((r) => r.v !== 0);

  const b = p.bagang;
  const axis = (key: "coldHeat" | "deficiencyExcess", v: number): string => t.t(`report.axis.${key}.${level5(v, 1)}` as MessageKey);
  const exterior = b.exterior < 0.2 ? "none" : b.exterior < 0.5 ? "slight" : "clear";
  const axesSummary = t.t("report.figure.axes.summary", { coldHeat: axis("coldHeat", b.coldHeat), deficiencyExcess: axis("deficiencyExcess", b.deficiencyExcess), exterior: t.t(`report.axis.exterior.${exterior}` as MessageKey), yinYang: t.t(`report.axis.yinYang.${b.yinYang}` as MessageKey) });

  const organs = Object.entries(p.observed).filter(([k]) => /^[^.]+\.(qi|blood|yin|yang|stasis)$/.test(k) && !k.startsWith("liuxie.") && !k.startsWith("product.") && !k.startsWith("bagang."));
  const topOrgan = [...organs].sort(([, x], [, y]) => Math.abs(y) - Math.abs(x))[0];
  const organSummary = topOrgan !== undefined && level5(topOrgan[1]) !== "normal"
    ? (() => { const [o, c] = topOrgan[0].split("."); return t.t("report.figure.organs.summary.some", { organ: o && o in ORGAN_SLUG ? t.t(`report.organ.${ORGAN_SLUG[o as keyof typeof ORGAN_SLUG]}` as MessageKey) : o ?? "", channel: t.t(`report.channel.${c ?? "qi"}` as MessageKey), level: level(topOrgan[1]) }); })()
    : t.t("report.figure.organs.summary.none");

  const itemHead = [t.t("report.panel.col.item"), t.t("report.panel.col.level"), t.t("report.panel.col.value")];
  const series = [{ label: t.t("report.figure.series.typical"), values: p.offsetPopulation, marker: "circle" as const }, ...(p.offsetPersonal !== null ? [{ label: t.t("report.figure.series.usual"), values: p.offsetPersonal, dash: "6 4", marker: "square" as const }] : [])];

  return (
    <Card title={t.t("report.panel.title")} id="sec-panel">
      <p className="muted">{t.t("report.panel.valueNote")}</p>
      <h3>{t.t("report.panel.primary")}</h3>
      <FigureBlock summary={describeRadar(t, p.offsetPopulation)} figure={<FivePhaseRadar title={t.t("report.figure.radar.title")} series={series} />}
        table={<DataTable caption={t.t("report.panel.caption.wuxing")} head={itemHead} rows={ELEMENTS.map((e) => [element(e), level(p.offsetPopulation[e]), num(p.offsetPopulation[e])])} />} />
      <FigureBlock summary={barSummary} figure={<SignedBars title={t.t("report.figure.bars.title")} rows={bars.map((r) => ({ label: r.label, value: r.v }))} description={barSummary} />}
        table={<DataTable caption={t.t("report.panel.caption.liuxie")} head={itemHead} rows={bars.map((r) => [r.label, level(r.v), num(r.v)])} />} />
      {showYingwei ? (
        <FigureBlock summary={yingweiSummary} figure={<SignedBars title={t.t("report.figure.yingwei.title")} rows={yingwei.map((r) => ({ label: r.label, value: r.v }))} description={yingweiSummary} />}
          table={<DataTable caption={t.t("report.panel.caption.yingwei")} head={itemHead} rows={yingwei.map((r) => [r.label, yingweiLevel(r.key, r.v), num(r.v)])} />} />
      ) : null}
      <FigureBlock summary={axesSummary}
        figure={<BagangAxes title={t.t("report.figure.axes.title")} description={axesSummary} axes={[{ key: "coldHeat", value: b.coldHeat, min: -1, max: 1 }, { key: "deficiencyExcess", value: b.deficiencyExcess, min: -1, max: 1 }, { key: "exterior", value: b.exterior, min: 0, max: 1 }]} />}
        table={<DataTable caption={t.t("report.panel.caption.bagang")} head={itemHead} rows={[
          [t.t("report.panel.axis.coldHeat"), axis("coldHeat", b.coldHeat), num(b.coldHeat)],
          [t.t("report.panel.axis.deficiencyExcess"), axis("deficiencyExcess", b.deficiencyExcess), num(b.deficiencyExcess)],
          [t.t("report.panel.axis.exterior"), t.t(`report.axis.exterior.${exterior}` as MessageKey), t.number(b.exterior, { maximumFractionDigits: 1, minimumFractionDigits: 1 })],
          [t.t("report.panel.axis.yinYang"), t.t(`report.axis.yinYang.${b.yinYang}` as MessageKey), "—"],
        ]} />} />
      <p>{organSummary}</p>
      <OrganHeat observed={p.observed} caption={t.t("report.panel.caption.organs")} />

      {p.offsetPersonal !== null && p.alignment !== null ? (
        <>
          <h3>{t.t("report.panel.secondary")}</h3>
          <p className="muted">{t.t("report.panel.birthNote")}{t.t("safety.notice.birth.text")}</p>
          <FigureBlock summary={t.t("report.figure.offsets.title")}
            figure={<OffsetCompare title={t.t("report.figure.offsets.title")} description={t.t("report.figure.offsets.title")} primary={p.offsetPopulation} personal={p.offsetPersonal} alignment={p.alignment} />}
            table={<DataTable caption={t.t("report.panel.secondary")} head={[t.t("report.panel.col.item"), t.t("report.panel.col.typical"), t.t("report.panel.col.usual"), t.t("report.panel.col.match")]}
              rows={ELEMENTS.map((e) => [element(e), num(p.offsetPopulation[e]), num(p.offsetPersonal![e]), t.t(`report.panel.align.${p.alignment![e]}` as MessageKey)])} />} />
        </>
      ) : null}
      {ref !== null ? (
        <section aria-labelledby="panel-blocks">
          <h3 id="panel-blocks">{t.t("report.panel.blocks")}</h3>
          <SeasonLine saved={saved} />
          <ul>
            {(["innate", "annualBazi", "yunqi", "season"] as const).map((k) => {
              const v = ref.panel.components[k];
              if (!v) return null;
              const parts = ELEMENTS.filter((e) => Math.abs(v[e]) >= 0.05).map((e) => `${element(e)} ${num(v[e])}`);
              return parts.length === 0 ? null : <li key={k}><strong>{t.t(`report.panel.block.${k}` as MessageKey)}</strong>: {parts.join(" · ")}</li>;
            })}
          </ul>
          <HourNote saved={saved} />
        </section>
      ) : null}
    </Card>
  );
}

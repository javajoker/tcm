import type { ReactNode } from "react";
import { ELEMENTS, type Element } from "@tcm/wuxing";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import type { SavedAssessment } from "../../storage/types.ts";
import { Card } from "../../ui/index.ts";
import { CHANNELS, ELEMENT_SLUG, level5, LIUXIE_SLUG, ORGAN_SLUG, PRODUCT_SLUG, signed } from "./words.ts";

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

/** ③ Panel (盤面): the observed panel in words, with the numbers in the table twins. Figures (radar, heat-map, bars) are added over these tables by U-16. */
export function Panel({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const p = saved.result.panel;
  const ref = saved.result.reference;
  const num = (v: number): string => signed(v, (n) => t.number(n, { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const element = (e: Element): string => t.t(`report.element.${ELEMENT_SLUG[e]}` as MessageKey);
  const level = (v: number, range = 3): string => t.t(`report.level.${level5(v, range)}` as MessageKey);

  const strongest = [...ELEMENTS].map((e) => ({ e, v: p.offsetPopulation[e] })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
  const summary = strongest !== undefined && level5(strongest.v) !== "normal"
    ? t.t("report.panel.summary.some", { element: element(strongest.e), level: level(strongest.v) }) : t.t("report.panel.summary.none");

  const liuxie = (Object.keys(LIUXIE_SLUG) as (keyof typeof LIUXIE_SLUG)[]).map((k) => ({ label: t.t(`report.liuxie.${LIUXIE_SLUG[k]}` as MessageKey), v: p.observed[`liuxie.${k}`] ?? 0 }));
  const products = (Object.keys(PRODUCT_SLUG) as (keyof typeof PRODUCT_SLUG)[]).map((k) => ({ label: t.t(`report.product.${PRODUCT_SLUG[k]}` as MessageKey), v: p.observed[`product.${k}`] ?? 0 }));
  const organs = (Object.keys(ORGAN_SLUG) as (keyof typeof ORGAN_SLUG)[]).map((o) => ({ organ: o, label: t.t(`report.organ.${ORGAN_SLUG[o]}` as MessageKey), cells: CHANNELS.map((c) => p.observed[`${o}.${c}`] ?? 0) })).filter((r) => r.cells.some((v) => v !== 0));
  const liuxieRows = [...liuxie, ...products].filter((r) => Math.abs(r.v) >= 0.05);
  const b = p.bagang;
  const axis = (key: "coldHeat" | "deficiencyExcess", v: number): string => t.t(`report.axis.${key}.${level5(v, 1)}` as MessageKey);
  const exterior = b.exterior < 0.2 ? "none" : b.exterior < 0.5 ? "slight" : "clear";
  return (
    <Card title={t.t("report.panel.title")} id="sec-panel">
      <p>{summary}</p>
      <p className="muted">{t.t("report.panel.valueNote")}</p>
      <h3>{t.t("report.panel.primary")}</h3>
      <DataTable caption={t.t("report.panel.caption.wuxing")} head={[t.t("report.panel.col.item"), t.t("report.panel.col.level"), t.t("report.panel.col.value")]}
        rows={ELEMENTS.map((e) => [element(e), level(p.offsetPopulation[e]), num(p.offsetPopulation[e])])} />
      {liuxieRows.length === 0 ? <p>{t.t("report.panel.liuxie.none")}</p> : (
        <>
          <DataTable caption={t.t("report.panel.caption.liuxie")} head={[t.t("report.panel.col.item"), t.t("report.panel.col.level"), t.t("report.panel.col.value")]}
            rows={liuxieRows.map((r) => [r.label, level(r.v), num(r.v)])} />
          <p className="muted" style={{ marginTop: "calc(var(--space-3) * -1)" }}>{t.t("report.panel.liuxie.rest")}</p>
        </>
      )}
      <DataTable caption={t.t("report.panel.caption.bagang")} head={[t.t("report.panel.col.item"), t.t("report.panel.col.level"), t.t("report.panel.col.value")]}
        rows={[
          [t.t("report.panel.axis.coldHeat"), axis("coldHeat", b.coldHeat), num(b.coldHeat)],
          [t.t("report.panel.axis.deficiencyExcess"), axis("deficiencyExcess", b.deficiencyExcess), num(b.deficiencyExcess)],
          [t.t("report.panel.axis.exterior"), t.t(`report.axis.exterior.${exterior}` as MessageKey), t.number(b.exterior, { maximumFractionDigits: 1, minimumFractionDigits: 1 })],
          [t.t("report.panel.axis.yinYang"), t.t(`report.axis.yinYang.${b.yinYang}` as MessageKey), "—"],
        ]} />
      {organs.length === 0 ? <p>{t.t("report.panel.organs.none")}</p> : (
        <DataTable caption={t.t("report.panel.caption.organs")} head={[t.t("report.panel.col.item"), ...CHANNELS.map((c) => t.t(`report.channel.${c}` as MessageKey))]}
          rows={organs.map((r) => [r.label, ...r.cells.map((v) => (v === 0 ? "—" : `${level(v)} (${num(v)})`))])} />
      )}

      {p.offsetPersonal !== null && p.alignment !== null ? (
        <>
          <h3>{t.t("report.panel.secondary")}</h3>
          <p className="muted">{t.t("report.panel.birthNote")}{t.t("safety.notice.birth.text")}</p>
          <DataTable caption={t.t("report.panel.secondary")} head={[t.t("report.panel.col.item"), t.t("report.panel.col.typical"), t.t("report.panel.col.usual"), t.t("report.panel.col.match")]}
            rows={ELEMENTS.map((e) => [element(e), num(p.offsetPopulation[e]), num(p.offsetPersonal![e]), t.t(`report.panel.align.${p.alignment![e]}` as MessageKey)])} />
        </>
      ) : null}
      {ref !== null ? (
        <section aria-labelledby="panel-blocks">
          <h3 id="panel-blocks">{t.t("report.panel.blocks")}</h3>
          <ul>
            {(["innate", "annualBazi", "yunqi", "season"] as const).map((k) => {
              const v = ref.panel.components[k];
              if (!v) return null;
              const parts = ELEMENTS.filter((e) => Math.abs(v[e]) >= 0.05).map((e) => `${element(e)} ${num(v[e])}`);
              return parts.length === 0 ? null : <li key={k}><strong>{t.t(`report.panel.block.${k}` as MessageKey)}</strong>: {parts.join(" · ")}</li>;
            })}
          </ul>
        </section>
      ) : null}
    </Card>
  );
}

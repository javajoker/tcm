import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { formatLocal } from "../../app/format.ts";
import { useLoaded } from "../../app/knowledge.tsx";
import type { SavedAssessment } from "../../storage/types.ts";
import { Button, Card } from "../../ui/index.ts";
import { DataTable } from "../result/Panel.tsx";
import { BilingualName } from "../result/shared.tsx";
import { FigureBlock } from "../result/figures/FigureBlock.tsx";
import { describeRadar, FivePhaseRadar } from "../result/figures/FivePhaseRadar.tsx";
import { ELEMENT_SLUG, level5, signed } from "../result/words.ts";
import { compare } from "./model.ts";

/** Two saved results side by side: ranking of patterns, the five-phase panel, the eight principles, and what changed in the inputs. (Overlaid radars follow with U-16.) */
export function CompareView({ a, b, onBack }: { a: SavedAssessment; b: SavedAssessment; onBack: () => void }): ReactNode {
  const { t, lang } = useI18n();
  const { kb } = useLoaded();
  const c = compare(a, b);
  const num = (v: number): string => signed(v, (n) => t.number(n, { maximumFractionDigits: 1, minimumFractionDigits: 1 }));
  const pattern = (id: string | null): ReactNode => { const p = id ? kb.patternById.get(id) : undefined; return p ? <BilingualName v={p.name} /> : "—"; };
  const symptom = (id: string): string => { const s = kb.symptoms.get(id); return s ? (lang === "en" ? s.en : kb.zh(s["zh-Hant"])) : id; };
  const sev = (v: string | null): string => (v ? t.t(`intake.severity.${v}` as MessageKey) : "—");
  const list = (ids: readonly string[]): string => ids.map(symptom).join(lang === "en" ? ", " : "、");
  const head = (which: "earlier" | "later"): string => `${t.t(`report.compare.${which}`)}: ${formatLocal(lang, c[which].createdAt)}`;

  return (
    <>
      <h1>{t.t("report.compare.title")}</h1>
      <p><Button onClick={onBack}>{t.t("report.compare.back")}</Button></p>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <Card title={t.t("report.compare.ranking")} headingLevel={2} id="compare-ranking">
          <DataTable caption={t.t("report.compare.ranking")} head={[t.t("report.compare.ranking.col.rank"), head("earlier"), head("later")]} rows={c.ranking.map((r) => [String(r.rank), pattern(r.earlier), pattern(r.later)])} />
        </Card>
        <Card title={t.t("report.compare.panel")} headingLevel={2} id="compare-panel">
          <FigureBlock summary={describeRadar(t, c.later.result.panel.offsetPopulation)}
            figure={<FivePhaseRadar title={t.t("report.figure.radar.title")} series={[
              { label: head("earlier"), values: c.earlier.result.panel.offsetPopulation, marker: "circle" },
              { label: head("later"), values: c.later.result.panel.offsetPopulation, dash: "6 4", marker: "square" },
            ]} />}
            table={<DataTable caption={t.t("report.compare.panel")} head={[t.t("report.panel.col.item"), head("earlier"), head("later"), t.t("report.compare.panel.col.change")]}
              rows={c.panel.map((r) => [t.t(`report.element.${ELEMENT_SLUG[r.element]}` as MessageKey), `${t.t(`report.level.${level5(r.earlier)}` as MessageKey)} (${num(r.earlier)})`, `${t.t(`report.level.${level5(r.later)}` as MessageKey)} (${num(r.later)})`, num(r.change)])} />} />
        </Card>
        <Card title={t.t("report.compare.axes")} headingLevel={2} id="compare-axes">
          <DataTable caption={t.t("report.compare.axes")} head={[t.t("report.panel.col.item"), head("earlier"), head("later")]}
            rows={[
              [t.t("report.panel.axis.coldHeat"), ...c.axes.coldHeat.map((v) => `${t.t(`report.axis.coldHeat.${level5(v, 1)}` as MessageKey)} (${num(v)})`)],
              [t.t("report.panel.axis.deficiencyExcess"), ...c.axes.deficiencyExcess.map((v) => `${t.t(`report.axis.deficiencyExcess.${level5(v, 1)}` as MessageKey)} (${num(v)})`)],
            ]} />
        </Card>
        <Card title={t.t("report.compare.inputs")} headingLevel={2} id="compare-inputs">
          {c.added.length === 0 && c.removed.length === 0 && c.severity.length === 0 ? <p>{t.t("report.compare.inputs.none")}</p> : (
            <ul>
              {c.added.length > 0 ? <li><strong>{t.t("report.compare.inputs.added")}</strong> {list(c.added)}</li> : null}
              {c.removed.length > 0 ? <li><strong>{t.t("report.compare.inputs.removed")}</strong> {list(c.removed)}</li> : null}
              {c.severity.length > 0 ? <li><strong>{t.t("report.compare.inputs.severity")}</strong> {c.severity.map((s) => t.t("report.compare.severity.item", { symptom: symptom(s.symptom), from: sev(s.from), to: sev(s.to) })).join(lang === "en" ? "; " : "；")}</li> : null}
            </ul>
          )}
          {c.profileChanged ? <p>{t.t("report.compare.inputs.profile")}</p> : null}
        </Card>
      </div>
    </>
  );
}

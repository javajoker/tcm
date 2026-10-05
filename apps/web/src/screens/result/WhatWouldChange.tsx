import type { ReactNode } from "react";
import type { TraceItem } from "@tcm/engine";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useLoaded } from "../../app/knowledge.tsx";
import type { SavedAssessment } from "../../storage/types.ts";
import { Card } from "../../ui/index.ts";

/** ⑨ What would change this: "if you also had …, the result would lean towards … rather than …" (from the engine's differential). */
export function WhatWouldChange({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const items = saved.result.trace.filter((x): x is Extract<TraceItem, { kind: "whatWouldChange" }> => x.kind === "whatWouldChange");
  const name = (id: string): string => t.localized(kb.patternById.get(id)?.name ?? { "zh-Hant": id, en: null }).text;
  const symptom = (id: string): string => { const s = kb.symptoms.get(id); return s ? (t.lang === "en" ? s.en : t.zh(s["zh-Hant"])) : id; };
  return (
    <Card title={t.t("report.change.title")} id="sec-change">
      {items.length === 0 ? <p className="muted">{t.t("report.change.none")}</p> : (
        <ul>{items.map((x) => <li key={`${x.shiftsTo}-${x.over}`}>{t.t("report.change.item", { symptoms: x.ifSymptoms.map(symptom).join(t.lang === "en" ? ", " : "、"), lean: name(x.shiftsTo), over: name(x.over) })}</li>)}</ul>
      )}
    </Card>
  );
}

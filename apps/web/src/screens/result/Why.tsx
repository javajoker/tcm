import type { ReactNode } from "react";
import type { TraceItem } from "@tcm/engine";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { CitationChips } from "../../app/citations.tsx";
import { useLoaded } from "../../app/knowledge.tsx";
import type { SavedAssessment } from "../../storage/types.ts";
import { Card, Chip } from "../../ui/index.ts";
import { FeedbackMarks } from "./feedback.tsx";
import { patternKey } from "./feedbackModel.ts";
import { BilingualName } from "./shared.tsx";

const SHOW = 6;

/** ④ Why (the reasoning trace in plain language): what you reported → how it counts → the classical basis; and what points the other way. */
export function Why({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const a = saved.result;
  const trace = a.trace;
  const symptom = (id: string): ReactNode => {
    const s = kb.symptoms.get(id);
    if (!s) return id;
    return t.lang === "en" ? <>{s.en} <span className="muted" lang={t.zhLang}>（{t.zh(s["zh-Hant"])}）</span></> : <span lang={t.zhLang}>{t.zh(s["zh-Hant"])}</span>;
  };
  const sev = (id: string): string | null => { const v = saved.input.findings[id]?.severity; return v ? t.t(`intake.severity.${v}` as MessageKey) : null; };
  const num = (n: number): string => t.number(n, { maximumFractionDigits: 2 });

  const patterns = a.verdict.patterns.map((p) => p.id);
  const evidence = (id: string): Extract<TraceItem, { kind: "evidence" }>[] => trace.filter((x): x is Extract<TraceItem, { kind: "evidence" }> => x.kind === "evidence" && x.patternId === id).sort((x, y) => y.contribution - x.contribution);
  const against = (id: string): Extract<TraceItem, { kind: "against" }>[] => trace.filter((x): x is Extract<TraceItem, { kind: "against" }> => x.kind === "against" && x.patternId === id).sort((x, y) => y.penalty - x.penalty);
  const theory = (id: string): readonly string[] => trace.find((x): x is Extract<TraceItem, { kind: "theory" }> => x.kind === "theory" && x.patternId === id)?.citations ?? [];
  const elements = trace.filter((x): x is Extract<TraceItem, { kind: "element" }> => x.kind === "element");

  const row = (e: Extract<TraceItem, { kind: "evidence" }>): ReactNode => (
    <li key={e.symptomId}>
      <details>
        <summary style={{ minHeight: 44, display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", cursor: "pointer" }}>
          <span>{symptom(e.symptomId)}{sev(e.symptomId) ? <span className="muted"> ({sev(e.symptomId)})</span> : null}</span>
          {e.quality < 0.9 ? <Chip tone="notice">{t.t("report.why.selfObserved")}</Chip> : null}
        </summary>
        <p className="muted">{t.t("report.why.detail", { w: num(e.weight), s: num(e.severity), q: num(e.quality), c: num(e.contribution) })}</p>
      </details>
    </li>
  );

  if (patterns.length === 0) {
    return <Card title={t.t("report.why.title")} id="sec-why"><p className="muted">{t.t("report.why.none")}</p></Card>;
  }
  return (
    <Card title={t.t("report.why.title")} id="sec-why">
      {patterns.map((id) => {
        const rec = kb.patternById.get(id);
        const ev = evidence(id), ag = against(id), cites = theory(id);
        if (!rec) return null;
        return (
          <section key={id} aria-labelledby={`why-${id}`} style={{ marginBottom: "var(--space-5)" }}>
            <h3 id={`why-${id}`}><BilingualName v={rec.name} /></h3>
            <h4>{t.t("report.why.reported")}</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>{ev.slice(0, SHOW).map(row)}</ul>
            {ev.length > SHOW ? (
              <details>
                <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>{t.t("report.why.showAll", { n: ev.length })}</summary>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>{ev.slice(SHOW).map(row)}</ul>
              </details>
            ) : null}
            {cites.length > 0 ? (<><h4>{t.t("report.why.basis")}</h4><p><CitationChips ids={cites} usedFor={t.localized(rec.name).text} /></p></>) : null}
            {ag.length > 0 ? (
              <>
                <h4>{t.t("report.why.against")}</h4>
                <ul>{ag.map((x) => <li key={x.symptomId}>{symptom(x.symptomId)} <span className="muted">— {t.t("report.why.againstItem", { p: num(x.penalty) })}</span></li>)}</ul>
              </>
            ) : null}
            <FeedbackMarks itemKey={patternKey(id)} label={t.localized(rec.name).text} />
          </section>
        );
      })}
      {elements.length > 0 ? (
        <section aria-labelledby="why-elements">
          <h3 id="why-elements">{t.t("report.why.element")}</h3>
          <ul>{elements.map((e) => { const r = kb.elementById.get(e.elementId); return r ? <li key={e.elementId}><BilingualName v={r.name} /> <Chip>{t.number(e.pct / 100, { style: "percent", maximumFractionDigits: 0 })}</Chip></li> : null; })}</ul>
        </section>
      ) : null}
    </Card>
  );
}

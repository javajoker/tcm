import type { ReactNode } from "react";
import { Link } from "wouter";
import type { FormulaRecommendation } from "@tcm/engine";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { CitationChips } from "../../app/citations.tsx";
import { useLoaded } from "../../app/knowledge.tsx";
import type { SavedAssessment } from "../../storage/types.ts";
import { Card, Chip } from "../../ui/index.ts";
import { FeedbackMarks } from "./feedback.tsx";
import { formulaKey } from "./feedbackModel.ts";
import { FoodItem, Lifestyle, PointItem, PressingNotes } from "./Guidance.tsx";
import { AcupointFigures } from "./figures/AcupointFigures.tsx";
import { BilingualName, Prose, ZhText } from "./shared.tsx";

const ROLE_SLUG = { 君: "sovereign", 臣: "minister", 佐: "assistant", 使: "envoy" } as const;

/** Match words from the share of the deviation a formula corrects (UX spec §4.10: words first, the number in the details). */
export const matchWord = (explained: number): "good" | "moderate" | "partial" => (explained >= 0.6 ? "good" : explained >= 0.4 ? "moderate" : "partial");

function FormulaCard({ f, savedId, study }: { f: FormulaRecommendation; savedId: string; study: boolean }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const rec = kb.formulas.get(f.id);
  if (!rec) return null;
  const symptom = (id: string): string => { const s = kb.symptoms.get(id); return s ? (t.lang === "en" ? s.en : t.zh(s["zh-Hant"])) : id; };
  const word = matchWord(f.fit.explained);
  const name = rec.name;
  return (
    <Card title={<BilingualName v={name} tag="strong" />} headingLevel={4}>
      <p style={{ margin: "0 0 var(--space-2)" }}>
        <Chip tone={study ? "notice" : "primary"}>{t.t("report.formula.tier", { tier: f.tier })}</Chip>{" "}
        <Chip>{t.t("report.formula.match")}: {t.t(`report.match.${word}` as MessageKey)}</Chip>{" "}
        <span className="muted">{t.t("report.formula.source", { book: t.zh(rec.source.book) })}</span>
      </p>
      <p><Prose zh={rec.rationale_zh} en={rec.rationale_en} status={rec.en_status} /></p>
      <details>
        <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>{t.t("report.formula.composition")}</summary>
        <ul style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", listStyle: "none", padding: 0 }}>
          {f.composition.map((r) => <li key={r.herb}><Chip><span lang={t.zhLang} title={t.t(`report.role.${ROLE_SLUG[r.role]}` as MessageKey)}>{t.zh(r.role)}</span> {t.localized(r.name).text}</Chip></li>)}
        </ul>
        <p className="muted">{t.t("report.formula.explained", { pct: t.number(f.fit.explained, { style: "percent", maximumFractionDigits: 0 }) })}</p>
      </details>
      {f.fit.matched.length > 0 ? <p><strong>{t.t("report.formula.matches")}</strong> {f.fit.matched.map((id, i) => <span key={id}>{i > 0 ? "、" : ""}{symptom(id)}</span>)}</p> : null}
      {f.fit.unmatched.length > 0 ? <p className="muted"><strong>{t.t("report.formula.notMatches")}</strong> {f.fit.unmatched.map((id, i) => <span key={id}>{i > 0 ? "、" : ""}{symptom(id)}</span>)}</p> : null}
      {rec.cautions.length > 0 || f.annotations.length > 0 ? (
        <>
          <h5 style={{ margin: "var(--space-3) 0 var(--space-1)" }}>{t.t("report.formula.cautions")}</h5>
          <ul>{rec.cautions.map((c, i) => <li key={c}><Prose zh={c} en={rec.cautions_en[i]} status={rec.en_status} /></li>)}{f.annotations.map((n) => <li key={n.ruleId}>{t.localized(n.message).text}</li>)}</ul>
        </>
      ) : null}
      <p className="muted">{t.t("safety.notice.formula.text")}</p>
      <p><CitationChips ids={f.citations} usedFor={t.localized(name).text} /></p>
      <FeedbackMarks itemKey={formulaKey(f.id)} label={t.localized(name).text} />
      <p style={{ margin: 0 }}><Link href={`/result/${savedId}/formula/${f.id}`} aria-label={t.t("report.formula.open", { name: t.localized(name).text })}>{t.t("report.formula.open", { name: t.localized(name).text })}</Link></p>
    </Card>
  );
}

/** ⑥ Advice, by level: what the policy allows is already decided in the result; nothing here hides or adds. */
export function Advice({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const r = saved.result.recommendations;
  const patternName = (id: string): string => t.localized(kb.patternById.get(id)?.name ?? { "zh-Hant": id, en: null }).text;
  return (
    <Card title={t.t("report.advice.title")} id="sec-advice">
      {r.status === "insufficient-information" ? <p className="muted">{t.t("report.advice.insufficient")}</p> : null}
      {r.status === "limited-by-level" ? <p className="muted">{t.t("report.advice.limited")}</p> : null}

      {r.principles.length > 0 ? (
        <section aria-labelledby="adv-principles">
          <h3 id="adv-principles">{t.t("report.advice.principles")}</h3>
          <ul>{r.principles.map((p) => <li key={p.patternId}><strong>{patternName(p.patternId)}</strong>: <Prose zh={p.text} en={kb.patternById.get(p.patternId)?.principle_en} status={kb.patternById.get(p.patternId)?.en_status} /></li>)}</ul>
        </section>
      ) : null}

      <section aria-labelledby="adv-formulas">
        <h3 id="adv-formulas">{t.t("report.advice.formulas")}</h3>
        {r.formulas.length === 0 && r.studyOnly.length === 0 ? <p className="muted">{t.t("report.advice.formulasNone")}</p> : null}
        <div style={{ display: "grid", gap: "var(--space-3)" }}>{r.formulas.map((f) => <FormulaCard key={f.id} f={f} savedId={saved.id} study={false} />)}</div>
        {r.studyOnly.length > 0 ? (
          <>
            <h4>{t.t("report.advice.study")}</h4>
            <div style={{ display: "grid", gap: "var(--space-3)" }}>{r.studyOnly.map((f) => <FormulaCard key={f.id} f={f} savedId={saved.id} study />)}</div>
          </>
        ) : null}
      </section>

      {r.foods.length > 0 ? (
        <section aria-labelledby="adv-diet">
          <h3 id="adv-diet">{t.t("report.advice.diet")}</h3>
          <ul>{r.foods.map((f) => <FoodItem key={f.name} food={f} />)}</ul>
        </section>
      ) : null}

      {r.acupoints.length > 0 ? (
        <section aria-labelledby="adv-points">
          <h3 id="adv-points">{t.t("report.advice.points")}</h3>
          <AcupointFigures points={r.acupoints} />
          <ul>{r.acupoints.map((p) => <PointItem key={p.name} point={p} />)}</ul>
          <PressingNotes />
        </section>
      ) : null}

      <section aria-labelledby="adv-life">
        <h3 id="adv-life">{t.t("report.advice.lifestyle")}</h3>
        {r.lifestyle.length > 0 ? <ul>{r.lifestyle.map((l) => <li key={l.patternId}><strong>{patternName(l.patternId)}</strong>: <Lifestyle patternId={l.patternId} fallback={<ZhText>{l.text}</ZhText>} /></li>)}</ul> : null}
        <p><strong>{t.t("report.advice.general")}</strong>: <Prose zh={r.general.text} en={kb.treatment.general.text_en} status={kb.treatment.general.en_status} /></p>
        <p><CitationChips ids={r.general.citations} usedFor={t.t("report.advice.general")} /></p>
      </section>
    </Card>
  );
}

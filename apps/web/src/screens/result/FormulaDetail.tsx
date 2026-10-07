import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import type { FormulaRecommendation } from "@tcm/engine";
import type { Formula, KnowledgeBase } from "@tcm/kb";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey, } from "../../i18n/catalogs.ts";
import { CitationChip, CitationChips } from "../../app/citations.tsx";
import { NeedsKnowledge, useLoaded } from "../../app/knowledge.tsx";
import { useApp } from "../../app/store.tsx";
import { usePageTitle } from "../../app/usePageTitle.ts";
import type { SavedAssessment } from "../../storage/types.ts";
import { Card, Chip, LinkButton, Skeleton } from "../../ui/index.ts";
import { matchWord } from "./Advice.tsx";
import { BilingualName, Prose } from "./shared.tsx";
import { CHANNELS, COMPOSITION_STATUS, LIUXIE_SLUG, ORGAN_SLUG, PRODUCT_SLUG, ROLE_SLUG, SCHOOL_SLUG, tierReason, UNIT_ID } from "./words.ts";
import { DataTable } from "./Panel.tsx";

// the personalised prescription (PM-41): only a build that can show one loads the card, its words and the code that made it
const PrescriptionCard = __APP_PROFILE__ === "dev" ? lazy(() => import("../../prescription/PrescriptionCard.tsx")) : null;


/** Label of a panel dimension (`肺.qi`, `liuxie.濕`, `product.痰`) in the page language. */
export function dimLabel(t: ReturnType<typeof useI18n>["t"], dim: string): string {
  const [head, tail] = dim.split(".") as [string, string];
  if (head === "liuxie" && tail in LIUXIE_SLUG) return t.t(`report.liuxie.${LIUXIE_SLUG[tail as keyof typeof LIUXIE_SLUG]}` as MessageKey);
  if (head === "product" && tail in PRODUCT_SLUG) return t.t(`report.product.${PRODUCT_SLUG[tail as keyof typeof PRODUCT_SLUG]}` as MessageKey);
  if (head in ORGAN_SLUG && (CHANNELS as readonly string[]).includes(tail)) return `${t.t(`report.organ.${ORGAN_SLUG[head as keyof typeof ORGAN_SLUG]}` as MessageKey)} ${t.t(`report.channel.${tail}` as MessageKey)}`;
  return dim;
}

function Detail({ saved, rec, formula, kb }: { saved: SavedAssessment; rec: FormulaRecommendation; formula: Formula; kb: KnowledgeBase }): ReactNode {
  const { t } = useI18n();
  const policy = saved.result.policy;
  const herb = (id: string): string => { const n = kb.herbName(id)?.name; return n ? t.localized(n).text : id; };
  const symptom = (id: string): string => { const s = kb.symptoms.get(id); return s ? (t.lang === "en" ? s.en : t.zh(s["zh-Hant"])) : id; };
  const word = t.t(`report.match.${matchWord(rec.fit.explained)}` as MessageKey);
  const showAmounts = policy.features.dosage && rec.composition.some((r) => r.typicalG !== undefined || r.classicalAmount !== undefined);
  const pct = (v: number): string => t.number(v, { style: "percent", maximumFractionDigits: 0 });
  const burdens = Object.entries(formula.panel_burden).filter(([, v]) => Math.abs(v) >= 0.05).sort(([, a], [, b]) => Math.abs(b) - Math.abs(a));
  const verification = COMPOSITION_STATUS[formula.verification.composition_status as keyof typeof COMPOSITION_STATUS] ?? "partial";
  const residual = rec.residualModification;
  const names = [...new Set([...rec.composition.map((r) => r.herb), ...Object.keys(residual?.composition ?? {})])];

  return (
    <>
      <h1><BilingualName v={formula.name} /></h1>
      <p style={{ margin: "0 0 var(--space-2)" }}>
        <Chip tone={rec.studyOnly ? "notice" : "primary"}>{t.t("formula.tier.title", { tier: rec.tier })}</Chip>{" "}
        <span>{t.t(`formula.tier.${rec.tier}` as MessageKey)}</span>
      </p>
      <p className="muted">{t.t("formula.source", { book: t.zh(formula.source.book), school: t.t(`formula.school.${SCHOOL_SLUG[formula.school as keyof typeof SCHOOL_SLUG] ?? "shifang"}` as MessageKey) })} <CitationChip id={formula.source.ref} usedFor={t.localized(formula.name).text} /></p>
      <Card title={t.t("formula.verification.title")} headingLevel={2} id="formula-verification">
        <p>✓ {t.t(`formula.verification.${verification}` as MessageKey)}</p>
        <p className="muted">{t.t("formula.verification.proportion")}</p>
        {formula.tier_reasons.length > 0 ? <ul>{formula.tier_reasons.map((r) => <li key={r}>{tierReason(t, r)}</li>)}</ul> : null}
      </Card>

      <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <Card title={t.t("formula.composition.title")} headingLevel={2} id="formula-composition">
          <DataTable caption={t.t("formula.composition.caption")} head={[t.t("formula.composition.col.role"), t.t("formula.composition.col.herb"), t.t("formula.composition.col.share"), ...(showAmounts ? [t.t("formula.composition.col.amount")] : [])]}
            rows={rec.composition.map((r) => [
              <span key="r"><span lang={t.zhLang}>{t.zh(r.role)}</span> <span className="muted">{t.t(`report.role.${ROLE_SLUG[r.role]}` as MessageKey)}</span></span>,
              <BilingualName key="h" v={r.name} />,
              <span key="s" style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}><span aria-hidden="true" style={{ display: "inline-block", width: `${Math.round(r.proportion * 120)}px`, height: 8, background: "var(--scale-6)", borderRadius: 4 }} />{pct(r.proportion)}</span>,
              ...(showAmounts ? [r.typicalG !== undefined ? t.t("formula.composition.amount.g", { g: r.typicalG }) : r.classicalAmount ? t.t("formula.composition.amount.classical", { value: r.classicalAmount.value, unit: t.t(`formula.composition.unit.${UNIT_ID[r.classicalAmount.unit]}` as MessageKey) }) : "—"] : []),
            ])} />
          <p className="muted">{t.t("formula.composition.roleNote")}</p>
        </Card>

        {PrescriptionCard !== null && saved.prescription?.base.formula === formula.id ? <Suspense fallback={null}><PrescriptionCard saved={saved} kb={kb} /></Suspense> : null}

        <Card title={t.t("formula.fit.title")} headingLevel={2} id="formula-fit">
          <p><strong>{t.t("formula.fit.match", { word })}</strong> · {t.t("report.formula.explained", { pct: pct(rec.fit.explained) })}</p>
          <p><strong>{t.t("formula.fit.matches")}</strong> {rec.fit.matched.length > 0 ? rec.fit.matched.map((id) => `✓ ${symptom(id)}`).join("　") : t.t("formula.fit.none")}</p>
          <p className="muted"><strong>{t.t("formula.fit.notMatches")}</strong> {rec.fit.unmatched.length > 0 ? rec.fit.unmatched.map((id) => `○ ${symptom(id)}`).join("　") : t.t("formula.fit.none")}</p>
          <h3>{t.t("formula.burden.title")}</h3>
          {burdens.length === 0 ? <p>{t.t("formula.burden.none")}</p> : <ul>{burdens.map(([dim, v]) => <li key={dim}>{t.t(v < 0 ? "formula.burden.lowers" : "formula.burden.raises", { item: dimLabel(t, dim) })}</li>)}</ul>}
        </Card>

        <Card title={t.t("formula.rationale.title")} headingLevel={2} id="formula-rationale">
          <p><Prose zh={formula.rationale_zh} en={formula.rationale_en} status={formula.en_status} /></p>
          <p><CitationChips ids={formula.rationale_citations} usedFor={t.localized(formula.name).text} /></p>
        </Card>

        <Card title={t.t("formula.cautions.title")} headingLevel={2} id="formula-cautions">
          <ul>
            <li>{t.t(formula.pregnancy === "avoid" ? "formula.cautions.pregnancy.avoid" : formula.pregnancy === "caution" ? "formula.cautions.pregnancy.caution" : "formula.cautions.pregnancy.ok")}</li>
            {formula.cautions.map((c, i) => <li key={c}><Prose zh={c} en={formula.cautions_en[i]} status={formula.en_status} /></li>)}
            {rec.annotations.map((n) => <li key={n.ruleId}>{t.localized(n.message).text}</li>)}
          </ul>
          {formula.interactions.length > 0 ? (<><p><strong>{t.t("formula.cautions.interactions")}</strong></p><ul>{formula.interactions.map((i) => <li key={i}>{t.t(`formula.interaction.${i}` as MessageKey)}</li>)}</ul></>) : null}
          <p className="muted">{t.t("formula.practitioner")}</p>
        </Card>

        {policy.features.modification && (rec.classicalModifications.length > 0 || residual !== null) ? (
          <Card title={t.t("formula.modification.title")} headingLevel={2} id="formula-modification">
            {rec.classicalModifications.length > 0 ? (
              <section aria-labelledby="mod-classical">
                <h3 id="mod-classical">{t.t("formula.modification.classical")}</h3>
                <ul>
                  {rec.classicalModifications.map((m) => (
                    <li key={m.id}>{t.t("formula.modification.classicalItem", {
                      symptoms: m.matched.map(symptom).join(t.lang === "en" ? ", " : "、"),
                      change: [m.add.length > 0 ? t.t("formula.modification.add", { herbs: m.add.map((a) => herb(a.herb)).join("、") }) : "", m.remove.length > 0 ? t.t("formula.modification.remove", { herbs: m.remove.map((a) => herb(a.herb)).join("、") }) : ""].filter(Boolean).join("; "),
                      name: t.zh(m.resultName), book: t.zh(m.source.book) })}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {residual !== null ? (
              <section aria-labelledby="mod-residual">
                <h3 id="mod-residual">{t.t("formula.modification.residual")}</h3>
                <ul>
                  {residual.steps.map((s) => (
                    <li key={`${s.op}-${s.herb}`}>{s.op === "add"
                      ? t.t("formula.modification.step.add", { herb: herb(s.herb), improves: s.improves.map((d) => dimLabel(t, d)).join("、") })
                      : t.t("formula.modification.step.remove", { herb: herb(s.herb), burden: s.avoidsBurden.map((d) => dimLabel(t, d)).join("、") })}</li>
                  ))}
                </ul>
                <DataTable caption={t.t("formula.modification.diff")} head={[t.t("formula.composition.col.herb"), t.t("formula.modification.before"), t.t("formula.modification.after")]}
                  rows={names.map((id) => [herb(id), pct(rec.composition.find((r) => r.herb === id)?.effectiveWeight ?? 0), pct(residual.composition[id] ?? 0)])} />
              </section>
            ) : null}
            <p className="muted">{t.t("formula.modification.discuss")}</p>
          </Card>
        ) : null}
      </div>
    </>
  );
}

/** S14 Formula detail (UX spec §4.11). Only a formula that is part of the saved result is shown: nothing outside the policy's output can be opened by address. */
export function FormulaDetail({ id, fid }: { id: string; fid: string }): ReactNode {
  const { t } = useI18n();
  usePageTitle("formula.title");
  const loadAssessment = useApp((s) => s.loadAssessment);
  const [state, setState] = useState<{ key: string; saved: SavedAssessment | null | undefined }>({ key: id, saved: undefined });
  useEffect(() => {
    let cancelled = false;
    void loadAssessment(id).then((saved) => { if (!cancelled) setState({ key: id, saved }); });
    return () => { cancelled = true; };
  }, [id, loadAssessment]);
  const saved = state.key === id ? state.saved : undefined;
  const back = <p><LinkButton href={`/result/${id}`}>{t.t("formula.back")}</LinkButton></p>;
  if (saved === undefined) return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("report.loading")}</span><Skeleton height="2rem" width="50%" /><br /><Skeleton /></div>;
  if (saved === null) return <><h1>{t.t("report.missing.title")}</h1><p>{t.t("report.missing.body")}</p><LinkButton href="/" variant="primary">{t.t("report.missing.home")}</LinkButton></>;
  const rec = [...saved.result.recommendations.formulas, ...saved.result.recommendations.studyOnly].find((f) => f.id === fid);
  return (
    <NeedsKnowledge>
      <Inner saved={saved} rec={rec} fid={fid} back={back} />
    </NeedsKnowledge>
  );
}

function Inner({ saved, rec, fid, back }: { saved: SavedAssessment; rec: FormulaRecommendation | undefined; fid: string; back: ReactNode }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const formula = kb.formulas.get(fid);
  if (rec === undefined || formula === undefined) return <><h1>{t.t("formula.title")}</h1><p>{t.t("formula.notInResult")}</p>{back}</>;
  return <><Detail saved={saved} rec={rec} formula={formula} kb={kb} />{back}</>;
}

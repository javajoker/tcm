import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { assessInputOf, toSaved } from "../../app/assessment.ts";
import { attachPrescription } from "../../app/prescription.ts";
import { effectiveSeasonModel, effectiveSeasons } from "../../app/seasons.ts";
import { NeedsKnowledge, useLoaded } from "../../app/knowledge.tsx";
import { Term } from "../../app/Term.tsx";
import { useApp } from "../../app/store.tsx";
import { useDraft } from "../../app/useDraft.ts";
import { usePageTitle } from "../../app/usePageTitle.ts";
import { randomId } from "../../storage/ids.ts";
import type { Draft } from "../../storage/types.ts";
import { Button, Card, LinkButton, Notice, Skeleton } from "../../ui/index.ts";
import { missingItems, medicationClasses, seriousIn } from "../profile/model.ts";
import { answeredCount } from "../constitution/model.ts";
import { pendingNotices, unanswered } from "../screening/model.ts";
import { pendingConflicts, pickNext } from "../inquiry/model.ts";
import { absentCount, reviewGroups, selfObservedCount, unsureQuestions } from "./model.ts";

function Row({ label, value }: { label: string; value: ReactNode }): ReactNode {
  return <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}><dt style={{ fontWeight: 600, minWidth: "9rem" }}>{label}</dt><dd style={{ margin: 0 }}>{value}</dd></div>;
}

function About({ draft }: { draft: Draft }): ReactNode {
  const { t } = useI18n();
  const s = draft.subject;
  const v = (k: string): string => t.t(`intake.review.value.${k}` as MessageKey);
  const meds = draft.profile.medications === "unsure" ? v("unsure") : medicationClasses(draft).length === 0 ? v("none")
    : [...new Set(medicationClasses(draft))].map((c) => t.t(`intake.profile.meds.${c}` as MessageKey)).concat(draft.profile.medicationText.length > 0 ? [t.t("intake.review.value.otherNamed", { names: draft.profile.medicationText.join("、") })] : []).join("、");
  const allergies = draft.profile.allergies === "some" && (s.allergies ?? []).length > 0 ? (s.allergies ?? []).map((a) => t.zh(a)).join("、") : v("none");
  const conditions = seriousIn(draft).length === 0 ? v("none") : seriousIn(draft).map((id) => t.t(`intake.profile.conditions.${id}` as MessageKey)).join("、");
  return (
    <Card title={t.t("intake.review.about.title")} id="review-about">
      <dl style={{ margin: 0, display: "grid", gap: "var(--space-2)" }}>
        <Row label={t.t("intake.review.about.age")} value={t.t("intake.review.value.years", { n: s.ageYears ?? "" })} />
        <Row label={t.t("intake.review.about.sex")} value={s.sex ? v(s.sex) : ""} />
        {s.pregnancy && s.pregnancy !== "not-applicable" ? <Row label={t.t("intake.review.about.pregnancy")} value={v(s.pregnancy === "no" ? "no" : s.pregnancy === "yes" ? "yes" : "possible")} /> : null}
        {s.pregnancy && s.pregnancy !== "not-applicable" && s.lactating !== undefined ? <Row label={t.t("intake.review.about.lactating")} value={v(s.lactating ? "yes" : "no")} /> : null}
        <Row label={t.t("intake.review.about.medications")} value={meds} />
        <Row label={t.t("intake.review.about.allergies")} value={allergies} />
        <Row label={t.t("intake.review.about.conditions")} value={conditions} />
      </dl>
      <p><LinkButton href="/start">{t.t("intake.review.edit")}</LinkButton></p>
    </Card>
  );
}

function Safety({ draft }: { draft: Draft }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const marked = Object.entries(draft.screening.answers).filter(([, a]) => a !== "no").map(([id, a]) => ({ id, a, text: kb.redFlags.find((f) => f.id === id) }));
  return (
    <Card title={t.t("intake.review.safety.title")} id="review-safety">
      {marked.length === 0 ? <p>{t.t("intake.review.safety.none")}</p> : (
        <>
          <p>{t.t("intake.review.safety.some")}</p>
          <ul>{marked.map((m) => <li key={m.id}>{m.text ? t.localized(m.text.text).text : m.id}{m.a === "unsure" ? t.t("intake.screen.unsureTag") : ""}</li>)}</ul>
        </>
      )}
      <p><LinkButton href="/screen">{t.t("intake.review.edit")}</LinkButton></p>
    </Card>
  );
}

function Body({ draft, onFinishing, onUnfinish }: { draft: Draft; onFinishing: () => void; onUnfinish: () => void }): ReactNode {
  const { t, lang } = useI18n();
  const { kb, engine: eng } = useLoaded();
  const [, navigate] = useLocation();
  const saveAssessment = useApp((s) => s.saveAssessment);
  const prefs = useApp((s) => s.prefs);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const groups = reviewGroups(kb, draft);
  const pulse = draft.observe.pulse;
  const unsure = unsureQuestions(kb, draft);
  const noCount = absentCount(draft);
  const selfObserved = selfObservedCount(groups);
  const next = pickNext(kb, draft);
  const lowCoverage = next !== null && next.engine.coverage < kb.params.questionnaire.core_coverage_stop / 2;
  const edit = (qid: string): string => `/inquiry?edit=${qid}&back=/review`;

  const run = (): void => {
    const input = assessInputOf(draft, Date.now(), effectiveSeasons(prefs), effectiveSeasonModel(prefs));
    if (input === null) return;
    setBusy(true);
    setFailed(false);
    onFinishing();
    try {
      const result = eng.assess(kb, input);
      const id = randomId();
      // the personalised prescription is made with the record, where the build can make one (app/prescription.ts)
      void attachPrescription(kb, toSaved(draft, result, { id, lang })).then(saveAssessment).then(() => navigate(`/result/${id}`));
    } catch {
      setBusy(false);
      setFailed(true);
      onUnfinish();
    }
  };

  return (
    <>
      <h1>{t.t("intake.review.title")}</h1>
      <p>{t.t("intake.review.intro")}</p>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <About draft={draft} />
        <Safety draft={draft} />
        <Card title={t.t("intake.review.groups.title")} id="review-groups">
          {groups.length === 0 ? <p>{t.t("intake.review.groups.none")}</p> : groups.map((g) => (
            <section key={g.dimension} aria-labelledby={`dim-${g.dimension}`} style={{ marginBottom: "var(--space-4)" }}>
              <h3 id={`dim-${g.dimension}`}>{t.t(`intake.inquiry.dimension.${g.dimension}` as MessageKey)}</h3>
              <ul style={{ margin: 0, paddingInlineStart: "1.2rem" }}>
                {g.items.map((i) => (
                  <li key={i.symptomId}>
                    <Term zh={i.text} />{i.severity ? <span className="muted">（{t.t(`intake.severity.${i.severity}`)}）</span> : null}
                    {i.questionId !== null ? <> <LinkButton href={edit(i.questionId)} variant="ghost" aria-label={t.t("intake.review.editItem", { item: i.text })}>{t.t("intake.review.edit")}</LinkButton></> : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {noCount > 0 ? <p className="muted">{t.plural("intake.review.groups.noCount", noCount)}</p> : null}
          {pulse?.rate != null ? (
            <p>
              {pulse.method ? t.t("intake.review.pulse.rateMethod", { rate: pulse.rate, method: t.t(`observe.pulse.method.${pulse.method}` as MessageKey) }) : t.t("intake.review.pulse.rate", { rate: pulse.rate })}
              {" "}<LinkButton href="/observe/pulse" variant="ghost">{t.t("intake.review.edit")}</LinkButton>
            </p>
          ) : null}
        </Card>
        <Card title={t.t("intake.review.constitution.title")} headingLevel={2} id="review-constitution">
          <p>{answeredCount(draft) > 0 ? t.plural("intake.review.constitution.answered", answeredCount(draft)) : t.t("intake.review.constitution.skipped")}</p>
          <LinkButton href="/constitution">{t.t("intake.review.edit")}</LinkButton>
        </Card>
        {unsure.length > 0 ? (
          <Card title={t.t("intake.review.unsure.title")} id="review-unsure">
            <ul style={{ margin: 0, paddingInlineStart: "1.2rem" }}>
              {unsure.map((q) => <li key={q.id}>{t.localized(q.prompt).text} <LinkButton href={edit(q.id)} variant="ghost">{t.t("intake.review.unsure.answer")}</LinkButton></li>)}
            </ul>
          </Card>
        ) : null}
      </div>
      {draft.birth !== undefined ? <p>{t.t("intake.review.birth.used")} {t.t(draft.rememberBirth ? "intake.review.birth.remembered" : "intake.review.birth.forgotten")}</p> : null}
      {selfObserved > 0 ? <p className="muted">{t.plural("intake.review.quality.selfObserved", selfObserved)}</p> : null}
      {lowCoverage ? <p className="muted">{t.t("intake.review.coverage.low")}</p> : null}
      {failed ? <Notice kind="caution" kindLabel={t.t("common.notice.caution")}>{t.t("intake.review.error")}</Notice> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
        <LinkButton href="/inquiry">{t.t("intake.review.back")}</LinkButton>
        <Button variant="primary" disabled={busy} onClick={run}>{busy ? t.t("intake.review.running") : t.t("intake.review.run")}</Button>
      </div>
    </>
  );
}

/** Everything the engine needs must be in place: a complete profile, a finished screening, no unresolved contradiction — otherwise back to where it is missing. */
function Guarded({ draft, onFinishing, onUnfinish }: { draft: Draft; onFinishing: () => void; onUnfinish: () => void }): ReactNode {
  const { kb } = useLoaded();
  const [, navigate] = useLocation();
  const target = missingItems(draft).length > 0 ? "/start" : unanswered(kb, draft).length > 0 || pendingNotices(kb, draft).length > 0 ? "/screen" : pendingConflicts(kb, draft).length > 0 ? "/inquiry" : null;
  useEffect(() => { if (target !== null) navigate(target, { replace: true }); }, [target, navigate]);
  return target === null ? <Body draft={draft} onFinishing={onFinishing} onUnfinish={onUnfinish} /> : null;
}

/** S12 Review and confirm (UX spec §4.9): one primary action, "Get my result". */
export function Review(): ReactNode {
  const { t } = useI18n();
  usePageTitle("intake.review.title");
  const [finishing, setFinishing] = useState(false);          // once the result is being saved the draft is deleted on purpose: do not start a new one
  const draft = useDraft("/review", { autoStart: !finishing });
  if (draft === null) return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span><Skeleton height="2rem" width="50%" /></div>;
  return <NeedsKnowledge><Guarded draft={draft} onFinishing={() => setFinishing(true)} onUnfinish={() => setFinishing(false)} /></NeedsKnowledge>;
}

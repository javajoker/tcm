import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { useLoaded } from "../../app/knowledge.tsx";
import type { SavedAssessment } from "../../storage/types.ts";
import { Button, Card, Chip, Progress } from "../../ui/index.ts";
import { ConstitutionTendency } from "./ConstitutionTendency.tsx";
import { BilingualName, ZhText } from "./shared.tsx";

const METER = { high: 1, medium: 0.66, low: 0.33, insufficient: 0 } as const;

/** ② Summary: the leading pattern in plain words with its TCM name, up to two alternatives, and the confidence (text and meter). */
export function Summary({ saved, onAnswerMore }: { saved: SavedAssessment; onAnswerMore: () => void }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const a = saved.result;
  const v = a.verdict;

  if (v.status === "insufficient") {
    const questions = a.quality.unansweredCore.map((id) => kb.questionById.get(id)).filter((q) => q !== undefined);
    return (
      <Card title={t.t("report.summary.insufficient.title")} id="sec-summary">
        <ConstitutionTendency saved={saved} />
        <p>{t.t("report.summary.insufficient.body")}</p>
        {questions.length > 0 ? <ul>{questions.slice(0, 5).map((q) => <li key={q.id}>{t.localized(q.prompt).text}</li>)}</ul> : null}
        <Button variant="primary" onClick={onAnswerMore}>{t.t("report.summary.insufficient.cta")}</Button>
      </Card>
    );
  }

  const [lead, ...others] = v.patterns;
  const alternatives = others.slice(0, 2);
  const rec = (id: string) => kb.patternById.get(id);
  const leadRec = lead ? rec(lead.id) : undefined;
  return (
    <Card title={t.t("report.summary.title")} id="sec-summary">
      <ConstitutionTendency saved={saved} />
      {lead && leadRec ? (
        <>
          <p className="muted" style={{ margin: 0 }}>{t.t("report.summary.leaning")}</p>
          <p style={{ fontSize: "1.25rem", margin: "0 0 var(--space-2)" }}>
            <BilingualName v={leadRec.name} tag="strong" />
          </p>
          <p style={{ margin: "0 0 var(--space-3)" }}>
            <Chip tone="primary">{t.t(`report.group.${leadRec.group}` as MessageKey)}</Chip>{" "}
            <Chip>{t.t(`report.band.${lead.band}` as MessageKey)}</Chip>
          </p>
          <p><strong>{t.t("report.summary.direction")}</strong>: <ZhText>{leadRec.principle}</ZhText></p>
        </>
      ) : null}
      <div>
        <p style={{ margin: "0 0 var(--space-2)" }}><strong>{t.t("report.summary.confidence")}</strong>: {t.t(`report.confidence.${v.confidence}` as MessageKey)}</p>
        <Progress value={METER[v.confidence]} name={t.t("report.summary.confidence")} label={t.t(`report.confidence.${v.confidence}` as MessageKey)} />
      </div>
      {v.tieBreak !== null && v.tieBreak.chosen === null ? <p className="muted">{t.t("report.summary.tie")}</p> : null}
      {v.externalFirst ? <p className="muted">{t.t("report.summary.externalFirst")}</p> : null}
      {v.mixed.map((m) => <p key={m} className="muted">{t.t(`report.summary.mixed.${m}` as MessageKey)}</p>)}
      {v.lowered.includes("conflict") ? <p className="muted">{t.t("report.summary.conflict")}</p> : null}
      {alternatives.length > 0 ? (
        <>
          <h3>{t.t("report.summary.alternatives")}</h3>
          <ul>
            {alternatives.map((p) => { const r = rec(p.id); return r ? <li key={p.id}><BilingualName v={r.name} /> <Chip>{t.t(`report.band.${p.band}` as MessageKey)}</Chip></li> : null; })}
          </ul>
        </>
      ) : null}
    </Card>
  );
}

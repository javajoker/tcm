import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { draftFromSaved } from "../../app/assessment.ts";
import { formatLocal } from "../../app/format.ts";
import { useLoaded } from "../../app/knowledge.tsx";
import { useApp } from "../../app/store.tsx";
import { randomId } from "../../storage/ids.ts";
import type { SavedAssessment } from "../../storage/types.ts";
import { Button, Card } from "../../ui/index.ts";
import { BackupLine } from "../../backup/Reminder.tsx";

/** ⑦ When to see a practitioner. */
export function Practitioner(): ReactNode {
  const { t } = useI18n();
  return (
    <Card title={t.t("report.practitioner.title")} id="sec-practitioner">
      <ul>
        <li>{t.t("report.practitioner.worse")}</li>
        <li>{t.t("report.practitioner.groups")}</li>
        <li>{t.t("report.practitioner.herbs")}</li>
      </ul>
      <p>{t.t("report.practitioner.describe")}</p>
    </Card>
  );
}

/** ⑧ Your data, with "Edit and re-run": a new draft holding the saved inputs, at the review. */
export function YourData({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const [, navigate] = useLocation();
  const adoptDraft = useApp((s) => s.adoptDraft);
  const n = Object.values(saved.input.findings).filter((f) => f.state === "present").length;
  const rerun = (): void => { adoptDraft(draftFromSaved(kb, saved, randomId(), Date.now())); navigate("/review"); };
  return (
    <Card title={t.t("report.data.title")} id="sec-data">
      <p>{t.plural("report.data.summary", n)}</p>
      <Button variant="primary" onClick={rerun}>{t.t("report.data.rerun")}</Button>
      <BackupLine />
    </Card>
  );
}

/** The permanent footer of the report: the full disclaimer and where the numbers came from. */
export function ReportFooter({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const m = saved.result.meta;
  return (
    <footer style={{ marginTop: "var(--space-5)" }}>
      <p>{t.rich("safety.disclaimer.full").map((part, i) => (part.type === "tag" && part.tag === "b" ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>))}</p>
      <p className="muted">{t.t("report.footer.computed", { date: formatLocal(t.lang, m.computedAt), kb: m.kbVersion.slice(0, 8), engine: m.engineVersion, params: m.paramsFingerprint })}</p>
    </footer>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useApp } from "../app/store.tsx";
import { Button, Card } from "../ui/index.ts";
import { useBackupDialogs } from "./BackupContext.tsx";
import { resultsToBackUp, snoozeUntil } from "./reminder.ts";

/** The saved results' times, read once when a page opens. */
function useResultTimes(): readonly number[] | null {
  const listAssessments = useApp((s) => s.listAssessments);
  const [times, setTimes] = useState<readonly number[] | null>(null);
  useEffect(() => {
    let alive = true;
    void listAssessments().then((all) => { if (alive) setTimes(all.map((a) => a.createdAt)); });
    return () => { alive = false; };
  }, [listAssessments]);
  return times;
}

/**
 * A dismissible card when results are not yet in a backup (design §3.6): five of them, or thirty days since the last backup. *Not now* hides it for fourteen days; a switch in Settings turns it off.
 * Computed from stored data when the page opens — there is no timer and no message from anywhere.
 */
export function BackupReminder(): ReactNode {
  const { t } = useI18n();
  const times = useResultTimes();
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const { openBackup } = useBackupDialogs();
  const [now] = useState(() => Date.now());
  const n = times === null ? 0 : resultsToBackUp({ createdAt: times, lastBackupAt: prefs.lastBackupAt, snoozeUntil: prefs.backupSnoozeUntil, enabled: prefs.backupReminder !== false, now });
  if (n === 0) return null;
  return (
    <Card headingLevel={2} title={t.t("common.backup.card.title")} id="backup-reminder">
      <p role="status">{t.plural("common.backup.reminder.text", n)}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <Button variant="primary" onClick={openBackup}>{t.t("common.backup.reminder.make")}</Button>
        <Button onClick={() => setPrefs({ backupSnoozeUntil: snoozeUntil(Date.now()) })}>{t.t("common.backup.reminder.later")}</Button>
      </div>
    </Card>
  );
}

/** One quiet line that opens the same dialog: on History and at the end of a result. */
export function BackupLine(): ReactNode {
  const { t } = useI18n();
  const { openBackup } = useBackupDialogs();
  return <p className="muted"><Button variant="ghost" onClick={openBackup}>{t.t("common.backup.line")}</Button></p>;
}

import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { formatLocal } from "../../app/format.ts";
import { useApp } from "../../app/store.tsx";
import { useBackupDialogs } from "../../backup/BackupContext.tsx";
import { Button, Card, Tile } from "../../ui/index.ts";
import { StorageHealth } from "./StorageHealth.tsx";

/** Settings → Your data (docs/post-mvp/design/backup-and-data-lock.md §3.5): make a backup, restore from a file, when the last backup was, and the reminder switch. */
export function DataCard(): ReactNode {
  const { t, lang } = useI18n();
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const storage = useApp((s) => s.storage);
  const { openBackup, openRestore } = useBackupDialogs();
  return (
    <Card title={t.t("common.backup.card.title")} headingLevel={2} id="settings-data">
      <p>{t.t("common.backup.card.intro")}</p>
      <p className="muted">{prefs.lastBackupAt === undefined ? t.t("common.backup.card.never") : t.t("common.backup.card.last", { when: formatLocal(lang, prefs.lastBackupAt) })}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <Button variant="primary" onClick={openBackup}>{t.t("common.backup.card.make")}</Button>
        <Button onClick={openRestore} disabled={storage === "memory"}>{t.t("common.backup.card.restore")}</Button>
      </div>
      {storage === "memory" ? <p className="muted">{t.t("common.backup.card.restore.blocked")}</p> : null}
      <StorageHealth />
      <Tile type="checkbox" name="backupReminder" value="on" checked={prefs.backupReminder !== false} onChange={(on) => setPrefs(on ? { backupReminder: true } : { backupReminder: false })}
        label={t.t("common.backup.card.reminder")} description={t.t("common.backup.card.reminder.hint")} />
    </Card>
  );
}

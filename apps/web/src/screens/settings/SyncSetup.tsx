import { useId, useState, type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { checkPassphrase, MIN_PASSPHRASE } from "../../storage/passphrase.ts";
import { useSync } from "../../sync/SyncContext.tsx";
import type { SyncFailure } from "../../sync/session.ts";
import { Button, Dialog, DialogActions, Field, Notice, TextInput } from "../../ui/index.ts";

/**
 * Setting up the file (docs/post-mvp/design/research-tracks.md §4): the passphrase the file will always be encrypted with — typed twice, with the same checks as a protected backup — and then the browser's own
 * file picker, which the click on *Choose the file…* opens. A file that already holds a backup of another device is merged before anything is written; one that is not a backup of this app is refused.
 */
export function SyncSetup({ onClose }: { onClose: () => void }): ReactNode {
  const { t } = useI18n();
  const sync = useSync();
  const titleId = useId();
  const [passphrase, setPassphrase] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<SyncFailure | null>(null);
  const check = checkPassphrase(passphrase);
  const ready = check.ok && passphrase === again;

  const choose = async (): Promise<void> => {
    if (!ready || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const after = await sync.setup(passphrase);
      if (after.phase === "off") { if (after.failure !== null) setFailure(after.failure); return; }          // the picker was closed, or the file was refused
      setPassphrase("");
      setAgain("");
      onClose();
    } catch {
      setFailure("failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId}>{t.t("common.sync.setup.title")}</h2>
      <p>{t.t("common.sync.setup.intro")}</p>
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        <Field label={t.t("common.backup.passphrase.label")} error={passphrase.length > 0 && !check.ok ? t.t("common.backup.passphrase.short", { n: MIN_PASSPHRASE }) : null}>
          <TextInput type="password" autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={passphrase} onChange={(e) => setPassphrase(e.currentTarget.value)} />
        </Field>
        {check.ok ? <p role="status" className="muted">{t.t(`common.backup.passphrase.strength.${check.strength}` as MessageKey)}</p> : null}
        <Field label={t.t("common.backup.passphrase.again")} error={again.length > 0 && again !== passphrase ? t.t("common.backup.passphrase.mismatch") : null}>
          <TextInput type="password" autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={again} onChange={(e) => setAgain(e.currentTarget.value)} />
        </Field>
        <Notice kind="caution" kindLabel={t.t("common.notice.caution")}>{t.t("common.backup.passphrase.warning")}</Notice>
      </div>
      <p className="muted">{t.t("common.sync.setup.other")}</p>
      {busy ? <p role="status" aria-busy="true">{t.t("common.backup.make.working")}</p> : null}
      {failure !== null ? <p role="alert">{t.t(`common.sync.failure.${failure}` as MessageKey)}</p> : null}
      <DialogActions>
        <Button onClick={onClose}>{t.t("common.action.cancel")}</Button>
        <Button variant="primary" disabled={!ready || busy} onClick={() => { void choose(); }}>{t.t("common.sync.setup.choose")}</Button>
      </DialogActions>
    </Dialog>
  );
}

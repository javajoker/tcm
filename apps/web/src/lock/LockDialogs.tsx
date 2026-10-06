import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import { formatLocal } from "../app/format.ts";
import { useApp } from "../app/store.tsx";
import { useBackupDialogs } from "../backup/BackupContext.tsx";
import { checkPassphrase, MIN_PASSPHRASE } from "../storage/passphrase.ts";
import { Button, Dialog, DialogActions, Field, Notice, TextInput, Tile } from "../ui/index.ts";

/** A backup made in the last quarter of an hour counts as "just now" for turning the lock on. */
export const FRESH_BACKUP_MS = 15 * 60_000;

/** The passphrase twice, with what is wrong with it said once it has been typed and a hint about how it will hold up; shared by turning the lock on and changing the passphrase. */
function NewPassphrase({ label, passphrase, again, onPassphrase, onAgain }: { label: string; passphrase: string; again: string; onPassphrase: (v: string) => void; onAgain: (v: string) => void }): ReactNode {
  const { t } = useI18n();
  const check = checkPassphrase(passphrase);
  return (
    <>
      <Field label={label} error={passphrase.length > 0 && !check.ok ? t.t("common.backup.passphrase.short", { n: MIN_PASSPHRASE }) : null}>
        <TextInput type="password" autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={passphrase} onChange={(e) => onPassphrase(e.currentTarget.value)} />
      </Field>
      {check.ok ? <p role="status" className="muted" style={{ margin: 0 }}>{t.t(`common.backup.passphrase.strength.${check.strength}` as MessageKey)}</p> : null}
      <Field label={t.t("common.backup.passphrase.again")} error={again.length > 0 && again !== passphrase ? t.t("common.backup.passphrase.mismatch") : null}>
        <TextInput type="password" autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={again} onChange={(e) => onAgain(e.currentTarget.value)} />
      </Field>
    </>
  );
}

/**
 * Turn the lock on (design §5.4): what it does and does not do, that a lost passphrase loses the history, a fresh backup — or an explicit "I understand" — and the passphrase twice. Then every stored record is
 * encrypted and the lock written in one transaction. The passphrase lives only in component state and is cleared when the dialog goes.
 */
export function EnableLockDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }): ReactNode {
  const { t, lang } = useI18n();
  const titleId = useId();
  const enableLock = useApp((s) => s.enableLock);
  const lastBackupAt = useApp((s) => s.prefs.lastBackupAt);
  const { openBackup } = useBackupDialogs();
  const [openedAt] = useState(() => Date.now());
  const [passphrase, setPassphrase] = useState("");
  const [again, setAgain] = useState("");
  const [skip, setSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const fresh = lastBackupAt !== undefined && lastBackupAt >= openedAt - FRESH_BACKUP_MS;
  const ok = checkPassphrase(passphrase).ok && passphrase === again && (fresh || skip);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setFailed(false);
    const result = await enableLock(passphrase);
    setBusy(false);
    if (result === "ok") { setPassphrase(""); setAgain(""); onDone(); } else setFailed(true);
  };
  return (
    <Dialog open onClose={busy ? () => undefined : onClose} labelledBy={titleId} dismissable={!busy}>
      <form onSubmit={(e) => { void submit(e); }} style={{ display: "grid", gap: "var(--space-3)" }}>
        <h2 id={titleId} style={{ margin: 0 }}>{t.t("lock.enable.title")}</h2>
        <p style={{ margin: 0 }}>{t.t("lock.enable.what")}</p>
        <p style={{ margin: 0 }}>{t.t("lock.enable.cannot")}</p>
        <Notice kind="caution" kindLabel={t.t("common.notice.caution")}>{t.t("lock.enable.lost")}</Notice>
        <section aria-labelledby={`${titleId}-backup`} style={{ display: "grid", gap: "var(--space-2)" }}>
          <h3 id={`${titleId}-backup`} style={{ margin: 0 }}>{t.t("lock.enable.backup.title")}</h3>
          {fresh ? <p role="status" style={{ margin: 0 }}>{t.t("lock.enable.backup.fresh", { when: formatLocal(lang, lastBackupAt) })}</p> : (
            <>
              <p style={{ margin: 0 }}>{t.t("lock.enable.backup.none")}</p>
              <p style={{ margin: 0 }}><Button onClick={openBackup}>{t.t("lock.enable.backup.make")}</Button></p>
              <Tile type="checkbox" name="skip" value="skip" checked={skip} onChange={setSkip} label={t.t("lock.enable.backup.skip")} />
            </>
          )}
        </section>
        <NewPassphrase label={t.t("common.backup.passphrase.label")} passphrase={passphrase} again={again} onPassphrase={setPassphrase} onAgain={setAgain} />
        {busy ? <p role="status" aria-busy="true" className="muted" style={{ margin: 0 }}>{t.t("lock.enable.working")}</p> : null}
        {failed ? <p role="alert" style={{ margin: 0 }}>{t.t("lock.enable.failed")}</p> : null}
        <DialogActions>
          <Button type="button" onClick={onClose} disabled={busy}>{t.t("common.action.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={!ok || busy}>{t.t("lock.enable.action")}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

const outcomeText = (t: ReturnType<typeof useI18n>["t"], outcome: "wrong" | "wait" | "failed"): string => t.t(`lock.outcome.${outcome}` as MessageKey);

/** Change the passphrase (design §5.4): the current one and a new one twice; one small write re-wraps the same data key, so the history is not touched. */
export function ChangePassphraseDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }): ReactNode {
  const { t } = useI18n();
  const titleId = useId();
  const changePassphrase = useApp((s) => s.changePassphrase);
  const [current, setCurrent] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"wrong" | "wait" | "failed" | null>(null);
  const ok = current !== "" && checkPassphrase(passphrase).ok && passphrase === again;
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!ok || busy) return;
    setBusy(true);
    setProblem(null);
    const result = await changePassphrase(current, passphrase);
    setBusy(false);
    if (result === "ok") { setCurrent(""); setPassphrase(""); setAgain(""); onDone(); } else { setProblem(result); setCurrent(""); }
  };
  return (
    <Dialog open onClose={busy ? () => undefined : onClose} labelledBy={titleId} dismissable={!busy}>
      <form onSubmit={(e) => { void submit(e); }} style={{ display: "grid", gap: "var(--space-3)" }}>
        <h2 id={titleId} style={{ margin: 0 }}>{t.t("lock.change.title")}</h2>
        <Field label={t.t("lock.change.current")} error={problem !== null ? outcomeText(t, problem) : null}>
          <TextInput type="password" autoComplete="current-password" autoCapitalize="none" spellCheck={false} value={current} onChange={(e) => { setCurrent(e.currentTarget.value); setProblem(null); }} />
        </Field>
        <NewPassphrase label={t.t("lock.change.new")} passphrase={passphrase} again={again} onPassphrase={setPassphrase} onAgain={setAgain} />
        {busy ? <p role="status" aria-busy="true" className="muted" style={{ margin: 0 }}>{t.t("lock.working")}</p> : null}
        <DialogActions>
          <Button type="button" onClick={onClose} disabled={busy}>{t.t("common.action.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={!ok || busy}>{t.t("lock.change.action")}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** Turn the lock off (design §5.4): the passphrase is asked again, because a device left unlocked for a moment must not be enough to take the protection away. */
export function DisableLockDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }): ReactNode {
  const { t } = useI18n();
  const titleId = useId();
  const disableLock = useApp((s) => s.disableLock);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"wrong" | "wait" | "failed" | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (passphrase === "" || busy) return;
    setBusy(true);
    setProblem(null);
    const result = await disableLock(passphrase);
    setBusy(false);
    if (result === "ok") { setPassphrase(""); onDone(); } else { setProblem(result); setPassphrase(""); input.current?.focus(); }
  };
  return (
    <Dialog open onClose={busy ? () => undefined : onClose} labelledBy={titleId} dismissable={!busy}>
      <form onSubmit={(e) => { void submit(e); }} style={{ display: "grid", gap: "var(--space-3)" }}>
        <h2 id={titleId} style={{ margin: 0 }}>{t.t("lock.disable.title")}</h2>
        <p style={{ margin: 0 }}>{t.t("lock.disable.body")}</p>
        <Field label={t.t("common.backup.passphrase.label")} error={problem !== null ? outcomeText(t, problem) : null}>
          <TextInput ref={input} type="password" autoComplete="current-password" autoCapitalize="none" spellCheck={false} value={passphrase} onChange={(e) => { setPassphrase(e.currentTarget.value); setProblem(null); }} />
        </Field>
        {busy ? <p role="status" aria-busy="true" className="muted" style={{ margin: 0 }}>{t.t("lock.working")}</p> : null}
        <DialogActions>
          <Button type="button" onClick={onClose} disabled={busy}>{t.t("common.action.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={passphrase === "" || busy}>{t.t("lock.disable.action")}</Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

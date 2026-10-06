import { useState, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useApp } from "../app/store.tsx";
import { DEFAULT_LOCK_IDLE_MINUTES, LOCK_IDLE_MINUTES } from "../storage/types.ts";
import { Button, Card, Field, Select } from "../ui/index.ts";
import { ChangePassphraseDialog, DisableLockDialog, EnableLockDialog } from "./LockDialogs.tsx";

/**
 * Settings → Lock the history (design §5): what the lock does and does not do, and — when it is on — how long it waits, *Lock now*, *Change the passphrase* and *Turn the lock off*. Where storage is blocked
 * or only in memory the lock cannot be turned on, and the card says why.
 */
export function LockCard(): ReactNode {
  const { t } = useI18n();
  const lock = useApp((s) => s.lock);
  const storage = useApp((s) => s.storage);
  const minutes = useApp((s) => s.prefs.lockIdleMinutes ?? DEFAULT_LOCK_IDLE_MINUTES);
  const setPrefs = useApp((s) => s.setPrefs);
  const lockNow = useApp((s) => s.lockNow);
  const [dialog, setDialog] = useState<null | "enable" | "change" | "disable">(null);
  const [said, setSaid] = useState<string | null>(null);
  const on = lock === "unlocked";
  const close = (): void => setDialog(null);
  return (
    <Card title={t.t("lock.card.title")} headingLevel={2} id="settings-lock">
      <p>{t.t("lock.card.intro")}</p>
      <p className="muted">{t.t("lock.card.limits")}</p>
      {on ? (
        <>
          <p>{t.t("lock.card.on", { minutes: t.plural("lock.card.idle", minutes) })}</p>
          <Field label={t.t("lock.card.idle.label")}>
            <Select value={String(minutes)} onChange={(e) => setPrefs({ lockIdleMinutes: Number(e.currentTarget.value) as (typeof LOCK_IDLE_MINUTES)[number] })}>
              {LOCK_IDLE_MINUTES.map((m) => <option key={m} value={m}>{t.plural("lock.card.idle", m)}</option>)}
            </Select>
          </Field>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
            <Button variant="primary" onClick={() => { void lockNow(); }}>{t.t("lock.card.now")}</Button>
            <Button onClick={() => { setSaid(null); setDialog("change"); }}>{t.t("lock.card.change")}</Button>
            <Button onClick={() => { setSaid(null); setDialog("disable"); }}>{t.t("lock.card.disable")}</Button>
          </div>
        </>
      ) : storage === "memory" ? <p>{t.t("lock.card.blocked")}</p> : (
        <p><Button variant="primary" onClick={() => { setSaid(null); setDialog("enable"); }} disabled={lock !== "none"}>{t.t("lock.card.enable")}</Button></p>
      )}
      <p role="status">{said}</p>
      {dialog === "enable" ? <EnableLockDialog onClose={close} onDone={close} /> : null}
      {dialog === "change" ? <ChangePassphraseDialog onClose={close} onDone={() => { close(); setSaid(t.t("lock.card.done.changed")); }} /> : null}
      {dialog === "disable" ? <DisableLockDialog onClose={close} onDone={() => { close(); setSaid(t.t("lock.card.done.off")); }} /> : null}
    </Card>
  );
}

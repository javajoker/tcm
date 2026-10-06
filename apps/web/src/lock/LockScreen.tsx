import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { LanguageToggle } from "../app/LanguageToggle.tsx";
import { useApp } from "../app/store.tsx";
import { usePageTitle } from "../app/usePageTitle.ts";
import shell from "../app/AppShell.module.css";
import { THEMES } from "../storage/types.ts";
import { Button, Card, ConfirmDialog, Field, SegmentedControl, TextInput } from "../ui/index.ts";
import type { MessageKey } from "../i18n/catalogs.ts";

/**
 * The lock screen (docs/post-mvp/design/backup-and-data-lock.md §5.4): it replaces the whole app while the history is locked. A passphrase field, *Unlock*, the language and the theme (they stay readable
 * because this screen needs them), and — always reachable — *Forgot it? Erase everything on this device*. Nothing of the history is rendered or fetched here. After five wrong passphrases in a row each next
 * try waits longer, and the screen says so with a countdown, and says honestly what that does and does not do.
 */
export function LockScreen(): ReactNode {
  const { t } = useI18n();
  usePageTitle("lock.screen.title");
  const unlock = useApp((s) => s.unlock);
  const status = useApp((s) => s.lockStatus);
  const eraseAll = useApp((s) => s.eraseAll);
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [spoken, setSpoken] = useState("");          // what the live region says: once when a wait begins and once when it is over — the countdown on the screen is not read out every second
  const [was, setWas] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const clock = useRef<() => number>(Date.now);          // read when a try is made and when the countdown ticks
  const hint = useId();

  const broken = status?.broken === true;
  const waitMs = status?.allowedAt != null ? Math.max(0, status.allowedAt - now) : 0;
  const waiting = waitMs > 0;
  if (waiting !== was) { setWas(waiting); setSpoken(waiting ? t.plural("lock.screen.wait", Math.ceil(waitMs / 1000)) : t.t("lock.screen.wait.over")); }
  useEffect(() => { if (!busy) input.current?.focus(); }, [busy]);          // at the start, and again when a try has finished
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(clock.current()), 500);
    return () => clearInterval(id);
  }, [waiting]);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (busy || waiting || broken || passphrase === "") return;
    setBusy(true);
    setWrong(false);
    setSpoken("");
    const result = await unlock(passphrase);
    setNow(clock.current());
    setBusy(false);
    if (!result.ok) { setWrong(result.reason === "wrong"); setPassphrase(""); }
  };

  return (
    <>
      <header className={shell.header}>
        <div className={shell.bar}>
          <span className={shell.brand}>{t.t("common.app.name")}</span>
          <LanguageToggle />
        </div>
      </header>
      <main id="main" className={shell.main} tabIndex={-1}>
        <div style={{ display: "grid", gap: "var(--space-4)", maxWidth: "34rem" }}>
          <h1>{t.t("lock.screen.title")}</h1>
          {broken ? <p role="alert">{t.t("lock.screen.broken")}</p> : (
            <form onSubmit={(e) => { void submit(e); }} style={{ display: "grid", gap: "var(--space-3)" }} aria-describedby={hint}>
              <p id={hint} style={{ margin: 0 }}>{t.t("lock.screen.body")}</p>
              <Field label={t.t("lock.screen.label")} error={wrong && !waiting ? t.t("lock.screen.wrong") : null}>
                <TextInput ref={input} type="password" autoComplete="current-password" autoCapitalize="none" spellCheck={false} value={passphrase} disabled={busy} onChange={(e) => { setPassphrase(e.currentTarget.value); setWrong(false); }} />
              </Field>
              {waiting ? <p aria-hidden="true" style={{ margin: 0 }}>{t.plural("lock.screen.wait", Math.ceil(waitMs / 1000))}</p> : null}
              {waiting ? <p className="muted" style={{ margin: 0 }}>{t.t("lock.screen.wait.note")}</p> : null}
              <p role="status" className="visually-hidden">{spoken}</p>
              {busy ? <p role="status" aria-busy="true" className="muted">{t.t("lock.screen.working")}</p> : null}
              <p style={{ margin: 0 }}><Button type="submit" variant="primary" disabled={busy || waiting || passphrase === ""}>{t.t("lock.screen.unlock")}</Button></p>
            </form>
          )}
          <Card title={t.t("lock.screen.forgot.title")} headingLevel={2} id="lock-forgot">
            <p>{t.t("lock.screen.forgot.body")}</p>
            <Button variant="danger" onClick={() => setConfirm(true)}>{t.t("lock.screen.erase")}</Button>
          </Card>
          <Card title={t.t("lock.screen.appearance")} headingLevel={2} id="lock-appearance">
            <SegmentedControl legend={t.t("lock.screen.appearance")} hideLegend value={prefs.theme} onChange={(theme) => setPrefs({ theme })} options={THEMES.map((v) => ({ value: v, label: t.t(`common.settings.theme.${v}` as MessageKey) }))} />
          </Card>
        </div>
      </main>
      <footer className={shell.footer}>
        <div className={shell.footerBar}><span>{t.t("common.footer.disclaimer")}</span></div>
      </footer>
      <ConfirmDialog open={confirm} title={t.t("common.settings.erase.title")} confirmLabel={t.t("common.settings.erase.confirm")} cancelLabel={t.t("common.action.cancel")}
        onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void eraseAll(); }}>
        <p>{t.t("common.settings.erase.body")}</p>
      </ConfirmDialog>
    </>
  );
}

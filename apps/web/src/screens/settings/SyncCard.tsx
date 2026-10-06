import { lazy, Suspense, useState, type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { formatLocal } from "../../app/format.ts";
import { useApp } from "../../app/store.tsx";
import { useSync } from "../../sync/SyncContext.tsx";
import { Button, Card, Field, TextInput } from "../../ui/index.ts";
import { SyncSetup } from "./SyncSetup.tsx";

const RestoreDialog = lazy(() => import("../../backup/RestoreDialog.tsx").then((m) => ({ default: m.RestoreDialog })));

/**
 * Settings → Keep a backup file up to date (docs/post-mvp/design/research-tracks.md §4; task PM-32): where the browser can choose a file, a file the app keeps current with an encrypted backup after each change.
 * Hidden where it cannot — Safari and Firefox keep the manual backup and the share sheet — and where this device cannot remember the file. Whatever state the file is in, the card says it in words and
 * offers the one thing that moves it on; the passphrase is asked for here, in each session, and never in the background.
 */
export function SyncCard(): ReactNode {
  const { t, lang } = useI18n();
  const sync = useSync();
  const storage = useApp((s) => s.storage);
  const [setup, setSetup] = useState(false);
  const [merging, setMerging] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  if (!sync.supported || storage === "memory") return null;
  const s = sync.state;
  const name = s.name ?? "";
  const working = s.phase === "writing";
  const failure = s.failure === null ? null : t.t(`common.sync.failure.${s.failure}` as MessageKey);
  const stop = <Button onClick={() => { void sync.stop(); }}>{t.t("common.sync.stop")}</Button>;
  const input = merging ? sync.mergeInput() : null;
  return (
    <Card title={t.t("common.sync.title")} headingLevel={2} id="settings-sync">
      <p>{t.t("common.sync.intro")}</p>
      <p className="muted">{t.t("common.sync.limits")}</p>
      {s.phase === "off" ? (
        <>
          <div><Button variant="primary" onClick={() => setSetup(true)}>{t.t("common.sync.setup")}</Button></div>
        </>
      ) : (
        <>
          <p role="status" aria-busy={working || undefined}>
            {working ? t.t("common.sync.state.writing") : t.t(`common.sync.state.${s.phase}` as MessageKey, { name })}
            {s.phase === "idle" && s.writtenAt !== null ? <> {t.t("common.sync.state.last", { when: formatLocal(lang, s.writtenAt) })}</> : null}
          </p>
          {failure !== null && !working ? <p role="alert">{failure}</p> : null}
          {s.phase === "permission" ? <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}><Button variant="primary" onClick={() => { void sync.allow(); }}>{t.t("common.sync.allow")}</Button>{stop}</div> : null}
          {s.phase === "passphrase" ? (
            <form onSubmit={(e) => { e.preventDefault(); void sync.unlock(passphrase).then(() => setPassphrase("")); }} style={{ display: "grid", gap: "var(--space-3)" }}>
              <Field label={t.t("common.sync.passphrase.label")}>
                <TextInput type="password" autoComplete="current-password" autoCapitalize="none" spellCheck={false} value={passphrase} onChange={(e) => setPassphrase(e.currentTarget.value)} />
              </Field>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}><Button variant="primary" type="submit" disabled={passphrase.length === 0 || working}>{t.t("common.sync.unlock")}</Button>{stop}</div>
            </form>
          ) : null}
          {s.phase === "merge" ? <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}><Button variant="primary" onClick={() => setMerging(true)}>{t.t("common.sync.merge")}</Button>{stop}</div> : null}
          {s.phase === "idle" ? <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}><Button onClick={() => { void sync.writeNow(); }}>{t.t("common.sync.now")}</Button>{stop}</div> : null}
          {s.phase === "error" ? <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}><Button variant="primary" onClick={() => { void sync.writeNow(); }}>{t.t("common.sync.retry")}</Button>{stop}</div> : null}
          {s.phase !== "writing" ? <p className="muted">{t.t("common.sync.stop.note")}</p> : null}
        </>
      )}
      {setup ? <SyncSetup onClose={() => setSetup(false)} /> : null}
      {input !== null ? (
        <Suspense fallback={null}>
          <RestoreDialog onClose={() => setMerging(false)} preloaded={{ name, text: input.text, passphrase: input.passphrase, onMerged: async () => { await sync.merged(); } }} />
        </Suspense>
      ) : null}
    </Card>
  );
}

import { useEffect, useId, useState, type ReactNode } from "react";
import { ENGINE_VERSION } from "@tcm/engine";
import { useI18n } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import { useLoadedOptional } from "../app/knowledge.tsx";
import { formatLocal } from "../app/format.ts";
import { APP_BUILD, APP_PROFILE } from "../app/profile.ts";
import { useApp } from "../app/store.tsx";
import { backupFileName, buildBackup, encryptBackup, serializeBackup, serializeEncrypted, type Source } from "../storage/backup/index.ts";
import { checkPassphrase, MIN_PASSPHRASE } from "../storage/passphrase.ts";
import { StorageHealth } from "../screens/settings/StorageHealth.tsx";
import { Button, Dialog, DialogActions, Field, Notice, TextInput, Tile } from "../ui/index.ts";
import { downloadText, shareableFile, shareFile } from "./files.ts";

type Phase = { readonly kind: "choose" } | { readonly kind: "done"; readonly name: string; readonly n: number; readonly protectedFile: boolean } | { readonly kind: "failed" };

/**
 * Make a backup (docs/post-mvp/design/backup-and-data-lock.md §3.3): what will be included, a plain warning that the file holds health information and that where it is kept is the person's choice,
 * then a download — or the system share sheet where the browser offers one. The file is built in memory; nothing is uploaded.
 */
export function BackupDialog({ onClose }: { onClose: () => void }): ReactNode {
  const { t, lang } = useI18n();
  const titleId = useId();
  const loaded = useLoadedOptional();
  const backupSource = useApp((s) => s.backupSource);
  const setPrefs = useApp((s) => s.setPrefs);
  const [source, setSource] = useState<Source | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [prefsOn, setPrefsOn] = useState(true);
  const [draftOn, setDraftOn] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "choose" });
  const [busy, setBusy] = useState(false);
  const [protect, setProtect] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [again, setAgain] = useState("");

  useEffect(() => {
    let alive = true;
    void backupSource().then((s) => { if (alive) { setSource(s); setChosen(new Set(s.assessments.map((a) => a.id))); } });
    return () => { alive = false; };
  }, [backupSource]);

  const results = source?.assessments ?? [];
  const hasDraft = source?.draft != null;
  const nothing = chosen.size === 0 && !prefsOn && !(draftOn && hasDraft);
  const check = checkPassphrase(passphrase);
  // the passphrase must be long enough and typed the same twice before the file is made
  const passphraseOk = !protect || (check.ok && passphrase === again);

  const make = async (share: boolean): Promise<void> => {
    if (source === null || busy) return;
    setBusy(true);
    try {
      const now = Date.now();
      const doc = await buildBackup(source, { assessments: [...chosen], draft: draftOn && hasDraft, prefs: prefsOn },
        { appVersion: APP_BUILD, kbVersion: loaded?.kb.version ?? "unknown", engineVersion: ENGINE_VERSION, profile: loaded?.kb.profile ?? APP_PROFILE }, now);
      const text = protect ? serializeEncrypted(await encryptBackup(serializeBackup(doc), passphrase, doc.createdAt)) : serializeBackup(doc);
      const name = backupFileName(now, protect);
      if (share) { const file = shareableFile(name, text); if (file !== null) await shareFile(file); else downloadText(name, text); } else downloadText(name, text);
      setPrefs({ lastBackupAt: now });
      setPhase({ kind: "done", name, n: doc.contents.assessments, protectedFile: protect });
      setPassphrase("");
      setAgain("");
    } catch {
      setPhase({ kind: "failed" });
    } finally {
      setBusy(false);
    }
  };

  const allOn = results.length > 0 && chosen.size === results.length;
  const canShare = source !== null && shareableFile("probe.json", "{}") !== null;
  return (
    <Dialog open onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId}>{t.t("common.backup.make.title")}</h2>
      {phase.kind === "done" ? (
        <>
          <p role="status">{phase.protectedFile
            ? (phase.n > 0 ? t.plural("common.backup.make.done.encrypted", phase.n, { name: phase.name }) : t.t("common.backup.make.done.encrypted.noResults", { name: phase.name }))
            : (phase.n > 0 ? t.plural("common.backup.make.done", phase.n, { name: phase.name }) : t.t("common.backup.make.done.noResults", { name: phase.name }))}</p>
          <DialogActions><Button variant="primary" onClick={onClose}>{t.t("common.backup.close")}</Button></DialogActions>
        </>
      ) : (
        <>
          <p>{t.t("common.backup.make.intro")}</p>
          <fieldset style={{ border: "none", padding: 0, margin: "0 0 var(--space-3)" }}>
            <legend style={{ fontWeight: 600 }}>{t.t("common.backup.make.results")}</legend>
            {source === null ? <p role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span></p> : results.length === 0 ? <p className="muted">{t.t("common.backup.make.results.none")}</p> : (
              <>
                <Tile type="checkbox" name="all" value="all" checked={allOn} onChange={(on) => setChosen(on ? new Set(results.map((a) => a.id)) : new Set())} label={t.t("common.backup.make.results.all", { n: results.length })} />
                <div style={{ maxHeight: "12rem", overflowY: "auto", display: "grid", gap: "var(--space-1)", paddingInlineStart: "var(--space-4)" }} role="group" aria-label={t.t("common.backup.make.results")}>
                  {results.map((a) => (
                    <Tile key={a.id} type="checkbox" name="result" value={a.id} checked={chosen.has(a.id)} label={formatLocal(lang, a.createdAt)}
                      onChange={(on) => setChosen((c) => { const next = new Set(c); if (on) next.add(a.id); else next.delete(a.id); return next; })} />
                  ))}
                </div>
              </>
            )}
          </fieldset>
          <Tile type="checkbox" name="prefs" value="prefs" checked={prefsOn} onChange={setPrefsOn} label={t.t("common.backup.make.prefs")} description={t.t("common.backup.make.prefs.hint")} />
          {hasDraft ? <Tile type="checkbox" name="draft" value="draft" checked={draftOn} onChange={setDraftOn} label={t.t("common.backup.make.draft")} description={t.t("common.backup.make.draft.hint")} /> : null}
          <Notice kind="info" kindLabel={t.t("common.notice.info")}>{t.t("common.backup.make.warning")}</Notice>
          <Tile type="checkbox" name="protect" value="protect" checked={protect} onChange={setProtect} label={t.t("common.backup.passphrase.toggle")} description={t.t("common.backup.passphrase.toggle.hint")} />
          {protect ? (
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
          ) : null}
          <StorageHealth compact />
          {busy && protect ? <p role="status" aria-busy="true">{t.t("common.backup.make.working")}</p> : null}
          {phase.kind === "failed" ? <p role="alert">{t.t("common.backup.make.failed")}</p> : null}
          {nothing ? <p className="muted">{t.t("common.backup.make.nothing")}</p> : null}
          <DialogActions>
            <Button onClick={onClose}>{t.t("common.action.cancel")}</Button>
            {canShare ? <Button disabled={nothing || busy || source === null || !passphraseOk} onClick={() => { void make(true); }}>{t.t("common.backup.make.share")}</Button> : null}
            <Button variant="primary" disabled={nothing || busy || source === null || !passphraseOk} onClick={() => { void make(false); }}>{t.t("common.backup.make.action")}</Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

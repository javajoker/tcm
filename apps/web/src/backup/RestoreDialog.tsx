import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { ENGINE_VERSION } from "@tcm/engine";
import { useI18n } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import { makeReplay, currentOf } from "../app/backupReplay.ts";
import { formatLocal } from "../app/format.ts";
import { NeedsKnowledge, useLoaded } from "../app/knowledge.tsx";
import { APP_PROFILE } from "../app/profile.ts";
import { randomId } from "../storage/ids.ts";
import { useApp } from "../app/store.tsx";
import { applyPlan, openEncrypted, planImport, prepareImport, readBackup, type BackupDocument, type Conflict, type Plan, type Prepared } from "../storage/backup/index.ts";
import { Button, ChoiceGroup, Dialog, DialogActions, Field, LinkButton, TextInput, Tile } from "../ui/index.ts";

type Phase =
  | { readonly kind: "pick" }
  | { readonly kind: "reading" }
  | { readonly kind: "locked"; readonly raw: Readonly<Record<string, unknown>>; readonly failure: MessageKey | null }
  | { readonly kind: "error"; readonly message: MessageKey }
  | { readonly kind: "preview"; readonly document: BackupDocument; readonly prepared: Prepared; readonly plan: Plan }
  | { readonly kind: "done"; readonly added: number; readonly replaced: number; readonly both: number; readonly skipped: number };

/**
 * A file already in hand, to be merged rather than chosen (the file sync, docs/post-mvp/design/research-tracks.md §4): its text and the passphrase it was opened with. `onMerged` is called once what the person
 * chose has been done — or there was nothing to do — and the sync then carries on, and writes the merged history back.
 */
export interface Preloaded { readonly name: string; readonly text: string; readonly passphrase: string; readonly onMerged: () => void | Promise<void> }

const REASON = { invalid: "common.backup.preview.reason.invalid", altered: "common.backup.preview.reason.altered", "development-build": "common.backup.preview.reason.development-build", duplicate: "common.backup.preview.reason.duplicate" } as const;
const CONFLICTS: readonly Conflict[] = ["skip", "keep-both", "replace-newer"];

/**
 * Restore from a file (docs/post-mvp/design/backup-and-data-lock.md §3.4): the file is untrusted, so it is read, checked and shown — what it holds, what is new, what differs, what is left out and why —
 * before anything is written; the person chooses what happens to the results that differ, and only then are the changes made, all together or not at all.
 */
function Body({ onClose, preloaded }: { onClose: () => void; preloaded?: Preloaded }): ReactNode {
  const { t, lang } = useI18n();
  const { kb, engine } = useLoaded();
  const store = useApp;
  const applyImport = store((s) => s.applyImport);
  const backupSource = store((s) => s.backupSource);
  const storage = store((s) => s.storage);
  const currentPrefs = store((s) => s.prefs);
  const [phase, setPhase] = useState<Phase>(preloaded === undefined ? { kind: "pick" } : { kind: "reading" });
  const [conflict, setConflict] = useState<Conflict>("skip");
  const [prefsOn, setPrefsOn] = useState(true);
  const [draftOn, setDraftOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [opening, setOpening] = useState(false);
  const context = useMemo(() => ({ profile: APP_PROFILE, current: currentOf(kb, ENGINE_VERSION), replay: makeReplay(kb, engine) }), [kb, engine]);

  /** The file is a readable backup: check it and show what it holds. */
  const preview = async (document: BackupDocument): Promise<void> => {
    const source = await backupSource();
    const prepared = prepareImport(document, { ...context, now: Date.now() });
    setHasDraft(source.draft !== null);
    setConflict("skip");
    setPrefsOn(true);
    setDraftOn(false);
    setPhase({ kind: "preview", document, prepared, plan: planImport(prepared, source.assessments) });
  };

  /** The text of a file: check it and show what it holds; an encrypted one is opened with `known` where there is one, and otherwise asks for its passphrase. */
  const load = async (text: string, size: number, known?: string): Promise<void> => {
    setPhase({ kind: "reading" });
    try {
      const read = await readBackup(text, size);
      if (read.kind === "error") { setPhase({ kind: "error", message: `common.backup.error.${read.error.code}` as MessageKey }); return; }
      if (read.kind === "encrypted") {
        if (known !== undefined) {
          const opened = await openEncrypted(read.raw, known);
          if (opened.kind === "backup") { await preview(opened.document); return; }
          if (opened.kind === "error") { setPhase({ kind: "error", message: `common.backup.error.${opened.error.code}` as MessageKey }); return; }
        }
        setPassphrase("");
        setPhase({ kind: "locked", raw: read.raw, failure: null });
        return;
      }
      await preview(read.document);
    } catch {
      setPhase({ kind: "error", message: "common.backup.error.malformed" });
    }
  };

  const choose = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.currentTarget.files?.[0];
    if (file === undefined) return;
    await load(await file.text(), file.size);
  };

  // a file already in hand (the sync's): read once, as soon as the dialog opens
  const started = useRef(false);
  useEffect(() => {
    if (preloaded === undefined || started.current) return;
    started.current = true;
    void load(preloaded.text, preloaded.text.length, preloaded.passphrase);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once: the file in hand does not change while the dialog is open
  }, []);

  /** A protected file: the passphrase is used once and dropped, whatever the answer. A wrong passphrase and a damaged file are one message. */
  const unlock = async (raw: Readonly<Record<string, unknown>>): Promise<void> => {
    if (opening) return;
    setOpening(true);
    try {
      const opened = await openEncrypted(raw, passphrase);
      setPassphrase("");
      if (opened.kind === "locked") { setPhase({ kind: "locked", raw, failure: `common.backup.error.${opened.error}` as MessageKey }); return; }
      if (opened.kind === "error") { setPhase({ kind: "error", message: `common.backup.error.${opened.error.code}` as MessageKey }); return; }
      if (opened.kind === "encrypted") { setPhase({ kind: "error", message: "common.backup.error.malformed" }); return; }
      await preview(opened.document);
    } catch {
      setPassphrase("");
      setPhase({ kind: "error", message: "common.backup.error.malformed" });
    } finally {
      setOpening(false);
    }
  };

  const restore = async (): Promise<void> => {
    if (phase.kind !== "preview" || busy) return;
    setBusy(true);
    try {
      const source = await backupSource();
      const applied = applyPlan(planImport(phase.prepared, source.assessments), phase.prepared, { conflict, includeDraft: draftOn, includePrefs: prefsOn }, randomId, new Set(source.assessments.map((a) => a.id)));
      // with a file in hand and nothing to bring in there is nothing to apply: the file is as this device now knows it
      const ok = preloaded !== undefined && applied.writes.length === 0 && applied.prefs === null ? true : await applyImport(applied.writes, applied.prefs);
      if (ok && preloaded !== undefined) await preloaded.onMerged();
      setPhase(ok ? { kind: "done", added: applied.added, replaced: applied.replaced, both: applied.keptBoth, skipped: applied.skipped } : { kind: "error", message: "common.backup.error.storage" });
    } finally {
      setBusy(false);
    }
  };

  if (storage === "memory") return <><p role="alert">{t.t("common.backup.card.restore.blocked")}</p><DialogActions><Button onClick={onClose}>{t.t("common.backup.close")}</Button></DialogActions></>;

  if (phase.kind === "done") {
    return (
      <>
        <h3>{t.t("common.backup.done.title")}</h3>
        <p role="status">{t.t("common.backup.done.text", { added: phase.added, replaced: phase.replaced, both: phase.both, skipped: phase.skipped })}</p>
        <DialogActions><LinkButton href="/history" onClick={onClose}>{t.t("common.backup.done.history")}</LinkButton><Button variant="primary" onClick={onClose}>{t.t("common.backup.close")}</Button></DialogActions>
      </>
    );
  }

  const file = (
    <label style={{ display: "grid", gap: "var(--space-1)" }}>
      <span style={{ fontWeight: 600 }}>{t.t("common.backup.restore.file")}</span>
      <input type="file" accept="application/json,.json" onChange={(e) => { void choose(e); }} />
    </label>
  );
  if (phase.kind === "pick") return <><p>{t.t("common.backup.restore.intro")}</p>{file}<DialogActions><Button onClick={onClose}>{t.t("common.action.cancel")}</Button></DialogActions></>;
  if (phase.kind === "reading") return <p role="status" aria-busy="true">{t.t("common.backup.restore.reading")}</p>;
  if (phase.kind === "locked") {
    const raw = phase.raw;
    return (
      <form onSubmit={(e) => { e.preventDefault(); void unlock(raw); }} style={{ display: "grid", gap: "var(--space-3)" }}>
        <p>{t.t("common.backup.unlock.intro")}</p>
        <Field label={t.t("common.backup.passphrase.label")} error={phase.failure !== null ? t.t(phase.failure) : null}>
          <TextInput type="password" autoComplete="current-password" autoCapitalize="none" spellCheck={false} value={passphrase} onChange={(e) => setPassphrase(e.currentTarget.value)} />
        </Field>
        {opening ? <p role="status" aria-busy="true">{t.t("common.backup.unlock.working")}</p> : null}
        <DialogActions>
          {preloaded === undefined ? <Button onClick={() => { setPassphrase(""); setPhase({ kind: "pick" }); }}>{t.t("common.backup.preview.another")}</Button> : <Button onClick={onClose}>{t.t("common.sync.merge.later")}</Button>}
          <Button variant="primary" type="submit" disabled={passphrase.length === 0 || opening}>{t.t("common.backup.unlock.action")}</Button>
        </DialogActions>
      </form>
    );
  }
  if (phase.kind === "error") return <><p role="alert">{t.t(phase.message)}</p>{preloaded === undefined ? file : null}<DialogActions><Button onClick={onClose}>{t.t("common.backup.close")}</Button></DialogActions></>;

  const { document, prepared, plan } = phase;
  const unchecked = prepared.records.filter((r) => r.checked === "unchecked").length;
  // the preferences of the file are offered only where they would change something here
  const prefsDiffer = prepared.prefs !== null && Object.entries(prepared.prefs).some(([k, v]) => currentPrefs[k as keyof typeof currentPrefs] !== v);
  const nothingToDo = plan.counts.new === 0 && (plan.counts.differs === 0 || conflict === "skip") && !(prefsOn && prefsDiffer) && !(draftOn && prepared.draft !== null);
  return (
    <>
      <h3>{t.t("common.backup.preview.title")}</h3>
      <p>{t.t("common.backup.preview.made", { when: document.createdAt === "" ? "?" : formatLocal(lang, Date.parse(document.createdAt) || 0), version: document.exportedFrom.appVersion || "?" })}</p>
      <p>{t.plural("common.backup.preview.counts", prepared.records.length, { added: plan.counts.new, same: plan.counts.identical, differ: plan.counts.differs })}</p>
      {plan.range !== null ? <p className="muted">{t.t("common.backup.preview.range", { from: formatLocal(lang, plan.range.from), to: formatLocal(lang, plan.range.to) })}</p> : null}
      {unchecked > 0 ? <p>{t.plural("common.backup.preview.imported", unchecked)}</p> : null}
      {prepared.rejected.length > 0 ? (
        <section aria-label={t.t("common.backup.preview.rejected.title")}>
          <h4>{t.t("common.backup.preview.rejected.title")}</h4>
          <p>{t.t("common.backup.preview.rejected.intro")}</p>
          <ul>{prepared.rejected.map((r, i) => <li key={`${r.id ?? "?"}-${i}`}>{t.t("common.backup.preview.rejected.item", { id: r.id ?? "?", reason: t.t(REASON[r.reason], { detail: r.detail }) })}</li>)}</ul>
        </section>
      ) : null}
      {plan.counts.differs > 0 ? (
        <ChoiceGroup legend={t.plural("common.backup.preview.conflict.legend", plan.counts.differs)} value={conflict} onChange={(v) => setConflict(v as Conflict)}
          options={CONFLICTS.map((c) => ({ value: c, label: t.t(`common.backup.preview.conflict.${c}` as MessageKey) }))} />
      ) : null}
      {prefsDiffer ? <Tile type="checkbox" name="prefs" value="prefs" checked={prefsOn} onChange={setPrefsOn} label={t.t("common.backup.preview.prefs")} /> : null}
      {prepared.draft !== null ? <Tile type="checkbox" name="draft" value="draft" checked={draftOn} onChange={setDraftOn} label={t.t("common.backup.preview.draft")} {...(hasDraft ? { description: t.t("common.backup.preview.draft.hint") } : {})} /> : null}
      {nothingToDo ? <p className="muted">{t.t("common.backup.preview.nothing")}</p> : null}
      <DialogActions>
        {preloaded === undefined ? <Button onClick={() => setPhase({ kind: "pick" })}>{t.t("common.backup.preview.another")}</Button> : <Button onClick={onClose}>{t.t("common.sync.merge.later")}</Button>}
        <Button variant="primary" disabled={(nothingToDo && preloaded === undefined) || busy} onClick={() => { void restore(); }}>{preloaded === undefined ? t.t("common.backup.preview.action") : t.t("common.sync.merge.action")}</Button>
      </DialogActions>
    </>
  );
}

export function RestoreDialog({ onClose, preloaded }: { onClose: () => void; preloaded?: Preloaded }): ReactNode {
  const { t } = useI18n();
  const titleId = useId();
  return (
    <Dialog open onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId}>{preloaded === undefined ? t.t("common.backup.restore.title") : t.t("common.sync.merge.title")}</h2>
      {preloaded === undefined ? null : <p>{t.t("common.sync.merge.intro", { name: preloaded.name })}</p>}
      <NeedsKnowledge><Body onClose={onClose} {...(preloaded === undefined ? {} : { preloaded })} /></NeedsKnowledge>
    </Dialog>
  );
}

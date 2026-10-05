// The importer after the file has been read (docs/post-mvp/design/backup-and-data-lock.md §3.4, stages 5–11): every record is migrated, validated, refused or labelled; the result is compared with
// what is already here; the person's choice becomes a list of writes that the storage layer applies in ONE transaction. Pure: the knowledge base and the engine reach it only through `replay`.
import { canonicalJson } from "./canonical.ts";
import { ASSESSMENT_MIGRATIONS, ASSESSMENT_VERSION, DRAFT_MIGRATIONS, DRAFT_VERSION, migrate, wrap, type Envelope } from "../migrations.ts";
import { toStored } from "../draft.ts";
import type { Draft, SavedAssessment } from "../types.ts";
import type { BackupDocument } from "./format.ts";
import { isPlainRecord } from "./plain.ts";
import { validateAssessment, validateDraft, validatePrefs, type BackupPrefs } from "./validate.ts";

/**
 * What this build runs: a record made by the same engine and knowledge base, in the same profile, is re-run and compared. (The parameter fingerprint and the season model are not asked for here:
 * they come out of the run itself, and a record that differs only in those was made by another version of them.)
 */
export interface Current { readonly engineVersion: string; readonly kbVersion: string; readonly profile: string }
/** `same`: proved. `other-version`: the re-run differs, but only because the parameters or the season model are not the ones the record was made with. `different`: altered. `cannot`: the answers do not suffice. */
export type ReplayOutcome = "same" | "other-version" | "different" | "cannot";

export interface ImportContext {
  /** The profile of THIS build: a release build refuses records made by a development build (they may hold content its bundle does not have). */
  readonly profile: "release" | "dev";
  readonly current: Current;
  /**
   * Run the engine on the record's answers at the record's own time and compare with the record's result: `same` proves it is what this version makes from those answers; `different` means it is
   * not; `cannot` where the answers do not suffice (a birth moment the person did not choose to keep). Only asked for records stamped with the current versions.
   */
  readonly replay: (saved: SavedAssessment) => ReplayOutcome;
  readonly now: number;
}

export type RejectReason = "invalid" | "altered" | "development-build" | "duplicate";
export interface Rejected { readonly id: string | null; readonly reason: RejectReason; readonly detail: string }
export interface PreparedRecord {
  readonly saved: SavedAssessment;
  /** `verified`: made by this version from those answers (proved by replay). `unchecked`: made by another version (or its birth moment is gone): kept as saved and marked *Imported*. */
  readonly checked: "verified" | "unchecked";
}
export interface Prepared {
  readonly records: readonly PreparedRecord[];
  readonly rejected: readonly Rejected[];
  readonly draft: Draft | null;
  readonly draftRejected: string | null;
  readonly prefs: BackupPrefs | null;
  readonly prefsRejected: string | null;
}

const idOf = (raw: unknown): string | null => (isPlainRecord(raw) && isPlainRecord(raw["data"]) && typeof raw["data"]["id"] === "string" ? raw["data"]["id"].slice(0, 80) : null);

/** Stages 5–8: migrate, validate, refuse, replay, label. Never throws on content; a record that cannot be used is listed with its reason. */
export function prepareImport(document: BackupDocument, ctx: ImportContext): Prepared {
  const records: PreparedRecord[] = [];
  const rejected: Rejected[] = [];
  const seen = new Set<string>();
  for (const envelope of document.payload.assessments) {
    const migrated = migrate(envelope, ASSESSMENT_VERSION, ASSESSMENT_MIGRATIONS);
    if (migrated === null) { rejected.push({ id: idOf(envelope), reason: "invalid", detail: "a record the app cannot read" }); continue; }
    const v = validateAssessment(migrated);
    if (!v.ok) { rejected.push({ id: idOf({ data: migrated }), reason: "invalid", detail: v.reason }); continue; }
    const saved = v.value;
    if (seen.has(saved.id)) { rejected.push({ id: saved.id, reason: "duplicate", detail: "the file holds this id twice" }); continue; }
    seen.add(saved.id);
    if (ctx.profile === "release" && saved.profile !== "release") { rejected.push({ id: saved.id, reason: "development-build", detail: `made by a ${saved.profile} build` }); continue; }
    const sameVersions = saved.engineVersion === ctx.current.engineVersion && saved.kbVersion === ctx.current.kbVersion && saved.profile === ctx.current.profile;
    const outcome: ReplayOutcome = sameVersions ? ctx.replay(saved) : "cannot";
    if (outcome === "different") { rejected.push({ id: saved.id, reason: "altered", detail: "its result does not follow from its answers" }); continue; }
    if (outcome === "same") {
      const { imported: _mark, ...clean } = saved;
      records.push({ saved: clean, checked: "verified" });
    } else {
      records.push({ saved: saved.imported ? saved : { ...saved, imported: { at: ctx.now, from: { appVersion: saved.appVersion, kbVersion: saved.kbVersion, engineVersion: saved.engineVersion, profile: saved.profile } } }, checked: "unchecked" });
    }
  }

  let draft: Draft | null = null, draftRejected: string | null = null;
  if (document.payload.draft != null) {
    const migrated = migrate(document.payload.draft, DRAFT_VERSION, DRAFT_MIGRATIONS);
    if (migrated === null) draftRejected = "a draft the app cannot read";
    else { const d = validateDraft(migrated); if (d.ok) draft = d.value; else draftRejected = d.reason; }
  }
  let prefs: BackupPrefs | null = null, prefsRejected: string | null = null;
  if (document.payload.prefs != null) { const p = validatePrefs(document.payload.prefs); if (p.ok) prefs = p.value; else prefsRejected = p.reason; }
  return { records, rejected, draft, draftRejected, prefs, prefsRejected };
}

// ── comparing with what is here ─────────────────────────────────────────────

export type Status = "new" | "identical" | "differs";
export interface PlanItem { readonly record: PreparedRecord; readonly status: Status; readonly existing?: SavedAssessment }
export interface Plan {
  readonly items: readonly PlanItem[];
  readonly counts: { readonly new: number; readonly identical: number; readonly differs: number };
  /** The earliest and latest `createdAt` among the records that are new or differ, for the preview. */
  readonly range: { readonly from: number; readonly to: number } | null;
}

/** The record without its import mark, in canonical form: a record imported before and the same record in a file are the same record. */
const core = (s: SavedAssessment): string => { const { imported: _m, ...rest } = s; return canonicalJson(rest); };

/** Stage 9: each record is new, identical to one already here (skipped silently) or different (the same id, other content). */
export function planImport(prepared: Prepared, existing: readonly SavedAssessment[]): Plan {
  const here = new Map(existing.map((e) => [e.id, e]));
  const items: PlanItem[] = prepared.records.map((record) => {
    const other = here.get(record.saved.id);
    if (other === undefined) return { record, status: "new" };
    return { record, status: core(other) === core(record.saved) ? "identical" : "differs", existing: other };
  });
  const counts = { new: items.filter((i) => i.status === "new").length, identical: items.filter((i) => i.status === "identical").length, differs: items.filter((i) => i.status === "differs").length };
  const times = items.filter((i) => i.status !== "identical").map((i) => i.record.saved.createdAt);
  return { items, counts, range: times.length === 0 ? null : { from: Math.min(...times), to: Math.max(...times) } };
}

// ── the person's choice, as writes ──────────────────────────────────────────

/** What to do with a record that differs from the one with the same id: skip it, keep both (the imported one gets a new id), or replace the one here if the imported one is newer. */
export type Conflict = "skip" | "keep-both" | "replace-newer";
export interface Choice { readonly conflict: Conflict; /** Replace the unfinished assessment (never overwritten unless chosen). */ readonly includeDraft: boolean; readonly includePrefs: boolean }
export interface Write { readonly store: "assessments" | "drafts"; readonly key: string; readonly value: Envelope }
export interface Applied {
  readonly writes: readonly Write[];
  readonly added: number;
  readonly replaced: number;
  readonly keptBoth: number;
  readonly skipped: number;
  readonly prefs: BackupPrefs | null;
}

/** The writes for a plan and a choice, to be applied together or not at all. Nothing is written for an identical record, or for a skipped one. */
export function applyPlan(plan: Plan, prepared: Prepared, choice: Choice, newId: () => string, existingIds: ReadonlySet<string>): Applied {
  const writes: Write[] = [];
  const used = new Set(existingIds);
  for (const i of plan.items) used.add(i.record.saved.id);
  let added = 0, replaced = 0, keptBoth = 0, skipped = 0;
  for (const { record, status, existing } of plan.items) {
    const saved = record.saved;
    if (status === "identical") continue;
    if (status === "new") { writes.push({ store: "assessments", key: saved.id, value: wrap(ASSESSMENT_VERSION, saved) }); added++; continue; }
    if (choice.conflict === "skip") { skipped++; continue; }
    if (choice.conflict === "replace-newer") {
      if (saved.createdAt > existing!.createdAt) { writes.push({ store: "assessments", key: saved.id, value: wrap(ASSESSMENT_VERSION, saved) }); replaced++; } else skipped++;
      continue;
    }
    let id = newId();
    while (used.has(id)) id = newId();
    used.add(id);
    writes.push({ store: "assessments", key: id, value: wrap(ASSESSMENT_VERSION, { ...saved, id }) });
    keptBoth++;
  }
  if (choice.includeDraft && prepared.draft !== null) writes.push({ store: "drafts", key: "current", value: wrap(DRAFT_VERSION, toStored(prepared.draft)) });
  return { writes, added, replaced, keptBoth, skipped, prefs: choice.includePrefs ? prepared.prefs : null };
}

// The backup file (docs/post-mvp/design/backup-and-data-lock.md §3.2, §3.3): a versioned JSON document with a checksum, built from what the person chooses to include, and read back in the first stages of
// the importer — size, parse, identify, integrity. Pure: nothing here touches storage. The checksum detects truncation and damage; it is not authentication (nothing client-side can be).
import { ASSESSMENT_VERSION, DRAFT_VERSION, wrap, type Envelope } from "../migrations.ts";
import { toStored } from "../draft.ts";
import type { Draft, Prefs, SavedAssessment } from "../types.ts";
import { canonicalJson, sha256Hex } from "./canonical.ts";
import { BACKUP_ENCRYPTED_FORMAT, BACKUP_FORMAT, BACKUP_VERSION, LIMITS } from "./limits.ts";
import { isPlainRecord } from "./plain.ts";
import type { BackupPrefs } from "./validate.ts";

/** Who made the backup: the versions of the app that wrote it. */
export interface Stamps { readonly appVersion: string; readonly kbVersion: string; readonly engineVersion: string; readonly profile: string }

export interface BackupPayload {
  readonly assessments: readonly Envelope[];
  readonly draft: Envelope | null;
  readonly prefs: BackupPrefs | null;
}
export interface BackupDocument {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: typeof BACKUP_VERSION;
  readonly createdAt: string;
  readonly exportedFrom: Stamps;
  readonly storage: { readonly assessment: number; readonly draft: number };
  /** What is inside, without opening it (shown before an import; the encrypted file hides it). */
  readonly contents: { readonly assessments: number; readonly draft: boolean; readonly prefs: boolean; readonly birth: boolean };
  readonly checksum: { readonly alg: "SHA-256"; readonly of: "payload"; readonly value: string };
  readonly payload: BackupPayload;
}

/** What the person chose to include. The unfinished assessment is off by default; the lock data never goes. */
export interface Selection {
  /** Ids to include, or every saved assessment. */
  readonly assessments: "all" | readonly string[];
  readonly draft: boolean;
  readonly prefs: boolean;
}
export const DEFAULT_SELECTION: Selection = { assessments: "all", draft: false, prefs: true };

export interface Source {
  readonly assessments: readonly SavedAssessment[];
  readonly draft: Draft | null;
  readonly prefs: Prefs;
}

/** The part of the preferences that travels: not the disclaimer acknowledgement (it must be given again on the new device and version) and not the one-time offer flags. */
export const backupPrefs = (p: Prefs): BackupPrefs => ({ ...(p.lang ? { lang: p.lang } : {}), theme: p.theme, textScale: p.textScale, ...(p.region ? { region: p.region } : {}), autoAdvance: p.autoAdvance });

export async function buildBackup(source: Source, selection: Selection, stamps: Stamps, now: number): Promise<BackupDocument> {
  const chosen = selection.assessments === "all" ? source.assessments : source.assessments.filter((a) => (selection.assessments as readonly string[]).includes(a.id));
  const payload: BackupPayload = {
    assessments: [...chosen].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1)).map((a) => wrap(ASSESSMENT_VERSION, a)),
    draft: selection.draft && source.draft !== null ? wrap(DRAFT_VERSION, toStored(source.draft)) : null,
    prefs: selection.prefs ? backupPrefs(source.prefs) : null,
  };
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date(now).toISOString().replace(/\.\d{3}Z$/, "Z"), exportedFrom: stamps,
    storage: { assessment: ASSESSMENT_VERSION, draft: DRAFT_VERSION },
    contents: { assessments: payload.assessments.length, draft: payload.draft !== null, prefs: payload.prefs !== null, birth: chosen.some((a) => a.input.birth !== undefined) || (payload.draft !== null && toStored(source.draft!).birth !== undefined) },
    checksum: { alg: "SHA-256", of: "payload", value: await sha256Hex(canonicalJson(payload)) },
    payload,
  };
}

/** `tcm-backup-2026-10-05.json`, or `….encrypted.json`. */
export const backupFileName = (now: number, encrypted = false): string => `tcm-backup-${new Date(now).toISOString().slice(0, 10)}${encrypted ? ".encrypted" : ""}.json`;
export const serializeBackup = (document: BackupDocument): string => `${JSON.stringify(document, null, 1)}\n`;

// ── reading ─────────────────────────────────────────────────────────────────

export type ReadErrorCode =
  | "too-large"            // over the size limit
  | "not-json"             // not JSON at all
  | "not-backup"           // JSON, but not a backup of this app
  | "newer-version"        // made by a newer version of the app: update first
  | "newer-storage"        // its records are of a newer storage schema
  | "too-many-records"
  | "malformed"            // a backup, but its parts are not where they should be
  | "damaged";             // the checksum does not match: truncated or edited
export interface ReadError { readonly code: ReadErrorCode; readonly detail?: string }
export type ReadResult =
  | { readonly kind: "backup"; readonly document: BackupDocument }
  | { readonly kind: "encrypted"; readonly raw: Readonly<Record<string, unknown>> }
  | { readonly kind: "error"; readonly error: ReadError };
const failure = (code: ReadErrorCode, detail?: string): ReadResult => ({ kind: "error", error: { code, ...(detail ? { detail } : {}) } });

/** Stages 1–4 of the importer: size, parse, identify, integrity. Nothing is written, nothing is trusted yet (the records are validated one by one afterwards). */
export async function readBackup(textOfFile: string, sizeBytes: number = textOfFile.length): Promise<ReadResult> {
  if (sizeBytes > LIMITS.fileBytes || textOfFile.length > LIMITS.fileBytes) return failure("too-large");
  let raw: unknown;
  try { raw = JSON.parse(textOfFile); } catch { return failure("not-json"); }
  if (!isPlainRecord(raw)) return failure("not-backup");
  if (raw["format"] === BACKUP_ENCRYPTED_FORMAT) {
    if (typeof raw["version"] !== "number" || !Number.isInteger(raw["version"]) || raw["version"] < 1) return failure("malformed", "version");
    if (raw["version"] > BACKUP_VERSION) return failure("newer-version");
    return { kind: "encrypted", raw };
  }
  if (raw["format"] !== BACKUP_FORMAT) return failure("not-backup");
  return checkDocument(raw);
}

/** The identification and integrity stages for an already-parsed plain document (the decrypted plaintext of an encrypted file goes through here too). */
export async function checkDocument(raw: Record<string, unknown>): Promise<ReadResult> {
  const version = raw["version"];
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return failure("malformed", "version");
  if (version > BACKUP_VERSION) return failure("newer-version");
  const storage = raw["storage"];
  if (!isPlainRecord(storage) || !Number.isInteger(storage["assessment"]) || !Number.isInteger(storage["draft"])) return failure("malformed", "storage");
  if ((storage["assessment"] as number) > ASSESSMENT_VERSION || (storage["draft"] as number) > DRAFT_VERSION) return failure("newer-storage");
  const payload = raw["payload"];
  if (!isPlainRecord(payload) || !Array.isArray(payload["assessments"])) return failure("malformed", "payload");
  if (payload["assessments"].length > LIMITS.records) return failure("too-many-records");
  const checksum = raw["checksum"];
  if (!isPlainRecord(checksum) || checksum["alg"] !== "SHA-256" || checksum["of"] !== "payload" || typeof checksum["value"] !== "string") return failure("malformed", "checksum");
  let actual: string;
  try { actual = await sha256Hex(canonicalJson(payload)); } catch { return failure("damaged"); }
  if (actual !== checksum["value"]) return failure("damaged");
  const exportedFrom = raw["exportedFrom"];
  if (!isPlainRecord(exportedFrom)) return failure("malformed", "exportedFrom");
  const stamp = (k: string): string => (typeof exportedFrom[k] === "string" ? (exportedFrom[k] as string).slice(0, 200) : "");
  const contents = isPlainRecord(raw["contents"]) ? raw["contents"] : {};
  return { kind: "backup", document: {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: typeof raw["createdAt"] === "string" ? raw["createdAt"].slice(0, 40) : "",
    exportedFrom: { appVersion: stamp("appVersion"), kbVersion: stamp("kbVersion"), engineVersion: stamp("engineVersion"), profile: stamp("profile") },
    storage: { assessment: storage["assessment"] as number, draft: storage["draft"] as number },
    contents: { assessments: payload["assessments"].length, draft: payload["draft"] != null, prefs: payload["prefs"] != null, birth: contents["birth"] === true },
    checksum: { alg: "SHA-256", of: "payload", value: checksum["value"] },
    // the payload is still untrusted data: its records are validated and rebuilt one by one (plan.ts), never used as they are
    payload: payload as unknown as BackupPayload,
  } };
}

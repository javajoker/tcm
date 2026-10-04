// What is stored, and where (docs/privacy.md §2 is the inventory — add every new stored field there in the same change).
import type { Assessment, AssessContext, FindingState, Subject } from "@tcm/engine";
import type { Finding } from "@tcm/engine";
import type { BirthInput } from "@tcm/wuxing";
import type { Lang } from "@tcm/i18n";

export type { FindingState };

/** localStorage `tcm.prefs`: tiny, low-sensitivity preferences. */
export interface Prefs {
  /** The language the user CHOSE; absent until they do (the one-time English offer is shown only while absent). */
  readonly lang?: Lang;
  readonly theme: "system" | "light" | "dark";
  readonly textScale: 0.9 | 1 | 1.15 | 1.3;
  readonly disclaimerAck?: { readonly version: string; readonly at: number };
  readonly langOfferDismissed: boolean;
}

export const TEXT_SCALES = [0.9, 1, 1.15, 1.3] as const;
export const THEMES = ["system", "light", "dark"] as const;
export const DEFAULT_PREFS: Prefs = { theme: "system", textScale: 1, langOfferDismissed: false };

/** IndexedDB `drafts/current`: the in-progress assessment, persisted after every answer. JSON-serialisable (no Set/Map/undefined holes). */
export interface Draft {
  readonly id: string;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly subject: Partial<Omit<Subject, "birth">>;
  /** Red-flag items answered yes or unsure. */
  readonly redFlags: readonly string[];
  readonly findings: Readonly<Record<string, Finding>>;
  readonly context: AssessContext;
  readonly constitutionAnswers: Readonly<Record<string, number>>;
  /** Present in memory for the session; written to storage only when `rememberBirth` is true (privacy §3). */
  readonly birth?: BirthInput;
  readonly rememberBirth: boolean;
  /** Blocking notices the user has acknowledged. */
  readonly acknowledgements: readonly string[];
  readonly position: { readonly route: string; readonly questionId?: string };
}

/** IndexedDB `assessments/<id>`: a saved result, as shown (tech spec §8.3). */
export interface SavedAssessment {
  readonly id: string;
  readonly createdAt: number;
  readonly appVersion: string;
  readonly kbVersion: string;
  readonly engineVersion: string;
  readonly paramsFingerprint: string;
  readonly profile: string;
  readonly lang: Lang;
  readonly seasonModel: string;
  /** The inputs; `birth` only when the user chose to remember it. */
  readonly input: { readonly subject: Draft["subject"]; readonly redFlags: readonly string[]; readonly findings: Draft["findings"]; readonly context: AssessContext; readonly birth?: BirthInput };
  readonly result: Assessment;
  readonly userNote?: string;
  readonly feedback?: Readonly<Record<string, "match" | "partial" | "no">>;
}

/** "persistent": answers are kept on this device. "memory": storage is blocked or failed — the app works but nothing survives a reload ("Not saved" chip). */
export type StorageStatus = "persistent" | "memory";

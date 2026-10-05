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
  /** Region of the emergency numbers (an id of `emergency.json`); absent → the data's default. */
  readonly region?: string;
  /** Move on automatically after a single-choice answer without a severity step (UX spec §4.4). */
  readonly autoAdvance: boolean;
  /** Start every new assessment with "remember my birth data on this device" ticked (off unless the person turned it on; privacy §3). */
  readonly rememberBirthDefault?: boolean;
}

export const TEXT_SCALES = [0.9, 1, 1.15, 1.3] as const;
export const THEMES = ["system", "light", "dark"] as const;
export const DEFAULT_PREFS: Prefs = { theme: "system", textScale: 1, langOfferDismissed: false, autoAdvance: true };

/** What the user answered on the profile screen that the engine's `Subject` cannot express (free text, and explicit "none" answers — silence is not "none"). */
export interface ProfileAnswers {
  /** Takes regular medicines? Unanswered is not "no". "unsure" is treated conservatively (class "other"). */
  readonly medications?: "none" | "some" | "unsure";
  /** Free-text medicine names the user typed under "other" (never interpreted; shown back in the notice N-MED-UNKNOWN). */
  readonly medicationText: readonly string[];
  readonly allergies?: "none" | "some";
  /** Serious long-term conditions: "none" was ticked, or at least one RF_C_* item is in the draft's red flags. */
  readonly conditions?: "none" | "some";
}

export type RedFlagAnswer = "yes" | "no" | "unsure";

/** The red-flag screening (S04/S05): per-item answers for levels A and B, corrections, and when each blocking notice was acknowledged. */
export interface Screening {
  /** Answers by red-flag id (levels A and B; level-C items come from the profile). "unsure" counts as yes (safety policy §2.2). */
  readonly answers: Readonly<Record<string, RedFlagAnswer>>;
  /** A/B items that were yes or unsure and then changed to "no" through the explicit "I made a mistake" action (recorded). */
  readonly corrected: readonly string[];
  /** Acknowledged blocking notices: `<notice id>|<sorted reasons>` → time. A change of the reasons needs a new acknowledgement. */
  readonly acknowledgedAt: Readonly<Record<string, number>>;
}

/** Where the adaptive inquiry (S06/S07) stands. The answers themselves live in the draft's `findings` and `context`. */
export interface InquiryProgress {
  /** Complaint modules chosen on S06 (empty = "general check"); `null` until S06 has been confirmed. */
  readonly modules: readonly string[] | null;
  /** Ids of the questions shown and answered or skipped, in order (Back walks it; a skipped question is not asked again). */
  readonly history: readonly string[];
  /** Contradictions the user has resolved (`<group>|<symptoms>`), so they are asked once. */
  readonly resolved: readonly string[];
}

/** How the resting pulse rate was obtained: typed in, counted with the 30-second timer, or tapped along with the beat. */
export type PulseMethod = "typed" | "timer" | "tap";

/** What the observation screens keep besides the findings: the form values that cannot be read back from them. */
export interface ObserveProgress {
  /** Resting pulse rate (beats per minute) and the rhythm the user chose; `null` = not entered. `method` is absent when the rate predates it or none was entered. */
  readonly pulse?: { readonly rate: number | null; readonly rhythm: "regular" | "skips" | "irregular" | null; readonly method?: PulseMethod };
}

/** IndexedDB `drafts/current`: the in-progress assessment, persisted after every answer. JSON-serialisable (no Set/Map/undefined holes). */
export interface Draft {
  readonly id: string;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly subject: Partial<Omit<Subject, "birth">>;
  readonly profile: ProfileAnswers;
  readonly screening: Screening;
  readonly inquiry: InquiryProgress;
  readonly observe: ObserveProgress;
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
  readonly input: { readonly subject: Draft["subject"]; readonly profile: ProfileAnswers; readonly screening: Screening; readonly redFlags: readonly string[]; readonly findings: Draft["findings"]; readonly context: AssessContext; readonly constitutionAnswers?: Readonly<Record<string, number>>; readonly birth?: BirthInput; readonly observe?: ObserveProgress };
  readonly result: Assessment;
  readonly userNote?: string;
  readonly feedback?: Readonly<Record<string, "match" | "partial" | "no">>;
}

/** "persistent": answers are kept on this device. "memory": storage is blocked or failed — the app works but nothing survives a reload ("Not saved" chip). */
export type StorageStatus = "persistent" | "memory";

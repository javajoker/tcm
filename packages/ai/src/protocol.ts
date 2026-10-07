// The protocol between the app and its AI gateway, version 1 (Release F; docs/post-mvp/design/ai-assisted-intake.md §3).
// A turn sends the conversation, the app's own vocabulary in the session's language and the ids already confirmed — never a name, an identifier, birth data, the history or
// the profile's free text (docs/privacy.md §6 rule 7). A reply is data: proposed findings, each with the person's own words as evidence, the next question and a red-flag raise.
// The model never names a pattern, a herb or an amount (PD-23); the deterministic engine decides on what the person confirmed.

export const PROTOCOL = 1;

export type Lang = "zh-Hant" | "zh-Hans" | "en";
export const LANGS: readonly Lang[] = ["zh-Hant", "zh-Hans", "en"];

/** The modules of AI help, each with its own consent. Only the conversation is built (PM-47); the observation of the tongue and the face waits for its gates (PD-25, PM-50). */
export type Module = "conversation" | "tongue" | "face";
export const MODULES: readonly Module[] = ["conversation", "tongue", "face"];
export const BUILT_MODULES: readonly Module[] = ["conversation"];

/** A finding the app knows: its id, its label in the session's language, plain phrasings from the app's own questions, and its topic (the inquiry dimension). */
export interface VocabItem {
  readonly id: string;
  readonly label: string;
  readonly plain?: readonly string[];
  readonly topic: string;
}

/** One message of the conversation. The assistant's messages carry the topic their question was about, as the reply gave it. */
export interface Message {
  readonly role: "person" | "assistant";
  readonly text: string;
  readonly topic?: string;
}

export interface TurnRequest {
  readonly v: typeof PROTOCOL;
  readonly lang: Lang;
  readonly messages: readonly Message[];
  readonly vocabulary: readonly VocabItem[];
  readonly confirmed: readonly string[];
}

export type Severity = "light" | "moderate" | "severe";
export const SEVERITIES: readonly Severity[] = ["light", "moderate", "severe"];

/** A finding proposed from the person's words. It counts only once the person confirms it (FR-41). */
export interface Proposal {
  readonly id: string;
  readonly state: "present" | "absent";
  /** Only for `present`; absent means "not graded". */
  readonly severity?: Severity;
  readonly confidence: number;
  /** The person's own words that support it: a part of one of their messages. */
  readonly evidence: string;
}

export interface Question {
  readonly text: string;
  readonly topic?: string;
}

export interface TurnReply {
  readonly proposals: readonly Proposal[];
  /** The next question, or null: the model has none, or its question failed the wording rules. */
  readonly question: Question | null;
  /** The model thinks something the person said may be a red flag. It can raise the deterministic screening, never lower it. */
  readonly redFlag: boolean;
  /** The model has nothing more to ask. */
  readonly done: boolean;
}

/** Why part of a reply was dropped: codes only, never content. */
export type DropReason = "shape" | "extra" | "unknown-id" | "confirmed" | "duplicate" | "too-many" | "confidence" | "severity" | "no-evidence" | "wording" | "topic";

export interface TurnResponse {
  readonly v: typeof PROTOCOL;
  readonly reply: TurnReply;
  readonly dropped: readonly DropReason[];
  /** Turns left in the session after this one. */
  readonly turnsLeft: number;
}

export interface SessionResponse {
  readonly v: typeof PROTOCOL;
  readonly token: string;
  /** Milliseconds since the epoch. */
  readonly expiresAt: number;
  readonly turns: number;
}

export interface ConfigResponse {
  readonly v: typeof PROTOCOL;
  readonly modules: Readonly<Record<Module, boolean>>;
  readonly limits: Limits;
}

export type ErrorCode = "off" | "origin" | "method" | "not-found" | "too-large" | "bad-json" | "bad-request" | "token" | "expired" | "budget" | "rate" | "busy" | "provider" | "timeout" | "internal";

export interface ErrorResponse {
  readonly v: typeof PROTOCOL;
  readonly error: ErrorCode;
}

/** What one request and one reply may hold. The gateway refuses a larger request and drops what a reply holds beyond these. */
export interface Limits {
  readonly bodyBytes: number;
  readonly messages: number;
  readonly messageChars: number;
  readonly personChars: number;
  readonly vocabulary: number;
  readonly labelChars: number;
  readonly plainPerItem: number;
  readonly proposals: number;
  readonly evidenceChars: number;
  readonly questionChars: number;
}

export const LIMITS: Limits = {
  bodyBytes: 98_304,
  messages: 60,
  messageChars: 2_000,
  personChars: 12_000,
  vocabulary: 400,
  labelChars: 160,
  plainPerItem: 4,
  proposals: 12,
  evidenceChars: 200,
  questionChars: 300,
};

/** The wording rules of the assistant's questions, generated from scripts/i18n-wording.json and the knowledge base (scripts/i18n/ai_wording.py). */
export interface WordingData {
  readonly _meta: { readonly schema: number; readonly generated_by: string; readonly converter: string; readonly reuse: readonly string[]; readonly names: number };
  readonly rules: readonly { readonly id: string; readonly lang: Lang; readonly pattern: string }[];
  readonly names: Readonly<Record<Lang, readonly string[]>>;
  readonly excluded: readonly { readonly name: string; readonly in: string }[];
}

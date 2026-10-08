// The protocol between the app and its AI gateway, version 1 (Release F; docs/post-mvp/design/ai-assisted-intake.md §3).
// A turn sends the conversation, the app's own vocabulary in the session's language and the ids already confirmed — never a name, an identifier, birth data, the history or
// the profile's free text (docs/privacy.md §6 rule 7). A reply is data: proposed findings, each with the person's own words as evidence, the next question and a red-flag raise.
// The model never names a pattern, a herb or an amount (PD-23); the deterministic engine decides on what the person confirmed.

export const PROTOCOL = 1;

export type Lang = "zh-Hant" | "zh-Hans" | "en";
export const LANGS: readonly Lang[] = ["zh-Hant", "zh-Hans", "en"];

/**
 * The modules of AI help, each with its own consent. The conversation (PM-47) and the observation of the tongue and the face by photo (PM-50) are built; the observation exists in
 * the development profile only, until the tongue-photo spike's gates are met (PD-25).
 */
export type Module = "conversation" | "tongue" | "face";
export const MODULES: readonly Module[] = ["conversation", "tongue", "face"];
export const BUILT_MODULES: readonly Module[] = ["conversation", "tongue", "face"];

/** The modules that look at a photo. */
export type ObserveModule = Exclude<Module, "conversation">;
export const OBSERVE_MODULES: readonly ObserveModule[] = ["tongue", "face"];

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

/** A feature of the app's own lists a photo may be read for: the tongue's (`T_*`) or the complexion's and lips' (`S_FACE_*`, `S_LIPS_*`), with its label in the session's language and its group. */
export interface ObserveItem {
  readonly id: string;
  readonly label: string;
  /** body · shape · coat · special · zone-body · zone-coat for the tongue; complexion · lips for the face. */
  readonly group: string;
}

/** A photo as it crosses the gateway: a JPEG made on the device, base64 without the `data:` prefix (src/image.ts says what it may hold). */
export interface PhotoImage {
  readonly type: "image/jpeg";
  readonly data: string;
}

/**
 * One photo for one module (the route names the module). The vocabulary is the module's features in the session's language; `exclusive` are groups of ids of which at most one can be
 * true — the knowledge base's own exclusive groups, within the vocabulary. Never a name, an identifier, birth data, the history or the profile.
 */
export interface ObserveRequest {
  readonly v: typeof PROTOCOL;
  readonly lang: Lang;
  readonly module: ObserveModule;
  readonly image: PhotoImage;
  readonly vocabulary: readonly ObserveItem[];
  readonly exclusive: readonly (readonly string[])[];
}

/** What the app sends: the request without its module, which the route names (`/v1/observe/tongue`). The gateway puts the module back when it parses the body. */
export type ObserveBody = Omit<ObserveRequest, "module">;

/** A feature the model thinks it sees. There are no words to quote: the person looks at their own photo and confirms (or not) each one (FR-42). */
export interface Suggestion {
  readonly id: string;
  readonly confidence: number;
}

export interface ObserveReply {
  /** The model's own view: the photo shows what was asked (a tongue, a face) clearly enough to read. When false there are no suggestions. */
  readonly readable: boolean;
  readonly suggestions: readonly Suggestion[];
}

export interface ObserveResponse {
  readonly v: typeof PROTOCOL;
  readonly reply: ObserveReply;
  readonly dropped: readonly DropReason[];
  /** Photos left in the session after this one. */
  readonly observationsLeft: number;
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
export type DropReason = "shape" | "extra" | "unknown-id" | "confirmed" | "duplicate" | "too-many" | "confidence" | "severity" | "no-evidence" | "wording" | "topic" | "exclusive" | "unreadable";

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

export type ErrorCode = "off" | "origin" | "method" | "not-found" | "too-large" | "bad-json" | "bad-request" | "image" | "token" | "expired" | "budget" | "rate" | "busy" | "provider" | "timeout" | "internal";

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
  /** A photo's bytes (the JPEG, decoded) and the whole body of an observation request (the photo in base64 and the vocabulary). */
  readonly imageBytes: number;
  readonly observeBodyBytes: number;
  /** The shorter and the longer side of a photo, in pixels. */
  readonly imageMinSide: number;
  readonly imageMaxSide: number;
  /** Exclusive groups an observation request may carry. */
  readonly exclusiveGroups: number;
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
  imageBytes: 524_288,
  observeBodyBytes: 786_432,
  imageMinSide: 200,
  imageMaxSide: 2_048,
  exclusiveGroups: 32,
};

/** The wording rules of the assistant's questions, generated from scripts/i18n-wording.json and the knowledge base (scripts/i18n/ai_wording.py). */
export interface WordingData {
  readonly _meta: { readonly schema: number; readonly generated_by: string; readonly converter: string; readonly reuse: readonly string[]; readonly names: number };
  readonly rules: readonly { readonly id: string; readonly lang: Lang; readonly pattern: string }[];
  readonly names: Readonly<Record<Lang, readonly string[]>>;
  readonly excluded: readonly { readonly name: string; readonly in: string }[];
}

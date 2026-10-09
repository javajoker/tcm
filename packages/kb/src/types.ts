// Domain types of the knowledge base. The shapes of the data files are GENERATED from data/schema (see ./generated); this module gives the
// records readable names and defines the runtime view of the KB (tech spec §4.2).
import type { Citations } from "./generated/citations.ts";
import type { Cities } from "./generated/cities.ts";
import type { ConstitutionItems } from "./generated/constitution-items.ts";
import type { Constitutions } from "./generated/constitutions.ts";
import type { Correspondences } from "./generated/correspondences.ts";
import type { Emergency } from "./generated/emergency.ts";
import type { NameFold } from "./generated/name-fold.ts";
import type { Exclusions } from "./generated/exclusions.ts";
import type { Formulas } from "./generated/formulas.ts";
import type { Glossary } from "./generated/glossary.ts";
import type { Herbs } from "./generated/herbs.ts";
import type { Orientation } from "./generated/orientation.ts";
import type { PanelSchema } from "./generated/panel-schema.ts";
import type { PatternElements } from "./generated/pattern-elements.ts";
import type { Patterns } from "./generated/patterns.ts";
import type { Pulse } from "./generated/pulse.ts";
import type { Questions } from "./generated/questions.ts";
import type { RedFlags } from "./generated/red-flags.ts";
import type { SafetyRules } from "./generated/safety-rules.ts";
import type { Level, Notice, ScopeProfiles } from "./generated/scope-profiles.ts";
import type { ScoringParams } from "./generated/scoring-params.ts";
import type { Susceptibility } from "./generated/susceptibility.ts";
import type { Symptoms } from "./generated/symptoms.ts";
import type { Tongue } from "./generated/tongue.ts";
import type { TreatmentGuidance } from "./generated/treatment-guidance.ts";
import type { Yunqi } from "./generated/yunqi.ts";
import type { DoseBands } from "./generated/dose-bands.ts";
import type { Pairings } from "./generated/pairings.ts";
import type { Prescription } from "./generated/prescription.ts";
import type { Processing } from "./generated/processing.ts";
import type { Yinjing } from "./generated/yinjing.ts";
import type { Mechanisms } from "./generated/mechanisms.ts";
import type { Sanyin } from "./generated/sanyin.ts";

export type { Level, Notice };
export type ProfileName = "release" | "dev";
export type Lang = "zh-Hant" | "en";

// ── records ─────────────────────────────────────────────────────────────────
export type Symptom = Symptoms["items"][number];
export type Question = Questions["items"][number];
export type QuestionModule = Questions["modules"][number];
export type QuestionOption = Question["options"][number];
export type ExclusionGroup = Exclusions["groups"][number];
export type ExclusionSplit = Exclusions["splits"][number];
export type Pattern = Patterns["items"][number];
export type PatternElement = PatternElements["items"][number];
export type Constitution = Constitutions["items"][number];
export type RedFlag = RedFlags["items"][number];
export type Formula = Formulas["items"][number];
export type FormulaComposition = Formula["composition"][number];
export type FormulaModification = Formula["modifications"][number];
export type Herb = Herbs["items"][number];
export type Citation = Citations["items"][number];
export type City = Cities["items"][number];
export type GlossaryTerm = Glossary["items"][number];
export type EmergencyRegion = Emergency["regions"][number];
export type SafetyRule = SafetyRules["rules"][number];
export type ScopeProfile = ScopeProfiles["profiles"]["release"];
export type Bilingual = Herb["name"];
// the prescription model (PM-37): the herb's properties, the 七情 pairings, processing, dose bands and the parameters
export type HerbProps = Herb["props"];
export type Pairing = Pairings["items"][number];
export type ProcessingMethod = Processing["methods"][number];
export type DoseBand = DoseBands["items"][number];
export type PrescriptionParams = Prescription["params"];
export type YinjingChannel = Yinjing["channels"][number];
export type PatternMechanism = Mechanisms["items"][number];

export type { Citations, Cities, ConstitutionItems, Constitutions, Correspondences, Emergency, Exclusions, Formulas, Glossary, NameFold, Herbs, Orientation, PanelSchema, PatternElements, Patterns, Pulse, Questions, RedFlags, SafetyRules };
export type { ScopeProfiles, ScoringParams, Susceptibility, Symptoms, Tongue, TreatmentGuidance, Yunqi, DoseBands, Pairings, Prescription, Processing, Yinjing, Mechanisms, Sanyin };

// ── chunks (what the bundler writes and the loader reads; tech spec §5) ─────
/** The active application configuration: only the selected profile is present in a built bundle (tech spec T9). */
export interface ScopeConfig {
  readonly profileName: ProfileName;
  readonly profile: ScopeProfile;
  readonly levels: ScopeProfiles["levels"];
  readonly dimensions: ScopeProfiles["dimensions"];
  readonly noticeKinds: ScopeProfiles["notice_kinds"];
  readonly resolution: ScopeProfiles["resolution"];
}

export interface CoreChunk {
  readonly config: ScopeConfig;
  readonly symptoms: Symptoms;
  readonly questions: Questions;
  readonly exclusions: Exclusions;
  readonly orientation: Orientation;
  readonly patterns: Patterns;
  readonly elements: PatternElements;
  readonly constitutions: Constitutions;
  readonly redFlags: RedFlags;
  readonly tongue: Tongue;
  readonly pulse: Pulse;
  readonly panelSchema: PanelSchema;
  readonly params: ScoringParams;
  readonly safety: SafetyRules;
  readonly treatment: TreatmentCore;
  readonly wuxing: { readonly correspondences: Correspondences; readonly susceptibility: Susceptibility; readonly yunqi: Yunqi };
  readonly glossary: Glossary;
  readonly emergency: Emergency;
  /** The characters of the names an allergy can match that have another Simplified form (the safety rules fold both sides with it). */
  readonly nameFold: NameFold;
  readonly constitutionItems: ConstitutionItems;
}
/** What the engine needs of the treatment guidance: the core chunk carries it without the texts (the points' locations and cautions, the diet entries, the lifestyle lines are in the guidance chunk). */
export interface TreatmentCore {
  readonly _meta: TreatmentGuidance["_meta"];
  readonly acupoints: Readonly<Record<string, Pick<TreatmentGuidance["acupoints"][string], "code" | "meridian" | "pregnancy_avoid" | "status">>>;
  readonly food_pregnancy_caution: TreatmentGuidance["food_pregnancy_caution"];
  readonly general: TreatmentGuidance["general"];
}
/** The explanatory texts of the treatment guidance, loaded with the rest and merged into `kb.treatment` by the indexer. */
export interface GuidanceChunk {
  readonly acupoints: Readonly<Record<string, Pick<TreatmentGuidance["acupoints"][string], "location" | "cautions" | "basis">>>;
  readonly acupressure: TreatmentGuidance["acupressure"];
  readonly foods: TreatmentGuidance["foods"];
  readonly lifestyle: TreatmentGuidance["lifestyle"];
}
/** Display names of every herb the retained formulas use: always present, so a bundle without herb records can still name the herbs. */
export interface HerbName { readonly name: Bilingual; readonly latin: string | null }
export interface FormulasChunk { readonly items: readonly Formula[]; readonly herbNames: Readonly<Record<string, HerbName>> }
/** The tables of the prescription model (PM-37 … PM-40), filtered to the herbs of the bundle: they travel with the herb records, so a build without herb records has none. */
export interface PrescriptionChunk {
  readonly params: PrescriptionParams;
  readonly pairings: readonly Pairing[];
  readonly processing: readonly ProcessingMethod[];
  readonly doseBands: readonly DoseBand[];
  readonly yinjing: readonly YinjingChannel[];
  readonly sanyin: Sanyin;
}
export interface HerbsChunk { readonly items: readonly Herb[]; readonly prescription?: PrescriptionChunk }

// ── the reference for learners and practitioners (PM-53; docs/post-mvp/design/prescription-model.md §7.4) ──
/** A reader who declared, with an attestation, that they study Chinese medicine or practise it (PD-13, PD-14). A general reader has no role. */
export type Role = "learner" | "practitioner";
/**
 * What L3 reaches beyond the release profile — every tier, the amounts, the classical 加減, the herb records with the prescription tables, the dose references — in a file of its own,
 * fetched only for a learner or a practitioner, never with the general knowledge base. Part of the knowledge-base version: it changes what a role's result says.
 */
export interface ReferenceChunk {
  /** The release profile with each role's overlay: an adult's level raised and the study features on; every other cell, and the safety enforcement, the release profile's. */
  readonly roles: Readonly<Record<Role, ScopeProfile>>;
  readonly formulas: FormulasChunk;
  /** Each pattern's formulas for these roles (the general core lists only the formulas it carries). */
  readonly patternFormulas: Readonly<Record<string, readonly string[]>>;
  readonly herbs: HerbsChunk;
  readonly doseReferences: NonNullable<SafetyRules["dose_references"]>;
}
/** Where the reference comes from: the roles it serves (from the manifest, so a page knows them without a fetch) and the file, fetched and checked when first asked for. */
export interface ReferenceSource { readonly roles: readonly Role[]; load(): Promise<ReferenceChunk> }
export interface CitationsChunk { readonly items: readonly Citation[] }

// ── the herb browser (PM-24; docs/post-mvp/design/knowledge-browser.md §7) ──
// A compact browse index and detail shards, fetched only when someone browses herbs. They are NOT part of the knowledge-base version (they change nothing a result says) and never part of the
// per-session budget. The browser carries no dose and no herb weights: a page about a herb describes it, and a release must not show more than its bundle holds.
export type HerbStatus = Herb["status"];
export type HerbPregnancy = Herb["pregnancy"];
/**
 * One row of the browse index, as stored: slug, Chinese name, English name, Latin name, category (an index into `categories`), nature, flavours, channels, the first functions, flags (`HERB_FLAG` in herbs.ts),
 * pregnancy (an index into `HERB_PREGNANCY`) and status (an index into `HERB_STATUS`). The Chinese values are arrays of the data's own strings, never joined, so each one has its Simplified form.
 */
export type HerbRowTuple = readonly [string, string, string | null, string | null, number, readonly string[], readonly string[], readonly string[], readonly string[], number, number, number];
export interface HerbIndexChunk { readonly count: number; readonly categories: readonly string[]; readonly rows: readonly HerbRowTuple[] }
/** A herb as a list shows it. */
export interface HerbRow {
  /** The address of its page: the data's id without `herb-`. Stable and ASCII. */
  readonly slug: string;
  readonly name: Bilingual;
  readonly latin: string | null;
  readonly category: string;
  /** 四氣: 寒, 涼, 平, 溫, 熱 and the marked ones. */
  readonly nature: readonly string[];
  readonly flavors: readonly string[];
  readonly channels: readonly string[];
  /** The first three functions; `HerbDetail.functions` has them all. */
  readonly functions: readonly string[];
  readonly toxic: boolean;
  readonly hasCaution: boolean;
  readonly hasInteractions: boolean;
  readonly pregnancy: HerbPregnancy;
  readonly status: HerbStatus;
}
/** A herb's page, as a shard stores it: self-sufficient, so a page opened by its address needs one shard and not the index. */
export interface HerbDetail extends Omit<HerbRow, "hasCaution" | "hasInteractions"> {
  readonly functions: readonly string[];
  /** The Pharmacopoeia's caution text, as stored. */
  readonly caution: string | null;
  /** The stored interaction flags (`anticoagulant`, …), worded by the app. */
  readonly interactions: readonly string[];
  /** The classical formulas the source lists the herb in, by name (not all are formulas of this app). */
  readonly classicalFormulas: readonly string[];
  readonly aliases?: readonly string[];
  readonly source: { readonly book: string; readonly entry: string };
}
export interface HerbShardChunk { readonly shard: string; readonly items: Readonly<Record<string, HerbDetail>> }
/** Where the browser's chunks come from: fetched and hash-checked on demand, or in memory for tests and the dev server. */
export interface HerbBrowserSource {
  readonly count: number;
  index(): Promise<HerbIndexChunk>;
  /** One shard by its key ("0"…"f"); an empty shard is an empty one, not an error. */
  shard(key: string): Promise<HerbShardChunk>;
}
/** The herb browser as the app uses it. Everything is fetched on first use and then kept. */
export interface HerbBrowser {
  readonly count: number;
  rows(): Promise<readonly HerbRow[]>;
  /** The categories in the data's order. */
  categories(): Promise<readonly string[]>;
  /** One herb by its slug; `undefined` for an address that is not a herb of this bundle. */
  detail(slug: string): Promise<HerbDetail | undefined>;
}

/** The chunks of one knowledge-base version. `herbs` is null when the profile can never reach the levels that use herb records. */
export interface RawKbChunks {
  readonly version: string;
  readonly schemaVersion: number;
  readonly core: CoreChunk;
  readonly formulas: FormulasChunk;
  readonly herbs: HerbsChunk | null;
  readonly citations: CitationsChunk;
  readonly guidance: GuidanceChunk;
  /** The birth-place picker's city list (K-10): the same in every profile, and loaded only when the picker is opened — a function when it is fetched on demand. */
  readonly cities: Cities | (() => Promise<Cities>);
  /** The herb browser (PM-24): null when this build shows no herb page. */
  readonly herbBrowser: HerbBrowserSource | null;
  /** The learning book (PM-43): absent or null when this build carries none. */
  readonly book?: BookSource | null;
  /** The course (PM-60): absent or null when this build carries none. */
  readonly course?: CourseSource | null;
  /** The reference for learners and practitioners (PM-53): absent or null when this build serves no role — a public release before the reviews, and the development profile, which reaches L3 for everyone. */
  readonly reference?: ReferenceSource | null;
}

// ── the learning book (PM-42, PM-43) and the course (PM-60) ─────────────────
/**
 * A run of text: plain, strong, inline code, or a link to a page (`chapter` is its id; "" is the contents) — of the same work, or of the other work of the set when `work` says which
 * (the book links the course and the course the book; whoever shows the link checks that the build carries that work). A link to a document outside the set is kept as its text.
 */
export type BookSpan = string | { readonly strong: string } | { readonly code: string } | { readonly text: string; readonly chapter: string; readonly work?: "book" | "course" };
export type BookText = readonly BookSpan[];
/** A list item: its text, or its text and the bullets inside it (one level). */
export type BookItem = BookText | { readonly text: BookText; readonly items: readonly BookText[] };
/** A block of a page, in the order the page shows it. A heading is a section's (level 2) or a sub-section's (level 3). A quotation names its source as the text writes it and the verified citation it is part of. */
export type BookBlock =
  | { readonly kind: "heading"; readonly text: string; readonly level?: 3 }
  | { readonly kind: "paragraph"; readonly text: BookText }
  | { readonly kind: "quote"; readonly text: string; readonly source: string; readonly citation: string }
  | { readonly kind: "table"; readonly head: readonly BookText[]; readonly rows: readonly (readonly BookText[])[] }
  | { readonly kind: "list"; readonly ordered: boolean; /** The first number of a numbered list that does not start at 1. */ readonly start?: number; readonly items: readonly BookItem[] }
  | { readonly kind: "code"; readonly text: string };
export interface BookChapter { readonly id: string; readonly title: string; readonly blocks: readonly BookBlock[] }
/** The book as the bundler writes it: Traditional Chinese only, its contents page (the index of docs/book/zh-Hant) and its chapters in order. */
export interface BookChunk {
  readonly lang: "zh-Hant";
  /** `reviewed` once a review covers it (content review §3); a public build carries only a reviewed book. */
  readonly status: "draft" | "reviewed";
  readonly title: string;
  readonly contents: readonly BookBlock[];
  readonly chapters: readonly BookChapter[];
}
/** Where the book comes from: its chapter ids (from the manifest, so a page knows them without a fetch) and the file, fetched and checked when first asked for. */
export interface BookSource { readonly chapters: readonly string[]; load(): Promise<BookChunk> }
/** The book as the app reads it: the file is asked for once, again after a failure. */
export interface Book { readonly chapters: readonly string[]; get(): Promise<BookChunk> }

/** The course's index (PM-60): its contents page (the index of docs/course/zh-Hant) and the id and title of every page — the 22 chapters, then the answer key and the sources. */
export interface CourseIndexChunk {
  readonly lang: "zh-Hant";
  /** `reviewed` once a review covers every page (content review §3, §5); a public build carries only a reviewed course. */
  readonly status: "draft" | "reviewed";
  readonly title: string;
  readonly contents: readonly BookBlock[];
  readonly pages: readonly { readonly id: string; readonly title: string }[];
}
/** One page of the course, a file of its own: the course is too long to fetch at once. */
export interface CoursePageChunk { readonly lang: "zh-Hant"; readonly id: string; readonly title: string; readonly blocks: readonly BookBlock[] }
/** Where the course comes from: its page ids (from the manifest) and its files, each fetched and checked when first asked for. */
export interface CourseSource { readonly pages: readonly string[]; index(): Promise<CourseIndexChunk>; page(id: string): Promise<CoursePageChunk> }
/** The course as the app reads it: the index and each page asked for once, again after a failure. */
export interface Course { readonly pages: readonly string[]; index(): Promise<CourseIndexChunk>; page(id: string): Promise<CoursePageChunk> }

// ── manifest ────────────────────────────────────────────────────────────────
export interface ChunkRef { readonly file: string; readonly sha256: string; readonly bytes: number }
/** A Simplified display list (docs/post-mvp/design/simplified-chinese.md): `strings` lines and the SHA-256 (`digest`) of the sorted Traditional strings it is aligned to. */
export interface HansRef extends ChunkRef { readonly strings: number; readonly digest: string }
export interface Manifest {
  readonly schema: number;
  readonly version: string;
  readonly profile: ProfileName;
  readonly chunks: { readonly core: ChunkRef; readonly formulas: ChunkRef; readonly herbs?: ChunkRef; readonly citations: ChunkRef; readonly guidance: ChunkRef; readonly cities: ChunkRef };
  /** The herb browser's files (PM-24): absent when the build shows no herb page. Shards are keyed "0"…"f"; a key without a shard has no herb. */
  readonly herbBrowser?: { readonly count: number; readonly index: ChunkRef; readonly shards: Readonly<Record<string, ChunkRef>> };
  /** The learning book's file (PM-43), with its chapter ids: absent when the build carries no book. Traditional Chinese only, so it has no Simplified display list. */
  readonly book?: ChunkRef & { readonly chapters: readonly string[] };
  /** The course's files (PM-60): its index and one file per page, in order: absent when the build carries no course. Traditional Chinese only, never part of the knowledge-base version. */
  readonly course?: { readonly index: ChunkRef; readonly pages: readonly (ChunkRef & { readonly id: string })[] };
  /** The reference for learners and practitioners (PM-53), with the roles it serves: absent when the build serves none. Part of the knowledge-base version. */
  readonly reference?: ChunkRef & { readonly roles: readonly Role[] };
  /** Display lists for Simplified Chinese: one for the chunks loaded with the knowledge base, one for the lazy city list, and — with the herb browser — one for each of its files. The data itself is never converted. */
  readonly variants?: { readonly "zh-Hans"?: { readonly main: HansRef; readonly cities: HansRef; readonly herbs?: { readonly index: HansRef; readonly shards: Readonly<Record<string, HansRef>> }; readonly reference?: HansRef } };
}

// ── runtime view ────────────────────────────────────────────────────────────
export interface KnowledgeBase {
  readonly version: string;
  readonly profile: ProfileName;
  readonly schemaVersion: number;
  readonly config: ScopeConfig;
  readonly params: ScoringParams;

  readonly symptoms: ReadonlyMap<string, Symptom>;
  readonly questions: readonly Question[];
  readonly questionById: ReadonlyMap<string, Question>;
  readonly modules: readonly QuestionModule[];
  readonly exclusions: Exclusions;
  readonly orientation: Orientation;

  readonly patterns: readonly Pattern[];
  readonly patternById: ReadonlyMap<string, Pattern>;
  readonly elements: readonly PatternElement[];
  readonly elementById: ReadonlyMap<string, PatternElement>;
  readonly constitutions: readonly Constitution[];
  readonly redFlags: readonly RedFlag[];
  readonly tongue: Tongue;
  readonly pulse: Pulse;
  readonly panelSchema: PanelSchema;

  readonly formulas: ReadonlyMap<string, Formula>;
  /** Null when the profile cannot reach the levels that use herb records (release at L1). */
  readonly herbs: ReadonlyMap<string, Herb> | null;
  /** The prescription model's tables; null wherever there are no herb records (every public build today). */
  readonly prescription: PrescriptionChunk | null;
  /** Display name of any herb used by a formula of this bundle (works without herb records). */
  herbName(id: string): HerbName | undefined;

  readonly safety: SafetyRules;
  readonly treatment: TreatmentGuidance;
  readonly wuxing: CoreChunk["wuxing"];
  readonly glossary: readonly GlossaryTerm[];
  /** Emergency and crisis numbers by region (the safety policy §5); every build carries them. */
  readonly emergency: Emergency;
  /** A name in one script made comparable with the same name in the other (Traditional characters → their Simplified forms; the engine folds an allergy and a name with it before it compares them). */
  foldName(text: string): string;
  /** The own-written constitution questionnaire (K-08): items, scale and a description of each type. */
  readonly constitutionItems: ConstitutionItems;

  /** The city list of the birth-place picker, with its GeoNames attribution (fetched on first use, then kept). */
  cities(): Promise<Cities>;
  /** The herb pages (PM-24): null when this build shows none — a public release before any herb has been covered by the sample review. */
  readonly herbBrowser: HerbBrowser | null;
  /** The learning book (PM-43): null when this build carries none — a public release before the book has been reviewed. */
  readonly book: Book | null;
  /** The course (PM-60): null when this build carries none — a public release before the course has been reviewed. */
  readonly course: Course | null;
  citation(id: string): Citation | undefined;
  /** Every quotation of the bundle, in the data's order (the Learn pages list them). */
  readonly citations: readonly Citation[];
  /** zh-Hant term → glossary entry (first match). */
  term(zhHant: string): GlossaryTerm | undefined;
  /** The script the Chinese text is shown in: `Hans` only when the Simplified display list was loaded and verified, else `Hant` (the data's own script). */
  readonly script: "Hant" | "Hans";
  /** The reading role this view is for (PM-53): null for a general reader. */
  readonly role: Role | null;
  /** The roles this build can serve: none in a public release before the reviews, none in the development profile (it reaches L3 for everyone). */
  readonly roles: readonly Role[];
  /** This knowledge base for a learner or a practitioner: the reference fetched once, merged, and the profile with the role's overlay. Rejects where the build serves no role. */
  forRole(role: Role): Promise<KnowledgeBase>;
  /** The general reader's knowledge base: itself, or the one a role's view was made from. */
  general(): KnowledgeBase;
  /** A Chinese string of the data, for display: the identity in `Hant`, the Simplified form in `Hans`. Never use its result as an identifier. */
  zh(text: string): string;
  /** What a person typed or picked in the display script, as the strings of the data it can stand for (the data's own script: the string itself). Use it before text meets a rule that matches by name. */
  traditional(text: string): readonly string[];
}

// Domain types of the knowledge base. The shapes of the data files are GENERATED from data/schema (see ./generated); this module gives the
// records readable names and defines the runtime view of the KB (tech spec §4.2).
import type { Citations } from "./generated/citations.ts";
import type { Cities } from "./generated/cities.ts";
import type { ConstitutionItems } from "./generated/constitution-items.ts";
import type { Constitutions } from "./generated/constitutions.ts";
import type { Correspondences } from "./generated/correspondences.ts";
import type { Emergency } from "./generated/emergency.ts";
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

export type { Citations, Cities, ConstitutionItems, Constitutions, Correspondences, Emergency, Exclusions, Formulas, Glossary, Herbs, Orientation, PanelSchema, PatternElements, Patterns, Pulse, Questions, RedFlags, SafetyRules };
export type { ScopeProfiles, ScoringParams, Susceptibility, Symptoms, Tongue, TreatmentGuidance, Yunqi };

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
export interface HerbsChunk { readonly items: readonly Herb[] }
export interface CitationsChunk { readonly items: readonly Citation[] }

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
}

// ── manifest ────────────────────────────────────────────────────────────────
export interface ChunkRef { readonly file: string; readonly sha256: string; readonly bytes: number }
export interface Manifest {
  readonly schema: number;
  readonly version: string;
  readonly profile: ProfileName;
  readonly chunks: { readonly core: ChunkRef; readonly formulas: ChunkRef; readonly herbs?: ChunkRef; readonly citations: ChunkRef; readonly guidance: ChunkRef; readonly cities: ChunkRef };
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
  /** Display name of any herb used by a formula of this bundle (works without herb records). */
  herbName(id: string): HerbName | undefined;

  readonly safety: SafetyRules;
  readonly treatment: TreatmentGuidance;
  readonly wuxing: CoreChunk["wuxing"];
  readonly glossary: readonly GlossaryTerm[];
  /** Emergency and crisis numbers by region (the safety policy §5); every build carries them. */
  readonly emergency: Emergency;
  /** The own-written constitution questionnaire (K-08): items, scale and a description of each type. */
  readonly constitutionItems: ConstitutionItems;

  /** The city list of the birth-place picker, with its GeoNames attribution (fetched on first use, then kept). */
  cities(): Promise<Cities>;
  citation(id: string): Citation | undefined;
  /** zh-Hant term → glossary entry (first match). */
  term(zhHant: string): GlossaryTerm | undefined;
}

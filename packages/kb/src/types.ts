// Domain types of the knowledge base. The shapes of the data files are GENERATED from data/schema (see ./generated); this module gives the
// records readable names and defines the runtime view of the KB (tech spec §4.2).
import type { Citations } from "./generated/citations.ts";
import type { Constitutions } from "./generated/constitutions.ts";
import type { Correspondences } from "./generated/correspondences.ts";
import type { Exclusions } from "./generated/exclusions.ts";
import type { Formulas } from "./generated/formulas.ts";
import type { Glossary } from "./generated/glossary.ts";
import type { Herbs } from "./generated/herbs.ts";
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
export type GlossaryTerm = Glossary["items"][number];
export type SafetyRule = SafetyRules["rules"][number];
export type ScopeProfile = ScopeProfiles["profiles"]["release"];
export type Bilingual = Herb["name"];

export type { Citations, Constitutions, Correspondences, Exclusions, Formulas, Glossary, Herbs, PanelSchema, PatternElements, Patterns, Pulse, Questions, RedFlags, SafetyRules };
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
  readonly patterns: Patterns;
  readonly elements: PatternElements;
  readonly constitutions: Constitutions;
  readonly redFlags: RedFlags;
  readonly tongue: Tongue;
  readonly pulse: Pulse;
  readonly panelSchema: PanelSchema;
  readonly params: ScoringParams;
  readonly safety: SafetyRules;
  readonly treatment: TreatmentGuidance;
  readonly wuxing: { readonly correspondences: Correspondences; readonly susceptibility: Susceptibility; readonly yunqi: Yunqi };
  readonly glossary: Glossary;
}
export interface FormulasChunk { readonly items: readonly Formula[] }
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
}

// ── manifest ────────────────────────────────────────────────────────────────
export interface ChunkRef { readonly file: string; readonly sha256: string; readonly bytes: number }
export interface Manifest {
  readonly schema: number;
  readonly version: string;
  readonly profile: ProfileName;
  readonly chunks: { readonly core: ChunkRef; readonly formulas: ChunkRef; readonly herbs?: ChunkRef; readonly citations: ChunkRef };
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

  readonly safety: SafetyRules;
  readonly treatment: TreatmentGuidance;
  readonly wuxing: CoreChunk["wuxing"];
  readonly glossary: readonly GlossaryTerm[];

  citation(id: string): Citation | undefined;
  /** zh-Hant term → glossary entry (first match). */
  term(zhHant: string): GlossaryTerm | undefined;
}

// Public input/output types of the diagnosis engine (tech spec §7.1). The engine returns structured data and message keys, never prose.
import type { Level, Notice, ProfileName } from "@tcm/kb";
import type { BirthInput } from "@tcm/wuxing";

export type Sex = "female" | "male";
export type PregnancyStatus = "no" | "possible" | "yes" | "not-applicable";
export type MedicationClass =
  | "anticoagulant" | "antidiabetic" | "antihypertensive" | "diuretic" | "cardiac-glycoside" | "immunosuppressant" | "sedative" | "MAOI" | "stimulant" | "other";

export type ConditionKey =
  | "red_flag_A" | "red_flag_B" | "serious_chronic_disease" | "on_anticoagulant" | "on_other_interacting_medication" | "allergy_match" | "acute_external_symptoms";
export type PopulationKey = "adult" | "elderly_65_plus" | "minor_under_18" | "pregnant" | "lactating";
export type StateKey = "low_confidence" | "insufficient_information" | "conflicting_data";

/** Everything the scope policy needs to know (derived by `assess` from the subject, the red-flag answers and the findings). */
export interface PolicyFacts {
  readonly ageYears: number;
  readonly pregnant: boolean;
  readonly lactating: boolean;
  /** Ids of the red-flag items answered yes OR unsure (unsure counts as yes for A and B: SOP §2.2). */
  readonly redFlags: ReadonlySet<string>;
  readonly seriousChronic: boolean;
  readonly medications: readonly MedicationClass[];
  /** Set after the formulas are matched (step 11): a candidate contains a listed allergen. */
  readonly allergyMatch: boolean;
  readonly acuteExternal: boolean;
  readonly states: { readonly lowConfidence: boolean; readonly insufficientInformation: boolean; readonly conflictingData: boolean };
}

export type MatchedDimension = "population" | "condition" | "state";
export interface MatchedCell {
  readonly dimension: MatchedDimension;
  readonly key: string;
  readonly level: Level;
  readonly notice: Notice;
}

/** Notice ids of the safety policy catalogue (docs/safety-policy.md §4). */
export type NoticeId =
  | "N-A" | "N-B" | "N-MINOR" | "N-PREG" | "N-LACT" | "N-SERIOUS"
  | "N-ELDERLY" | "N-MED" | "N-ALLERGY" | "N-ACUTE" | "N-LOWCONF" | "N-CONFLICT";

export interface NoticeRequest {
  readonly id: NoticeId;
  readonly kind: "blocking_ack" | "inline";
  readonly cell: { readonly dimension: MatchedDimension; readonly key: string };
  /** Red-flag ids (for N-A / N-B / N-SERIOUS) or medication classes (N-MED) that caused the notice. */
  readonly reasons: readonly string[];
}

export interface PolicyFeatures {
  /** Tier-A formulas (and diet and acupoints, below) need at least L1. */
  readonly formulas: boolean;
  readonly tiers: readonly ("A" | "B" | "C")[];
  readonly dosage: boolean;
  readonly modification: boolean;
  readonly herbWeights: boolean;
  readonly acupoints: boolean;
  readonly diet: boolean;
}

export interface Policy {
  readonly profile: ProfileName;
  /** Effective level: the most restrictive of all matched cells. */
  readonly level: Level;
  /** Effective notice: the most severe of all matched cells. */
  readonly notice: Notice;
  readonly matched: readonly MatchedCell[];
  readonly features: PolicyFeatures;
  readonly safetyEnforcement: "suppress_hard" | "annotate_only";
  /** The flow ALWAYS continues after a notice (SOP §0.2 rule 3). */
  readonly flow: "continue";
  readonly emergencyResources: boolean;
  /** Notices to show, most severe first, one entry per cause; blocking ones need an acknowledgement. */
  readonly notices: readonly NoticeRequest[];
}

// ── findings ────────────────────────────────────────────────────────────────

export type Severity = "light" | "moderate" | "severe";
export type FindingState = "present" | "absent" | "unsure";
/** Data-quality class of a finding (SOP §4.7); decides the quality coefficient q. */
export type FindingSource = "inquiry" | "measured" | "guided" | "pulse";
export type PulsePosition = "L-cun" | "L-guan" | "L-chi" | "R-cun" | "R-guan" | "R-chi";

export interface Finding {
  readonly state: FindingState;
  /** Only for `present`; absent means "not graded" (factor `ungraded`). */
  readonly severity?: Severity;
  /** Defaults from the symptom-id prefix (T_ guided, P_ pulse, otherwise inquiry). */
  readonly source?: FindingSource;
  readonly position?: PulsePosition;
}
export type Findings = Readonly<Record<string, Finding>>;

/** Non-symptom answers of the inquiry (today only the onset duration, SOP §9.1). */
export interface AssessContext {
  readonly course?: "acute" | "subacute" | "chronic";
}

// ── subject ─────────────────────────────────────────────────────────────────

/** The person (SOP §3). Safety inputs are required; everything else is optional context. */
export interface Subject {
  readonly ageYears: number;
  readonly sex: Sex;
  readonly pregnancy: PregnancyStatus;
  readonly lactating: boolean;
  readonly medications: readonly MedicationClass[];
  /** Herb / food names the user is allergic to (free text, matched by name). */
  readonly allergies: readonly string[];
  /** One of the listed serious conditions (kidney failure, cirrhosis, cancer treatment, transplant, severe psychiatric or cardiopulmonary disease). */
  readonly seriousChronicDisease: boolean;
  /** Optional birth data (local only); used only when the birth blocks are enabled. */
  readonly birth?: BirthInput;
}

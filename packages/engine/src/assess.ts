// The one public entry point: the whole pipeline of the SOP (tech spec §7.1). Pure and deterministic: all inputs — the knowledge base, the
// person, the findings, the injected clock — are arguments; the result is plain data (structured trace and message keys, no prose).
import { DEFAULT_PROFILE_PARAMS, type BirthInput, type SeasonModel } from "@tcm/wuxing";
import type { KnowledgeBase } from "@tcm/kb";
import { explain, type TraceItem } from "./explain.ts";
import { normalize, type Conflict } from "./normalize.ts";
import { scoreConstitution, susceptibilityAt, type ConstitutionBlock } from "./constitution.ts";
import { checkConsistency, orient, type ConsistencyFlag, type Orientation } from "./orient.ts";
import type { PanelResult } from "./panel.ts";
import { synthesizePanel } from "./panel.ts";
import { scoreElements, scorePatterns, type ScoredElement, type ScoredPattern } from "./patterns.ts";
import { resolvePolicy, SERIOUS_RED_FLAGS } from "./policy.ts";
import { reconcile, type Verdict } from "./reconcile.ts";
import { recommend, type Recommendations } from "./recommend.ts";
import { buildReference, type ReferenceBlock, type SeasonBasis } from "./reference.ts";
import type { SuppressedItem } from "./safety.ts";
import type { AssessContext, Findings, NoticeId, Policy, PolicyFacts, Subject } from "./types.ts";

/** Bump on any behavioural change of the diagnosis maths or the output shape (saved reports record it). */
export const ENGINE_VERSION = "0.1.0";

export interface AssessInput {
  readonly subject: Subject;
  /** Red-flag items answered yes OR unsure (unsure counts as yes: safety policy §2.2). */
  readonly redFlags: ReadonlySet<string>;
  readonly findings: Findings;
  readonly context?: AssessContext;
  /** Answers of the constitution questionnaire (item id → 1…5); absent when the quiz was skipped. */
  readonly constitutionAnswers?: Readonly<Record<string, number>>;
  readonly options: {
    /** UTC milliseconds — injected; the engine never reads a clock. */
    readonly now: number;
    /** The user's opt-in for the birth-based blocks (release marks them opt-in). */
    readonly birthModule: boolean;
    readonly seasonModel?: SeasonModel;
    /** How the season is counted; absent = the northern calendar (nothing about the result differs from before the choice existed). */
    readonly seasons?: SeasonBasis;
  };
}

export interface Assessment {
  readonly meta: { readonly engineVersion: string; readonly kbVersion: string; readonly profile: string; readonly computedAt: number; readonly seasonModel: SeasonModel; readonly paramsFingerprint: string; /** Present only when the season was counted on another basis than the northern calendar: `south`, or `off` (no seasons). */ readonly seasons?: "south" | "off" };
  readonly policy: Policy;
  /** Notices that need an explicit acknowledgement before the result is shown (the flow then continues). */
  readonly requiredAcknowledgements: readonly NoticeId[];
  readonly quality: {
    readonly coverage: number;
    readonly kappa: number;
    readonly unansweredCore: readonly string[];
    readonly conflicts: readonly Conflict[];
    readonly unknownFindings: readonly string[];
    readonly unmatchedAllergies: readonly string[];
  };
  readonly reference: ReferenceBlock | null;
  readonly orientation: Orientation;
  /** The constitution tendency and the susceptibility to the season (SOP §7); `null` when the quiz was skipped. */
  readonly constitution: ConstitutionBlock | null;
  readonly consistency: readonly ConsistencyFlag[];
  /** All patterns, best first. */
  readonly patterns: readonly ScoredPattern[];
  readonly elements: readonly ScoredElement[];
  readonly panel: PanelResult;
  readonly verdict: Verdict;
  readonly recommendations: Recommendations;
  /** Everything removed or limited, with the reason; nothing disappears silently. */
  readonly suppressed: readonly SuppressedItem[];
  readonly trace: readonly TraceItem[];
}

/** FNV-1a over a canonical JSON string: lets a saved result say which parameters produced it. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

function factsOf(s: Subject, redFlags: ReadonlySet<string>, acuteExternal: boolean, allergyMatch: boolean, states: PolicyFacts["states"]): PolicyFacts {
  return {
    ageYears: s.ageYears, pregnant: s.pregnancy === "yes" || s.pregnancy === "possible", lactating: s.lactating, redFlags,
    seriousChronic: s.seriousChronicDisease || [...redFlags].some((id) => SERIOUS_RED_FLAGS.has(id)), medications: s.medications, allergyMatch, acuteExternal, states,
  };
}

export function assess(kb: KnowledgeBase, input: AssessInput): Assessment {
  const { subject } = input;

  // steps 3, 6: findings and the first impression (the external channel feeds the scope policy)
  const normalized = normalize(kb, { findings: input.findings, sex: subject.sex, pregnancy: subject.pregnancy, ...(input.context ? { context: input.context } : {}) });
  const orientation = orient(kb, normalized, input.context);
  const acuteExternal = orientation.channel === "external";

  // step 4: the reference panel (a prior: context only)
  const reference = buildReference(kb, { birth: (subject.birth ?? null) as BirthInput | null, birthModule: input.options.birthModule, now: input.options.now, ...(input.options.seasonModel ? { seasonModel: input.options.seasonModel } : {}), ...(input.options.seasons ? { seasons: input.options.seasons } : {}) });

  // steps 7–9: patterns, panel, verdict
  const patterns = scorePatterns(kb, normalized);
  const elements = scoreElements(kb, normalized);
  const panel = synthesizePanel(kb, patterns, reference ? reference.panel : null);
  const consistency = checkConsistency(kb, orientation, panel.bagang);
  const verdict = reconcile(kb, {
    patterns, elements, coverage: normalized.coverage, conflicts: normalized.conflicts, alignment: panel.alignment, present: normalized.present,
    answered: new Set([...normalized.present, ...normalized.absent]), ...(input.context?.course ? { course: input.context.course } : {}),
  });

  // step 5: the constitution tendency (never part of the score) and the susceptibility to the season
  const basis = reference !== null && input.options.seasons !== undefined && input.options.seasons !== "north" ? input.options.seasons : null;
  const seasonsOff = basis === "off";
  const constitutionResult = input.constitutionAnswers ? scoreConstitution(kb, input.constitutionAnswers) : null;
  const constitution: ConstitutionBlock | null = constitutionResult === null ? null : {
    result: constitutionResult,
    susceptibility: constitutionResult.primary === null ? null : {
      constitution: constitutionResult.primary,
      // with no seasons there is no season whose pathogenic qi a constitution could be prone to
      now: reference && !seasonsOff ? susceptibilityAt(kb, constitutionResult.primary, reference.panel) : null,
      upcoming: reference && !seasonsOff ? reference.forecast.map((p) => susceptibilityAt(kb, constitutionResult.primary!, p)) : [],
    },
  };

  // step 0 again with the states the engine found; steps 10–11 under that policy
  let policy = resolvePolicy(kb, factsOf(subject, input.redFlags, acuteExternal, false, verdict.states));
  const safetySubject = { ageYears: subject.ageYears, pregnant: subject.pregnancy === "yes" || subject.pregnancy === "possible", lactating: subject.lactating, medications: subject.medications, allergies: subject.allergies, constitution: constitutionResult?.primary ?? null };
  let rec = recommend(kb, { subject: safetySubject, policy, normalized, panel, verdict });
  if (rec.safety?.allergyMatch) {
    // an allergy match is itself a condition of the scope policy (notice, possibly a lower level); redo the recommendations if the level fell
    const again = resolvePolicy(kb, factsOf(subject, input.redFlags, acuteExternal, true, verdict.states));
    if (again.level !== policy.level) rec = recommend(kb, { subject: safetySubject, policy: again, normalized, panel, verdict });
    policy = again;
  }

  // step 12
  const trace = explain({
    kb, patterns, elements, verdict, panel, reference, conflicts: normalized.conflicts, consistency, formulas: rec.fits.filter((f) => rec.recommendations.formulas.some((r) => r.id === f.id) || rec.recommendations.studyOnly.some((r) => r.id === f.id)),
    modifications: rec.modifications, classical: rec.classical, safety: rec.safety,
  });

  return {
    meta: {
      engineVersion: ENGINE_VERSION, kbVersion: kb.version, profile: kb.config.profileName, computedAt: input.options.now,
      seasonModel: reference?.seasonModel ?? input.options.seasonModel ?? kb.config.profile.wuxing.season_model,
      // a basis other than the default, and the season model other than the default, are parameters of the result: each ends the stamp of the parameters and starts a series of its own in the history;
      // the defaults leave no trace. With no season block there is no season model to speak of.
      paramsFingerprint: fnv1a(JSON.stringify(kb.params)) + (reference ? `+${reference.wuxingParamsFingerprint}` : "")
        + (reference !== null && reference.enabled.season && reference.seasonModel !== DEFAULT_PROFILE_PARAMS.seasonModel ? `+${reference.seasonModel}` : "")
        + (basis === "south" ? "+south" : basis === "off" ? "+noseason" : ""),
      ...(basis !== null ? { seasons: basis } : {}),
    },
    policy,
    requiredAcknowledgements: policy.notices.filter((n) => n.kind === "blocking_ack").map((n) => n.id),
    quality: {
      coverage: normalized.coverage, kappa: verdict.confidenceInputs.kappa, unansweredCore: normalized.unansweredCore, conflicts: normalized.conflicts,
      unknownFindings: normalized.unknown, unmatchedAllergies: rec.safety?.unmatchedAllergies ?? [],
    },
    reference, orientation, constitution, consistency, patterns, elements, panel, verdict, recommendations: rec.recommendations,
    suppressed: rec.safety?.suppressed ?? [], trace,
  };
}

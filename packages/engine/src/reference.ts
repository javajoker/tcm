// Step 4: the personal reference panel N ("normal for me, now") from innate (birth), annual, yunqi and season blocks — an adapter over
// @tcm/wuxing (docs/wuxing-algorithm.md §9). Every block is capped, separately switchable and reported separately; a prior never enters
// the pattern scores and never reduces the primary offset (tech spec §7.3 rule 1, SOP §6.3).
import {
  buildBase, buildChart, buildReferencePanel, DEFAULT_PARAMS, DEFAULT_PROFILE_PARAMS, forecastReferencePanels, innateProfile, millisToJulianDay, paramsFingerprint,
  type BaseChart, type BirthInput, type InnateProfile, type Pillar, type ProfileParams, type ReferencePanel, type SeasonModel,
} from "@tcm/wuxing";
import type { KnowledgeBase } from "@tcm/kb";

/**
 * How the season is counted (docs/post-mvp/design/five-phase-extensions.md §4): by the northern calendar (the default), by the southern one — the season the person experiences — or not at all, for
 * the tropics where the four seasons are not the climate. Only the season changes; the birth chart and the annual and yunqi blocks are calendar constructs.
 */
export type SeasonBasis = "north" | "south" | "off";

export interface ReferenceInput {
  /** Birth data if the user entered it; null otherwise. */
  readonly birth: BirthInput | null;
  /** The user's opt-in for the birth blocks; only consulted when the profile marks them `opt_in` (release). */
  readonly birthModule: boolean;
  /** UTC milliseconds — injected, the engine never reads a clock. */
  readonly now: number;
  readonly seasonModel?: SeasonModel;
  /** The basis of the season; absent means the northern calendar, and a result made so is exactly what it was before the choice existed. */
  readonly seasons?: SeasonBasis;
  /** How many following seasons to forecast (default 4). */
  readonly forecastSeasons?: number;
}

export interface ReferenceBlock {
  readonly jdUT: number;
  readonly panel: ReferencePanel;
  readonly innate: InnateProfile | null;
  /** The panel now followed by the start of each coming season. */
  readonly forecast: readonly ReferencePanel[];
  readonly birth: {
    readonly requested: boolean;
    readonly used: boolean;
    /** Why the birth blocks were left out although requested (invalid input), else null. */
    readonly error: string | null;
    readonly warnings: readonly string[];
    readonly pillars: { readonly year: Pillar; readonly month: Pillar; readonly day: Pillar; readonly hour: Pillar | null } | null;
    readonly trueSolarTime: string | null;
  };
  readonly enabled: { readonly innate: boolean; readonly annualBazi: boolean; readonly yunqi: boolean; readonly season: boolean };
  readonly seasonModel: SeasonModel;
  readonly wuxingParamsFingerprint: string;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** The wuxing profile parameters for this knowledge-base profile and this user's choices. */
export function profileParamsFor(kb: KnowledgeBase, input: Pick<ReferenceInput, "birthModule" | "seasonModel" | "seasons">): ProfileParams {
  const w = kb.config.profile.wuxing;
  // `birthAvailable` is not consulted: with the block on but no birth data, the panel itself says the block is omitted
  const birthOn = (flag: boolean | "opt_in"): boolean => w.enabled && (flag === true || (flag === "opt_in" && input.birthModule));
  return {
    ...DEFAULT_PROFILE_PARAMS,
    seasonModel: input.seasonModel ?? w.season_model,
    // the basis is part of the parameters only when it is not the default: nothing of a northern result changes
    ...(input.seasons === "south" ? { hemisphere: "south" as const } : {}),
    enable: { innate: birthOn(w.bazi_innate), annualBazi: birthOn(w.bazi_annual), yunqi: w.enabled && w.yunqi, season: w.enabled && w.season && input.seasons !== "off" },
  };
}

/** Returns null when the five-phase module is switched off in the active profile. */
export function buildReference(kb: KnowledgeBase, input: ReferenceInput): ReferenceBlock | null {
  if (!kb.config.profile.wuxing.enabled) return null;
  const jdUT = millisToJulianDay(input.now);
  const requested = input.birth !== null;
  let params = profileParamsFor(kb, input);

  let base: BaseChart | null = null;
  let error: string | null = null;
  let warnings: readonly string[] = [];
  let pillars: ReferenceBlock["birth"]["pillars"] = null;
  let trueSolar: string | null = null;
  if (input.birth !== null && (params.enable.innate || params.enable.annualBazi)) {
    try {
      const chart = buildChart(input.birth);
      base = buildBase(chart);
      warnings = chart.warnings;
      pillars = { year: chart.year, month: chart.month, day: chart.day, hour: chart.hour };
      const t = chart.trueSolarCalendar;
      trueSolar = `${t.year}-${pad(t.month)}-${pad(t.day)} ${pad(t.hour)}:${pad(t.minute)}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      params = { ...params, enable: { ...params.enable, innate: false, annualBazi: false } };
    }
  }

  const panel = buildReferencePanel(base, jdUT, params);
  // with no seasons there is no "coming season" to list: the forecast is empty
  const forecast = input.seasons === "off" ? [] : forecastReferencePanels(base, jdUT, input.forecastSeasons ?? 4, params);
  return {
    jdUT, panel,
    innate: base && params.enable.innate ? innateProfile(base, params) : null,
    forecast,
    birth: { requested, used: base !== null, error, warnings, pillars, trueSolarTime: trueSolar },
    enabled: { ...params.enable, innate: params.enable.innate && base !== null, annualBazi: params.enable.annualBazi && base !== null },
    seasonModel: params.seasonModel, wuxingParamsFingerprint: paramsFingerprint(DEFAULT_PARAMS),
  };
}

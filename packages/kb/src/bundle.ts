// Profile-aware assembly of the knowledge-base chunks (tech spec §5.3, T9). PURE: the bundler script and the test-support read the
// files; this module decides what a profile can ever show and removes everything else, so a restricted build cannot leak restricted
// content even if the UI is bypassed. Doses, tier-C formulas, herb weights, internal provenance and the other profile never reach a
// bundle that cannot use them.
import type {
  Citations, Constitutions, Correspondences, Exclusions, Formula, Formulas, Glossary, Herb, Herbs, Level, PanelSchema, PatternElements, Patterns, ProfileName, Pulse, Questions,
  RawKbChunks, RedFlags, SafetyRules, ScopeConfig, ScopeProfile, ScopeProfiles, ScoringParams, Susceptibility, Symptoms, Tongue, TreatmentGuidance, Yunqi, FormulasChunk, HerbName,
} from "./types.ts";

/** The parsed contents of data/ (one field per data file). */
export interface DataFiles {
  readonly scope: ScopeProfiles;
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
  readonly correspondences: Correspondences;
  readonly susceptibility: Susceptibility;
  readonly yunqi: Yunqi;
  readonly glossary: Glossary;
  readonly formulas: Formulas;
  readonly herbs: Herbs;
  readonly citations: Citations;
}

export const LEVELS: readonly Level[] = ["L0", "L1", "L2", "L3"];
const rank = (l: Level): number => LEVELS.indexOf(l);
const NOTICE_RANK = { none: 0, inline: 1, blocking_ack: 2 } as const;

// ── what a profile can reach ────────────────────────────────────────────────

type Cell = { level: Level; notice: keyof typeof NOTICE_RANK };
const dimensionCells = (p: ScopeProfile): Cell[] => [...Object.values(p.population), ...Object.values(p.condition), ...Object.values(p.state)] as Cell[];

/** The highest output level any population / condition / state cell of the profile can produce. */
export function maxReachableLevel(profile: ScopeProfile): Level {
  return dimensionCells(profile).reduce<Level>((m, c) => (rank(c.level) > rank(m) ? c.level : m), "L0");
}

export interface Reach {
  readonly maxLevel: Level;
  readonly dosage: boolean;
  readonly tierB: boolean;
  readonly tierC: boolean;
  readonly modification: boolean;
  readonly herbWeights: boolean;
  /** Herb records (effects, harms, flags) are needed for modification suggestions and the herb-weight view. */
  readonly herbRecords: boolean;
}

/** Feature flags can only restrict what the level grid allows (SOP §0.2 rule 1). */
export function reachOf(profile: ScopeProfile): Reach {
  const maxLevel = maxReachableLevel(profile);
  const f = profile.features;
  const l2 = rank(maxLevel) >= rank("L2");
  const l3 = maxLevel === "L3";
  const modification = f.show_formula_modification && l2;
  const herbWeights = f.show_herb_weights && l2;
  return { maxLevel, dosage: f.show_dosage_reference && l3, tierB: l2, tierC: f.show_tier_c && l3, modification, herbWeights, herbRecords: modification || herbWeights };
}

// ── overrides (APP_OVERRIDES): may only restrict ────────────────────────────

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
const isObj = (v: unknown): v is { [k: string]: Json } => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Merge a build-time override over the selected profile. An override can only RESTRICT: lower a level, raise a notice, switch a feature
 * off, switch `annotate_only` to `suppress_hard`. Anything else throws, listing every violation (a static site cannot trust a loosening).
 */
export function applyOverrides(base: ScopeProfile, overrides: unknown): ScopeProfile {
  if (overrides === undefined || overrides === null) return base;
  const problems: string[] = [];
  if (!isObj(overrides)) throw new Error("overrides must be a JSON object");
  const next = structuredClone(base) as ScopeProfile & Record<string, Record<string, Cell> | unknown>;
  for (const [section, value] of Object.entries(overrides)) {
    if (section === "population" || section === "condition" || section === "state") {
      if (!isObj(value)) { problems.push(`${section} must be an object`); continue; }
      const cells = next[section] as Record<string, Cell>;
      for (const [key, patch] of Object.entries(value)) {
        const cur = cells[key];
        if (!cur || !isObj(patch)) { problems.push(`${section}.${key}: unknown cell`); continue; }
        if (patch.level !== undefined) {
          if (typeof patch.level !== "string" || !LEVELS.includes(patch.level as Level)) problems.push(`${section}.${key}.level: invalid level`);
          else if (rank(patch.level as Level) > rank(cur.level)) problems.push(`${section}.${key}.level: ${patch.level} would raise ${cur.level} (overrides may only restrict)`);
          else cur.level = patch.level as Level;
        }
        if (patch.notice !== undefined) {
          if (typeof patch.notice !== "string" || !(patch.notice in NOTICE_RANK)) problems.push(`${section}.${key}.notice: invalid notice`);
          else if (NOTICE_RANK[patch.notice as keyof typeof NOTICE_RANK] < NOTICE_RANK[cur.notice]) problems.push(`${section}.${key}.notice: ${patch.notice} would weaken ${cur.notice}`);
          else cur.notice = patch.notice as Cell["notice"];
        }
        for (const k of Object.keys(patch)) if (k !== "level" && k !== "notice") problems.push(`${section}.${key}.${k}: not overridable`);
      }
    } else if (section === "features") {
      if (!isObj(value)) { problems.push("features must be an object"); continue; }
      const features = next.features as unknown as Record<string, boolean>;
      for (const [key, on] of Object.entries(value)) {
        if (!(key in features) || typeof on !== "boolean") problems.push(`features.${key}: unknown feature or not a boolean`);
        else if (on && !features[key]) problems.push(`features.${key}: cannot be switched on (overrides may only restrict)`);
        else features[key] = on;
      }
    } else if (section === "safety_enforcement") {
      if (value !== "suppress_hard" && value !== "annotate_only") problems.push("safety_enforcement: invalid value");
      else if (value === "annotate_only" && base.safety_enforcement === "suppress_hard") problems.push("safety_enforcement: annotate_only would loosen suppress_hard");
      else next.safety_enforcement = value;
    } else {
      problems.push(`${section}: not overridable`);
    }
  }
  if (problems.length) throw new Error(`invalid overrides:\n - ${problems.join("\n - ")}`);
  return next;
}

// ── pruning ─────────────────────────────────────────────────────────────────

function pruneFormula(f: Formula, reach: Reach, keepInternals: boolean): Formula {
  const composition = f.composition.map((c) => {
    if (reach.dosage) return c;
    const { typical_g: _typical, classical_amount: _classical, ...rest } = c;
    return rest;
  });
  const modifications = !reach.modification ? [] : f.modifications.map((m) => {
    if (reach.dosage) return m;
    const strip = (xs: typeof m.add) => xs.map(({ typical_g: _t, ...h }) => h);
    return { ...m, add: strip(m.add), remove: strip(m.remove) };
  });
  const { kb_commit: _commit, ...withoutCommit } = f;
  const base = keepInternals ? f : withoutCommit;
  const source = keepInternals ? base.source : (({ repo_path: _p, ...s }) => s)(base.source);
  const verification = keepInternals ? base.verification : {
    ...base.verification,
    ...(base.verification.classical ? { classical: (({ path: _path, ...c }) => c)(base.verification.classical) } : {}),
    ...(base.verification.composition_check ? { composition_check: (({ book_path: _b, ...c }) => c)(base.verification.composition_check) } : {}),
  };
  return { ...base, source, verification, composition, modifications, classical_amounts: reach.dosage ? base.classical_amounts : null } as Formula;
}

export interface BuildOptions {
  readonly profile: ProfileName;
  /** Build-time override file contents (APP_OVERRIDES); may only restrict. */
  readonly overrides?: unknown;
  readonly version: string;
}

export interface BuildResult { readonly chunks: RawKbChunks; readonly reach: Reach; readonly profile: ScopeProfile }

/** Resolve the profile, prune what it cannot reach and return the chunks of one knowledge-base version. */
export function buildChunks(files: DataFiles, opts: BuildOptions): BuildResult {
  const profile = applyOverrides(files.scope.profiles[opts.profile], opts.overrides);
  const reach = reachOf(profile);
  const dev = opts.profile === "dev";

  const kept: Formula[] = files.formulas.items
    .filter((f) => f.tier === "A" || (f.tier === "B" && reach.tierB) || (f.tier === "C" && reach.tierC))
    .map((f) => pruneFormula(f, reach, dev));
  const keptIds = new Set(kept.map((f) => f.id));

  const herbById = new Map(files.herbs.items.map((h) => [h.id, h] as const));
  const herbNames: Record<string, HerbName> = {};
  for (const f of kept) {
    for (const c of f.composition) {
      const h = herbById.get(c.herb);
      if (!h) throw new Error(`formula ${f.id} uses unknown herb ${c.herb}`);
      herbNames[c.herb] = { name: h.name, latin: h.latin };
    }
  }
  // herb records: only the curated herbs (the formula herbs and the modification pool); the derived herbs are a knowledge-browser concern (P2)
  const herbs: Herb[] | null = reach.herbRecords ? files.herbs.items.filter((h) => h.status === "curated-draft") : null;

  const config: ScopeConfig = {
    profileName: opts.profile, profile, levels: files.scope.levels, dimensions: files.scope.dimensions, noticeKinds: files.scope.notice_kinds,
    // the resolution rules are code; the documentation strings (which name the dev-only enforcement mode) are not shipped
    resolution: { effective_level: files.scope.resolution.effective_level, effective_notice: files.scope.resolution.effective_notice, flow: files.scope.resolution.flow },
  };
  const safety: SafetyRules = reach.dosage ? files.safety : (({ dose_references: _d, ...s }) => s)(files.safety);
  const patterns: Patterns = { ...files.patterns, items: files.patterns.items.map((p) => ({ ...p, formulas: p.formulas.filter((id) => keptIds.has(id)) })) };
  const formulas: FormulasChunk = { items: kept, herbNames };

  const chunks: RawKbChunks = {
    version: opts.version,
    schemaVersion: files.params._meta.schema,
    core: {
      config, symptoms: files.symptoms, questions: files.questions, exclusions: files.exclusions, patterns, elements: files.elements, constitutions: files.constitutions,
      redFlags: files.redFlags, tongue: files.tongue, pulse: files.pulse, panelSchema: files.panelSchema, params: files.params, safety, treatment: files.treatment,
      wuxing: { correspondences: files.correspondences, susceptibility: files.susceptibility, yunqi: files.yunqi }, glossary: files.glossary,
    },
    formulas,
    herbs: herbs ? { items: herbs } : null,
    // the source-script quotation and the repository path are verification aids: dev only
    citations: dev ? files.citations : { ...files.citations, items: files.citations.items.map(({ source_path: _p, quote_source_zh_hans: _q, ...c }) => c) },
  };
  return { chunks, reach, profile };
}

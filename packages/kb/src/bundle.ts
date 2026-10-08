// Profile-aware assembly of the knowledge-base chunks (tech spec §5.3, T9). PURE: the bundler script and the test-support read the
// files; this module decides what a profile can ever show and removes everything else, so a restricted build cannot leak restricted
// content even if the UI is bypassed. Doses, tier-C formulas, herb weights, internal provenance and the other profile never reach a
// bundle that cannot use them.
import type {
  BookChunk, Citations, Cities, ConstitutionItems, Constitutions, Correspondences, DoseBands, Emergency, Exclusions, NameFold, Formula, Formulas, Glossary, Herb, Herbs, Level, Orientation, Pairings, PanelSchema, PatternElements, Patterns, Prescription, PrescriptionChunk, Processing, ProfileName, Pulse, Questions, Sanyin, Yinjing,
  RawKbChunks, RedFlags, ReferenceChunk, ReferenceSource, Role, SafetyRules, ScopeConfig, ScopeProfile, ScopeProfiles, ScoringParams, Susceptibility, Symptoms, Tongue, TreatmentGuidance, Yunqi, FormulasChunk, GuidanceChunk, HerbName, TreatmentCore,
} from "./types.ts";
import { memoryBook } from "./book.ts";
import { buildHerbBrowser, memorySource, type HerbBrowserChunks } from "./herbs.ts";

/** The parsed contents of data/ (one field per data file), and the learning book. */
export interface DataFiles {
  readonly scope: ScopeProfiles;
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
  readonly treatment: TreatmentGuidance;
  readonly correspondences: Correspondences;
  readonly susceptibility: Susceptibility;
  readonly yunqi: Yunqi;
  readonly glossary: Glossary;
  readonly emergency: Emergency;
  readonly nameFold: NameFold;
  readonly constitutionItems: ConstitutionItems;
  readonly formulas: Formulas;
  readonly herbs: Herbs;
  readonly citations: Citations;
  readonly cities: Cities;
  // the prescription model (PM-37 … PM-40): bundled with the herb records only
  readonly pairings: Pairings;
  readonly processing: Processing;
  readonly doseBands: DoseBands;
  readonly yinjing: Yinjing;
  readonly prescriptionParams: Prescription;
  readonly sanyin: Sanyin;
  /** The learning book (PM-42, PM-43), read from docs/book/zh-Hant by packages/kb/node/book.ts; absent where a caller has no use for it. */
  readonly book?: BookChunk | null;
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

/** Who reads with the study reference, from nobody to everybody (PD-30): an override may only move down this list. */
export const DOSE_DISPLAY: readonly ScopeProfile["dose_display"][] = ["off", "roles", "all"];

/**
 * Merge a build-time override over the selected profile. An override can only RESTRICT: lower a level, raise a notice, switch a feature
 * off, switch `annotate_only` to `suppress_hard`, narrow who reads with the study reference (`dose_display`). Anything else throws, listing every violation (a static site cannot trust a loosening).
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
    } else if (section === "dose_display") {
      if (typeof value !== "string" || !(DOSE_DISPLAY as readonly string[]).includes(value)) problems.push("dose_display: invalid value (off, roles or all)");
      else if (DOSE_DISPLAY.indexOf(value as ScopeProfile["dose_display"]) > DOSE_DISPLAY.indexOf(base.dose_display)) problems.push(`dose_display: ${value} would widen ${base.dose_display} (overrides may only restrict)`);
      else (next as { dose_display: string }).dose_display = value;
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

// ── roles (PM-53): may only raise an adult's level and switch the study features on ──

export const ROLES: readonly Role[] = ["learner", "practitioner"];
export type RoleOverlay = ScopeProfiles["roles"]["learner"];

/**
 * The release profile with a role's overlay (PD-13, PD-14): an adult's level (and an adult's over 65) raised, the study features switched on — nothing else, so minors, pregnancy,
 * breastfeeding, the red flags, serious chronic disease, the medicine and allergy conditions, the states and the safety enforcement stay as the release profile has them. The
 * build's overrides then apply as to the profile itself: they may only restrict. Throws on an overlay that would lower a level or switch a feature off.
 */
export function roleProfile(base: ScopeProfile, overlay: RoleOverlay, overrides?: unknown): ScopeProfile {
  const next = structuredClone(base) as ScopeProfile & { population: Record<string, Cell>; features: Record<string, boolean> };
  const problems: string[] = [];
  for (const [key, cell] of Object.entries(overlay.population) as [string, { level: Level }][]) {
    const cur = next.population[key];
    if (cur === undefined) problems.push(`population.${key}: unknown cell`);
    else if (rank(cell.level) < rank(cur.level)) problems.push(`population.${key}: ${cell.level} would lower ${cur.level} (a role only raises an adult's level)`);
    else cur.level = cell.level;
  }
  for (const [key, on] of Object.entries(overlay.features) as [string, boolean][]) {
    if (!(key in next.features) || on !== true) problems.push(`features.${key}: a role only switches a study feature on`);
    else next.features[key] = true;
  }
  if (problems.length) throw new Error(`invalid role overlay:\n - ${problems.join("\n - ")}`);
  return applyOverrides(next, overrides);
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
    ...(({ second_source: _second, ...v }) => v)(base.verification),
    ...(base.verification.classical ? { classical: (({ path: _path, ...c }) => c)(base.verification.classical) } : {}),
    ...(base.verification.composition_check ? { composition_check: (({ book_path: _b, ...c }) => c)(base.verification.composition_check) } : {}),
  };
  return { ...base, source, verification, composition, modifications, classical_amounts: reach.dosage ? base.classical_amounts : null } as Formula;
}

/** The formulas a reach keeps (pruned), the display names of their herbs, and — where the reach uses them — the herb records with the prescription tables. */
interface FormulaSet {
  readonly kept: readonly Formula[];
  readonly herbNames: Readonly<Record<string, HerbName>>;
  readonly herbs: readonly Herb[] | null;
  readonly prescription: PrescriptionChunk | null;
}

function formulaSet(files: DataFiles, reach: Reach, dev: boolean): FormulaSet {
  const kept: Formula[] = files.formulas.items
    .filter((f) => f.tier === "A" || (f.tier === "B" && reach.tierB) || (f.tier === "C" && reach.tierC))
    .map((f) => pruneFormula(f, reach, dev));
  const herbById = new Map(files.herbs.items.map((h) => [h.id, h] as const));
  const herbNames: Record<string, HerbName> = {};
  for (const f of kept) {
    for (const c of f.composition) {
      const h = herbById.get(c.herb);
      if (!h) throw new Error(`formula ${f.id} uses unknown herb ${c.herb}`);
      herbNames[c.herb] = { name: h.name, latin: h.latin };
    }
  }
  // herb records: only the curated herbs (the formula herbs and the modification pool); the derived herbs are a knowledge-browser concern (P2).
  // The rule ids behind each derived property (`props_rules`) are provenance for reviewers: dev only.
  const herbs: Herb[] | null = reach.herbRecords
    ? files.herbs.items.filter((h) => h.status === "curated-draft").map((h) => (dev ? h : ((({ props_rules: _rules, ...rest }) => rest)(h) as Herb)))
    : null;
  // the prescription model's tables, filtered to the herbs of the bundle: they go wherever the herb records go, and nowhere else
  const bundled = new Set((herbs ?? []).map((h) => h.id));
  const prescription: PrescriptionChunk | null = herbs ? {
    params: files.prescriptionParams.params,
    pairings: files.pairings.items.filter((p) => bundled.has(p.herb) && bundled.has(p.other)),
    processing: files.processing.methods,
    doseBands: files.doseBands.items.filter((b) => bundled.has(b.herb)),
    yinjing: files.yinjing.channels.map((c) => ({ ...c, herbs: c.herbs.filter((h) => bundled.has(h)) })),
    sanyin: files.sanyin,
  } : null;
  return { kept, herbNames, herbs, prescription };
}

/**
 * The reference for learners and practitioners (PM-53): what the role profile reaches beyond the release profile, in a file of its own. Only for a release build, and only where
 * L2 and L3 content may ship: with the draft label (the closed beta), or once every formula and herb record in it has been reviewed (content review §7) — none yet, so a public
 * release has no reference and serves no role. The development profile reaches L3 for everyone and needs none.
 */
export function buildReference(files: DataFiles, opts: Pick<BuildOptions, "profile" | "overrides" | "draftLabel">): ReferenceChunk | null {
  if (opts.profile !== "release") return null;
  const base = files.scope.profiles.release;
  if (applyOverrides(base, opts.overrides).dose_display === "off") return null;                // the build serves nobody the study reference (PD-30)
  const roles = { learner: roleProfile(base, files.scope.roles.learner, opts.overrides), practitioner: roleProfile(base, files.scope.roles.practitioner, opts.overrides) };
  const reach = reachOf(roles.learner);
  if (JSON.stringify(reach) !== JSON.stringify(reachOf(roles.practitioner))) throw new Error("the learner and the practitioner must reach the same content (one reference file serves both)");
  if (!reach.dosage) return null;                                                               // an override took the study content away: no role to serve
  const set = formulaSet(files, reach, false);
  // fail-safe: the herb records are the curated drafts, so until a reviewed curated herb can be told from a reviewed derived one, a public build ships no reference at all
  const reviewed = set.kept.every((f) => f.status === "reviewed") && (set.herbs ?? []).every((h) => h.status === "reviewed");
  if (opts.draftLabel !== true && !reviewed) return null;
  const keptIds = new Set(set.kept.map((f) => f.id));
  return {
    roles,
    formulas: { items: set.kept, herbNames: set.herbNames },
    patternFormulas: Object.fromEntries(files.patterns.items.map((p) => [p.id, p.formulas.filter((id) => keptIds.has(id))])),
    herbs: { items: set.herbs ?? [], ...(set.prescription ? { prescription: set.prescription } : {}) },
    doseReferences: files.safety.dose_references!,
  };
}

/** The reference held in memory (tests, the dev server): the same shape as the fetched file. */
export const memoryReference = (chunk: ReferenceChunk): ReferenceSource => ({ roles: ROLES, load: () => Promise.resolve(chunk) });

export interface BuildOptions {
  readonly profile: ProfileName;
  /** Build-time override file contents (APP_OVERRIDES); may only restrict. */
  readonly overrides?: unknown;
  readonly version: string;
  /**
   * The closed-beta draft label is on (APP_DRAFT_LABEL), so draft content may ship. Without it — a public build — only emergency-number rows that a regional owner has verified are bundled (and the
   * generic `OTHER`), because a wrong number is a safety incident (docs/post-mvp/design/tap-tempo-and-regions.md §2.4). The dev profile carries every row.
   */
  readonly draftLabel?: boolean;
}

export interface BuildResult {
  readonly chunks: RawKbChunks;
  readonly reach: Reach;
  readonly profile: ScopeProfile;
  /** What the bundler writes for the herb browser (PM-24); `chunks.herbBrowser` reads the same content from memory. Null when this build shows no herb page. */
  readonly herbFiles: HerbBrowserChunks | null;
  /** What the bundler writes for the learning book (PM-43); `chunks.book` reads the same from memory. Null when this build carries no book. */
  readonly bookFile: BookChunk | null;
  /** What the bundler writes for learners and practitioners (PM-53); `chunks.reference` reads the same from memory. Null when this build serves no role. */
  readonly referenceFile: ReferenceChunk | null;
}

/** Resolve the profile, prune what it cannot reach and return the chunks of one knowledge-base version. */
export function buildChunks(files: DataFiles, opts: BuildOptions): BuildResult {
  const profile = applyOverrides(files.scope.profiles[opts.profile], opts.overrides);
  const reach = reachOf(profile);
  const dev = opts.profile === "dev";

  const { kept, herbNames, herbs, prescription } = formulaSet(files, reach, dev);
  const keptIds = new Set(kept.map((f) => f.id));

  const config: ScopeConfig = {
    profileName: opts.profile, profile, levels: files.scope.levels, dimensions: files.scope.dimensions, noticeKinds: files.scope.notice_kinds,
    // the resolution rules are code; the documentation strings (which name the dev-only enforcement mode) are not shipped
    resolution: { effective_level: files.scope.resolution.effective_level, effective_notice: files.scope.resolution.effective_notice, flow: files.scope.resolution.flow },
  };
  // the treatment guidance is split: the engine's part stays in core, the explanatory texts travel in their own chunk
  const treatment: TreatmentCore = {
    _meta: files.treatment._meta, general: files.treatment.general, food_pregnancy_caution: files.treatment.food_pregnancy_caution,
    acupoints: Object.fromEntries(Object.entries(files.treatment.acupoints).map(([n, a]) => [n, { code: a.code, meridian: a.meridian, pregnancy_avoid: a.pregnancy_avoid, status: a.status }])),
  };
  const guidance: GuidanceChunk = {
    acupoints: Object.fromEntries(Object.entries(files.treatment.acupoints).map(([n, a]) => [n, { location: a.location, cautions: a.cautions, basis: a.basis }])),
    acupressure: files.treatment.acupressure, foods: files.treatment.foods, lifestyle: files.treatment.lifestyle,
  };
  const safety: SafetyRules = reach.dosage ? files.safety : (({ dose_references: _d, ...s }) => s)(files.safety);
  const patterns: Patterns = { ...files.patterns, items: files.patterns.items.map((p) => ({ ...p, formulas: p.formulas.filter((id) => keptIds.has(id)) })) };
  const formulas: FormulasChunk = { items: [...kept], herbNames };

  // the herb browser (PM-24): every herb in the dev profile and in the closed beta (draft label on, each page labelled as a draft); a public release only the herbs a sample review has covered —
  // none yet, so no herb file at all. It carries no dose and no herb weights whatever the profile, so a page can never show more than the bundle holds.
  const herbFiles = buildHerbBrowser(files.herbs.items, { all: dev || opts.draftLabel === true });

  // the learning book (PM-43): every build that labels its content a draft carries it; a public release only a reviewed book — none yet, so no book file at all
  const bookFile = files.book && (dev || opts.draftLabel === true || files.book.status === "reviewed") ? files.book : null;

  // the reference for learners and practitioners (PM-53): its own file, for a release build that may ship L2 and L3 content
  const referenceFile = buildReference(files, opts);

  const emergency: Emergency = dev || opts.draftLabel === true ? files.emergency : { ...files.emergency, regions: files.emergency.regions.filter((r) => r.id === "OTHER" || r.verification !== undefined) };

  const chunks: RawKbChunks = {
    version: opts.version,
    schemaVersion: files.params._meta.schema,
    core: {
      config, symptoms: files.symptoms, questions: files.questions, exclusions: files.exclusions, orientation: files.orientation, patterns, elements: files.elements, constitutions: files.constitutions,
      redFlags: files.redFlags, tongue: files.tongue, pulse: files.pulse, panelSchema: files.panelSchema, params: files.params, safety, treatment,
      wuxing: { correspondences: files.correspondences, susceptibility: files.susceptibility, yunqi: files.yunqi }, glossary: files.glossary, emergency, nameFold: files.nameFold, constitutionItems: files.constitutionItems,
    },
    formulas,
    guidance,
    cities: files.cities,
    herbs: herbs ? { items: [...herbs], ...(prescription ? { prescription } : {}) } : null,
    herbBrowser: herbFiles ? memorySource(herbFiles) : null,
    book: bookFile ? memoryBook(bookFile) : null,
    reference: referenceFile ? memoryReference(referenceFile) : null,
    // the source-script quotation and the repository path are verification aids: dev only
    citations: dev ? files.citations : { ...files.citations, items: files.citations.items.map(({ source_path: _p, quote_source_zh_hans: _q, ...c }) => c) },
  };
  return { chunks, reach, profile, herbFiles, bookFile, referenceFile };
}

// Golden cases (docs/test-plan.md §3.5): practitioner-agreed expectations for synthetic people, the yardstick of calibration. Pure and free of file access:
// this module defines the case format, checks one case against the engine, and aggregates concordance by split; loading `test/golden/G-*.json` and printing the report
// live in the test and in scripts/golden-report.ts. Import it as `@tcm/engine/golden` (it is not part of the engine's public surface for the app).
import type { BirthInput } from "@tcm/wuxing";
import type { KnowledgeBase } from "@tcm/kb";
import { assess, ENGINE_VERSION, type Assessment, type AssessInput } from "./assess.ts";
import type { AssessContext, Findings, Subject } from "./types.ts";

export const GOLDEN_FORMAT = 1;
export type Split = "tuning" | "held-out";
export type Sign = "+" | "-" | "0";
export type ConfidenceWord = "high" | "medium" | "low" | "insufficient";
export type Profile = "release" | "dev";

export interface PolicyExpect { readonly level?: string; readonly notice?: string; readonly notices?: readonly string[] }
export interface SuppressedExpect { readonly kind: string; readonly id: string; readonly reason: "rule" | "level"; readonly ruleId?: string }
export type Profiled<T> = { readonly [P in Profile]?: T };

/** JSON-serialisable input (no Sets). The clock is fixed so a case is reproducible; birth data only with `birth` (which switches the birth module on). */
export interface GoldenInput {
  readonly subject: Subject;
  readonly redFlags: readonly string[];
  readonly findings: Findings;
  readonly context?: AssessContext;
  readonly constitutionAnswers?: Readonly<Record<string, number>>;
  readonly birth?: BirthInput;
  readonly now?: number;
}

export interface GoldenExpect {
  readonly patterns?: { readonly first?: string; readonly top3?: readonly string[]; readonly mustNotInclude?: readonly string[] };
  readonly confidence?: ConfidenceWord;
  readonly policy?: Profiled<PolicyExpect>;
  readonly suppressed?: Profiled<readonly SuppressedExpect[]>;
  readonly formulas?: { readonly top3?: readonly string[]; readonly mustNotInclude?: readonly string[] };
  /** Panel dimension → the sign of the observed deviation ("+", "−"/"-", or "0" for within ±0.5). */
  readonly panelSigns?: Readonly<Record<string, Sign>>;
}

export interface GoldenCase {
  readonly id: string;
  readonly title: string;
  /** The review record of the practitioner who agreed the expectation, or "synthetic" for the infrastructure seed set (never counted as practitioner agreement). */
  readonly authoredBy: string;
  readonly split: Split;
  readonly notes?: string;
  readonly input: GoldenInput;
  readonly expect: GoldenExpect;
}

export interface GoldenConfig {
  /** Until M3 the suite reports and only structural problems fail the build; afterwards the policy fields block and the concordance targets are enforced. */
  readonly blocking: boolean;
  readonly targets: { readonly patternTop3: number; readonly formulaTop3: number; readonly policy: number; readonly minCases: number };
}

export const SIGN_THRESHOLD = 0.5;
export const signOf = (v: number): Sign => (v >= SIGN_THRESHOLD ? "+" : v <= -SIGN_THRESHOLD ? "-" : "0");
const NOW = Date.UTC(2026, 9, 4, 12);
const normalSign = (s: string): Sign => (s === "−" ? "-" : (s as Sign));

// ── structure ───────────────────────────────────────────────────────────────

/** Problems that make a case unusable (always fatal): wrong shape, unknown ids. */
export function validateCase(kb: KnowledgeBase, c: GoldenCase): string[] {
  const out: string[] = [];
  const need = (ok: boolean, msg: string): void => { if (!ok) out.push(`${c.id}: ${msg}`); };
  need(/^G-\d{4}$/.test(c.id), "the id must look like G-0001");
  need(c.title.trim().length > 0, "a title is needed");
  need(c.authoredBy.trim().length > 0, "authoredBy names the review record (or \"synthetic\")");
  need(c.split === "tuning" || c.split === "held-out", `split must be "tuning" or "held-out"`);
  need(typeof c.input?.subject === "object" && Array.isArray(c.input?.redFlags) && typeof c.input?.findings === "object", "input needs subject, redFlags and findings");
  for (const id of c.input?.redFlags ?? []) need(kb.redFlags.some((r) => r.id === id), `unknown red flag ${id}`);
  for (const id of Object.keys(c.input?.findings ?? {})) need(kb.symptoms.has(id), `unknown symptom ${id}`);
  const e = c.expect ?? {};
  need(Object.keys(e).length > 0, "expect is empty");
  for (const id of [e.patterns?.first, ...(e.patterns?.top3 ?? []), ...(e.patterns?.mustNotInclude ?? [])]) if (id !== undefined) need(kb.patternById.has(id), `unknown pattern ${id}`);
  if (e.patterns?.first !== undefined && e.patterns.top3 !== undefined) need(e.patterns.top3.includes(e.patterns.first), "patterns.first must be one of patterns.top3");
  for (const id of [...(e.formulas?.top3 ?? []), ...(e.formulas?.mustNotInclude ?? [])]) need(kb.formulas.has(id), `unknown formula ${id}`);
  for (const [dim, s] of Object.entries(e.panelSigns ?? {})) { need(["+", "-", "−", "0"].includes(s), `panelSigns ${dim}: "${s}" is not + - 0`); }
  return out;
}

// ── one case ────────────────────────────────────────────────────────────────

export interface Check { readonly name: string; readonly ok: boolean; readonly detail: string }
export interface CaseResult {
  readonly id: string;
  readonly split: Split;
  readonly authoredBy: string;
  readonly checks: readonly Check[];
  /** `null` when the case does not state that expectation. */
  readonly patternFirst: boolean | null;
  readonly patternTop3: boolean | null;
  readonly formulaTop3: boolean | null;
  readonly policy: boolean | null;
  /** The case's `mustNotInclude` lists were violated (pattern or formula). */
  readonly forbidden: boolean;
  readonly panelSigns: boolean | null;
  readonly confidence: boolean | null;
}

export function assessGolden(kb: KnowledgeBase, input: GoldenInput): Assessment {
  const ai: AssessInput = {
    subject: input.birth ? { ...input.subject, birth: input.birth } : input.subject, redFlags: new Set(input.redFlags), findings: input.findings,
    ...(input.context ? { context: input.context } : {}), ...(input.constitutionAnswers ? { constitutionAnswers: input.constitutionAnswers } : {}),
    options: { now: input.now ?? NOW, birthModule: input.birth !== undefined },
  };
  return assess(kb, ai);
}

/** The patterns the person would be shown (the verdict), best first. */
export const topPatterns = (a: Assessment): string[] => a.verdict.patterns.map((p) => p.id).slice(0, 3);
/** The formulas recommended, then those for study, in the engine's order. */
export const topFormulas = (a: Assessment): string[] => [...a.recommendations.formulas, ...a.recommendations.studyOnly].map((f) => f.id).slice(0, 3);

/** Checks one case. Patterns, formulas, panel and confidence are judged on the dev profile (the full engine); policy and suppressed per profile. */
export function evaluateCase(kbs: { readonly dev: KnowledgeBase; readonly release: KnowledgeBase }, c: GoldenCase): CaseResult {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string): boolean => { checks.push({ name, ok, detail }); return ok; };
  const e = c.expect;
  const a = assessGolden(kbs.dev, c.input);
  const patterns = topPatterns(a), formulas = topFormulas(a);

  const patternFirst = e.patterns?.first === undefined ? null : add("pattern first", patterns[0] === e.patterns.first, `expected ${e.patterns.first} first; got ${patterns.join(", ") || "none"}`);
  // the practitioner's pattern is in the engine's top three (PRD §11); with several acceptable patterns, one of them is
  const wanted = e.patterns?.first !== undefined ? [e.patterns.first] : e.patterns?.top3;
  const patternTop3 = wanted === undefined ? null : add("pattern top-3", wanted.some((p) => patterns.includes(p)), `expected ${wanted.join(" or ")} in the top three; got ${patterns.join(", ") || "none"}`);
  let forbidden = false;
  for (const p of e.patterns?.mustNotInclude ?? []) if (!add(`pattern ${p} excluded`, !patterns.includes(p), `${p} must not be among ${patterns.join(", ")}`)) forbidden = true;
  const formulaTop3 = e.formulas?.top3 === undefined ? null : add("formula top-3", e.formulas.top3.some((f) => formulas.includes(f)), `expected ${e.formulas.top3.join(" or ")} among ${formulas.join(", ") || "none"}`);
  for (const f of e.formulas?.mustNotInclude ?? []) if (!add(`formula ${f} excluded`, !formulas.includes(f), `${f} must not be among ${formulas.join(", ")}`)) forbidden = true;
  const confidence = e.confidence === undefined ? null : add("confidence", a.verdict.confidence === e.confidence, `expected ${e.confidence}; got ${a.verdict.confidence}`);

  let panelSigns: boolean | null = null;
  for (const [dim, want] of Object.entries(e.panelSigns ?? {})) {
    const got = signOf(a.panel.observed[dim] ?? 0);
    const ok = add(`panel ${dim}`, got === normalSign(want), `expected ${want}; got ${got} (${(a.panel.observed[dim] ?? 0).toFixed(2)})`);
    panelSigns = (panelSigns ?? true) && ok;
  }

  let policy: boolean | null = null;
  for (const profile of ["release", "dev"] as Profile[]) {
    const pe = e.policy?.[profile], se = e.suppressed?.[profile];
    if (pe === undefined && se === undefined) continue;
    const r = profile === "dev" ? a : assessGolden(kbs.release, c.input);
    const done = (ok: boolean): void => { policy = (policy ?? true) && ok; };
    if (pe?.level !== undefined) done(add(`${profile} level`, r.policy.level === pe.level, `expected ${pe.level}; got ${r.policy.level}`));
    if (pe?.notice !== undefined) done(add(`${profile} notice`, r.policy.notice === pe.notice, `expected ${pe.notice}; got ${r.policy.notice}`));
    if (pe?.notices !== undefined) { const got = r.policy.notices.map((n) => n.id); done(add(`${profile} notices`, got.length === pe.notices.length && got.every((x, i) => x === pe.notices![i]), `expected [${pe.notices}]; got [${got}]`)); }
    for (const s of se ?? []) done(add(`${profile} suppressed ${s.kind} ${s.id}`, r.suppressed.some((x) => x.kind === s.kind && x.id === s.id && x.reason === s.reason && (s.ruleId === undefined || x.ruleId === s.ruleId)), `${s.kind} ${s.id} (${s.reason}${s.ruleId ? " " + s.ruleId : ""}) should be listed; listed: ${r.suppressed.map((x) => `${x.kind}:${x.id}`).join(", ") || "nothing"}`));
  }
  return { id: c.id, split: c.split, authoredBy: c.authoredBy, checks, patternFirst, patternTop3, formulaTop3, policy, forbidden, panelSigns, confidence };
}

// ── the set ─────────────────────────────────────────────────────────────────

export interface Rate { readonly hit: number; readonly of: number; readonly rate: number | null }
export interface SplitSummary {
  readonly cases: number;
  readonly patternFirst: Rate; readonly patternTop3: Rate; readonly formulaTop3: Rate; readonly policy: Rate; readonly panelSigns: Rate; readonly confidence: Rate;
  readonly forbidden: number;
  /** Cases whose expectation was agreed by a practitioner (not "synthetic"). */
  readonly agreed: number;
}
export interface Summary { readonly all: SplitSummary; readonly tuning: SplitSummary; readonly heldOut: SplitSummary; readonly engineVersion: string }

const rate = (xs: readonly (boolean | null)[]): Rate => { const k = xs.filter((x): x is boolean => x !== null); const hit = k.filter(Boolean).length; return { hit, of: k.length, rate: k.length === 0 ? null : hit / k.length }; };
function summarizeSplit(rs: readonly CaseResult[]): SplitSummary {
  return {
    cases: rs.length, patternFirst: rate(rs.map((r) => r.patternFirst)), patternTop3: rate(rs.map((r) => r.patternTop3)), formulaTop3: rate(rs.map((r) => r.formulaTop3)),
    policy: rate(rs.map((r) => r.policy)), panelSigns: rate(rs.map((r) => r.panelSigns)), confidence: rate(rs.map((r) => r.confidence)),
    forbidden: rs.filter((r) => r.forbidden).length, agreed: rs.filter((r) => r.authoredBy !== "synthetic").length,
  };
}
export function summarize(results: readonly CaseResult[]): Summary {
  return { all: summarizeSplit(results), tuning: summarizeSplit(results.filter((r) => r.split === "tuning")), heldOut: summarizeSplit(results.filter((r) => r.split === "held-out")), engineVersion: ENGINE_VERSION };
}

/** The targets of the test plan, judged on the held-out half (concordance) and on all cases (policy and suppressed: 100 %). Returns the misses in words; empty = met. */
export function missedTargets(s: Summary, cfg: GoldenConfig): string[] {
  const out: string[] = [];
  const t = cfg.targets;
  if (s.all.cases < t.minCases) out.push(`${s.all.cases} cases; the target is at least ${t.minCases}`);
  const h = s.heldOut;
  if (h.patternTop3.rate !== null && h.patternTop3.rate < t.patternTop3) out.push(`held-out pattern top-3 concordance ${pct(h.patternTop3)} < ${t.patternTop3 * 100} %`);
  if (h.formulaTop3.rate !== null && h.formulaTop3.rate < t.formulaTop3) out.push(`held-out formula top-3 concordance ${pct(h.formulaTop3)} < ${t.formulaTop3 * 100} %`);
  if (s.all.policy.rate !== null && s.all.policy.rate < t.policy) out.push(`policy and suppressed expectations ${pct(s.all.policy)} < ${t.policy * 100} %`);
  if (s.all.forbidden > 0) out.push(`${s.all.forbidden} case(s) include a pattern or formula they must not`);
  if (s.all.agreed === 0) out.push("no case is agreed by a practitioner yet (all synthetic)");
  return out;
}
export const pct = (r: Rate): string => (r.rate === null ? "—" : `${(r.rate * 100).toFixed(0)} % (${r.hit}/${r.of})`);

/** A readable report. Per-case detail is given for the tuning half only: the held-out half is shown as numbers, so nobody tunes to it (test plan §3.5). */
export function formatReport(results: readonly CaseResult[], opts: { heldOutDetail?: boolean } = {}): string {
  const s = summarize(results);
  const line = (name: string, x: SplitSummary): string => `${name.padEnd(9)} ${String(x.cases).padStart(3)} cases | pattern first ${pct(x.patternFirst).padEnd(11)} top-3 ${pct(x.patternTop3).padEnd(11)} | formula top-3 ${pct(x.formulaTop3).padEnd(11)} | policy ${pct(x.policy).padEnd(11)} | panel ${pct(x.panelSigns).padEnd(11)} | confidence ${pct(x.confidence)}`;
  const lines = [`Golden cases (engine ${s.engineVersion}) — ${s.all.cases} cases, ${s.all.agreed} agreed by a practitioner`, line("tuning", s.tuning), line("held-out", s.heldOut), line("all", s.all)];
  for (const r of results) {
    if (r.split === "held-out" && !opts.heldOutDetail) continue;
    const bad = r.checks.filter((c) => !c.ok);
    if (bad.length > 0) lines.push(`  ✗ ${r.id} (${r.split}): ${bad.map((c) => `${c.name}: ${c.detail}`).join(" · ")}`);
  }
  return lines.join("\n");
}

// ── authoring: the dev inspector's "Case" export ────────────────────────────

/** A starting point for a new case from the person and the engine's result; the practitioner edits `expect`, picks the id and signs it with their record. */
export function goldenSkeleton(input: GoldenInput, a: Assessment, profile: Profile): GoldenCase {
  const top = topPatterns(a);
  return {
    id: "G-XXXX", title: "", authoredBy: "", split: "tuning", notes: "The expectations are what the engine produced: change them to what the practitioner agrees.",
    input,
    expect: {
      ...(top.length > 0 ? { patterns: { first: top[0]!, top3: top } } : {}),
      confidence: a.verdict.confidence as ConfidenceWord,
      policy: { [profile]: { level: a.policy.level, notice: a.policy.notice, notices: a.policy.notices.map((n) => n.id) } },
      ...(a.suppressed.length > 0 ? { suppressed: { [profile]: a.suppressed.map((s) => ({ kind: s.kind, id: s.id, reason: s.reason, ...(s.ruleId ? { ruleId: s.ruleId } : {}) })) } } : {}),
      formulas: { top3: topFormulas(a) },
      panelSigns: Object.fromEntries(Object.entries(a.panel.observed).map(([k, v]) => [k, signOf(v)])),
    },
  };
}

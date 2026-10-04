// The safety vignette suite (test plan §3.3, safety policy §9): `{ input, expect }` records in test/safety/*.json, run against the REAL knowledge base in both profiles.
// The expectations are written from the policy documents and the data tables (docs/safety-policy.md, data/safety/rules.json), never copied from an engine run; a failing vignette
// blocks the release. Inputs are synthetic. An `interview` input runs the adaptive inquiry for that pattern's typical patient (as the questionnaire tests do), so the person has the
// coverage a real one has and release can actually reach L1.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { KnowledgeBase } from "@tcm/kb";
import { assess, baselineFacts, evaluateSafety, nextQuestions, resolvePolicy } from "../src/index.ts";
import type { Assessment, AssessContext, Candidate, Findings, InquiryState, Subject } from "../src/index.ts";
import { PARITY } from "./parity.ts";

export type Profile = "release" | "dev";
export type ItemKind = "formula" | "study" | "food" | "acupoint";

/** What a vignette may demand of one profile's output. Every field is optional; a vignette states only what it is about. */
export interface Expect {
  level?: "L0" | "L1" | "L2" | "L3";
  notice?: "none" | "inline" | "blocking_ack";
  /** The notice ids in order, exactly. */
  notices?: string[];
  /** Notice id → the reasons it names (red-flag ids, medication classes). */
  reasons?: Record<string, string[]>;
  emergencyResources?: boolean;
  status?: "established" | "insufficient";
  /** Items shown (formula ids, food names, acupoint names) — each must be present / absent. */
  show?: string[];
  hide?: string[];
  /** No formula (tier A, or study-only) is shown. */
  noFormulas?: boolean;
  noFoods?: boolean;
  noAcupoints?: boolean;
  /** Every shown formula has one of these tiers. */
  onlyTiers?: string[];
  /** Shown items that must carry (at least) these rule ids as annotations / must not carry any of them. */
  annotated?: Record<string, string[]>;
  notAnnotated?: Record<string, string[]>;
  /** Items that must be listed in `suppressed` (kind / reason / rule). */
  suppressed?: { kind: string; id: string; reason: "rule" | "level"; ruleId?: string }[];
  noSuppressed?: boolean;
  /** Free-text allergens the knowledge base cannot name (N-ALLERGY-UNKNOWN). */
  unmatchedAllergies?: string[];
}
export interface Expectation { both?: Expect; release?: Expect; dev?: Expect }

interface Base { id: string; title: string; ref?: string; expect: Expectation }
export interface AssessVignette extends Base {
  kind?: "assess";
  input: { interview?: string; subject?: Partial<Subject>; redFlags?: string[]; findings?: Findings; context?: AssessContext };
}
/** Candidate items given straight to the safety filter (for what the engine only reaches through a pattern: the pregnancy points). */
export interface CandidateVignette extends Base {
  kind: "candidates";
  input: { subject?: { ageYears?: number; pregnant?: boolean; lactating?: boolean }; candidates: { kind: "acupoint" | "food"; name: string }[] };
}
export type Vignette = AssessVignette | CandidateVignette;

const dir = join(import.meta.dirname, "safety");
export const vignetteFiles = (): { file: string; vignettes: Vignette[] }[] =>
  readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((file) => ({ file, vignettes: (JSON.parse(readFileSync(join(dir, file), "utf8")) as { vignettes: Vignette[] }).vignettes }));

// ── the person ──────────────────────────────────────────────────────────────

/** What an interviewee with these symptoms answers: the question's selected symptoms present (moderate), its other symptoms absent. */
function answer(q: { options: readonly { symptoms: readonly string[] }[] }, patient: ReadonlySet<string>): Findings {
  const out: Record<string, { state: "present" | "absent"; severity?: "moderate" }> = {};
  for (const o of q.options) for (const s of o.symptoms) out[s] = patient.has(s) ? { state: "present", severity: "moderate" } : { state: "absent" };
  return out;
}

/** The findings of the adaptive inquiry for the typical patient of a pattern (a pattern id, e.g. "SP1"), run on the dev bank, which holds every question. */
export function interviewOf(kb: KnowledgeBase, patternId: string): { findings: Findings; sex: "female" | "male" } {
  const typical = PARITY.cases.find((c) => c.id === `typical-${patternId}`);
  if (!typical) throw new Error(`no typical patient for ${patternId}`);
  const patient = new Set(Object.keys(typical.findings).filter((s) => s.startsWith("S_")));
  const female = [...patient].some((s) => s.startsWith("S_MENSES") || ["S_DYSMENORRHEA", "S_LEUKORRHEA_YELLOW", "S_BREAST_DISTENSION"].includes(s));
  const sex = female ? "female" : "male";
  const state = (f: Findings): InquiryState => ({ sex, pregnancy: female ? "no" : "not-applicable", findings: f, modules: [], context: { course: "chronic" } });
  let findings: Findings = {};
  let r = nextQuestions(kb, state(findings), 1);
  for (let n = 0; r.done === null && r.suggestions[0] && n < 60; n++) {
    findings = { ...findings, ...answer(kb.questionById.get(r.suggestions[0].questionId)!, patient) };
    r = nextQuestions(kb, state(findings), 1);
  }
  return { findings, sex };
}

const NOW = Date.UTC(2026, 9, 4, 12);
const ADULT: Subject = { ageYears: 35, sex: "male", pregnancy: "not-applicable", lactating: false, medications: [], allergies: [], seriousChronicDisease: false };

// ── what the output shows ───────────────────────────────────────────────────

export interface View {
  level: string; notice: string; notices: { id: string; reasons: readonly string[] }[]; emergencyResources: boolean; flow: string; required: string[]; status: string | null;
  shown: { kind: ItemKind; id: string; tier: string | null; rules: string[] }[];
  suppressed: readonly { kind: string; id: string; reason: string; ruleId: string | null }[];
  unmatchedAllergies: readonly string[];
}

function viewOfAssessment(a: Assessment): View {
  const r = a.recommendations;
  const formula = (kind: ItemKind) => (f: (typeof r.formulas)[number]) => ({ kind, id: f.id, tier: f.tier, rules: f.annotations.map((x) => x.ruleId) });
  return {
    level: a.policy.level, notice: a.policy.notice, notices: a.policy.notices.map((n) => ({ id: n.id, reasons: n.reasons })), emergencyResources: a.policy.emergencyResources, flow: a.policy.flow,
    required: [...a.requiredAcknowledgements], status: a.verdict.status,
    shown: [
      ...r.formulas.map(formula("formula")), ...r.studyOnly.map(formula("study")),
      ...r.foods.map((x) => ({ kind: "food" as const, id: x.name, tier: null, rules: x.annotations.map((y) => y.ruleId) })),
      ...r.acupoints.map((x) => ({ kind: "acupoint" as const, id: x.name, tier: null, rules: x.annotations.map((y) => y.ruleId) })),
    ],
    suppressed: a.suppressed, unmatchedAllergies: a.quality.unmatchedAllergies,
  };
}

export function runVignette(kb: KnowledgeBase, v: Vignette): View {
  if (v.kind === "candidates") {
    const s = { ageYears: v.input.subject?.ageYears ?? 35, pregnant: v.input.subject?.pregnant ?? false, lactating: v.input.subject?.lactating ?? false, medications: [], allergies: [], constitution: null };
    const policy = resolvePolicy(kb, { ...baselineFacts(s.ageYears), pregnant: s.pregnant, lactating: s.lactating });
    const candidates: Candidate[] = v.input.candidates.map((c) => ({ kind: c.kind, name: c.name }));
    const report = evaluateSafety(kb, { subject: s, policy, bagang: { coldHeat: 0, deficiencyExcess: 0 }, candidates });
    return {
      level: policy.level, notice: policy.notice, notices: policy.notices.map((n) => ({ id: n.id, reasons: n.reasons })), emergencyResources: policy.emergencyResources, flow: policy.flow,
      required: policy.notices.filter((n) => n.kind === "blocking_ack").map((n) => n.id), status: null,
      shown: report.kept.map((i) => ({ kind: i.candidate.kind === "acupoint" ? "acupoint" as const : "food" as const, id: i.id, tier: null, rules: i.fired.map((f) => f.ruleId) })),
      suppressed: report.suppressed, unmatchedAllergies: report.unmatchedAllergies,
    };
  }
  const iv = v.input.interview ? interviewOf(kb, v.input.interview) : null;
  const subject: Subject = { ...ADULT, ...(iv ? { sex: iv.sex, pregnancy: iv.sex === "female" ? "no" as const : "not-applicable" as const } : {}), ...v.input.subject };
  const findings: Findings = { ...(iv?.findings ?? {}), ...(v.input.findings ?? {}) };
  const a = assess(kb, { subject, redFlags: new Set(v.input.redFlags ?? []), findings, context: v.input.context ?? { course: "chronic" }, options: { now: NOW, birthModule: false } });
  return viewOfAssessment(a);
}

// ── the check ───────────────────────────────────────────────────────────────

const same = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** The differences between what the output does and what the vignette demands, in words; empty = pass. Also checks the invariants of every output. */
export function check(view: View, e: Expect): string[] {
  const out: string[] = [];
  const need = (ok: boolean, msg: string): void => { if (!ok) out.push(msg); };
  // invariants of every output (safety policy §2, §6.3)
  need(view.flow === "continue", `the flow is "${view.flow}", not "continue"`);
  need(same(view.required, view.notices.filter((n) => n.id === "N-A" || n.id === "N-B" || n.id === "N-MINOR" || n.id === "N-PREG" || n.id === "N-LACT" || n.id === "N-SERIOUS").map((n) => n.id)), `the notices that need an acknowledgement (${view.required}) are not the blocking ones`);
  for (const s of view.shown) need(!view.suppressed.some((x) => x.id === s.id && (x.kind === s.kind || (x.kind === "formula" && s.kind === "study"))), `${s.id} is both shown and listed as suppressed`);
  for (const s of view.suppressed) need((s.reason === "rule") === (s.ruleId !== null), `suppressed ${s.id}: reason ${s.reason} with rule ${s.ruleId}`);

  if (e.level !== undefined) need(view.level === e.level, `level ${view.level}, expected ${e.level}`);
  if (e.notice !== undefined) need(view.notice === e.notice, `notice ${view.notice}, expected ${e.notice}`);
  if (e.notices !== undefined) need(same(view.notices.map((n) => n.id), e.notices), `notices [${view.notices.map((n) => n.id)}], expected [${e.notices}]`);
  for (const [id, reasons] of Object.entries(e.reasons ?? {})) {
    const got = view.notices.find((n) => n.id === id)?.reasons ?? null;
    need(got !== null && same([...got].sort(), [...reasons].sort()), `reasons of ${id}: [${got ?? "—"}], expected [${reasons}]`);
  }
  if (e.emergencyResources !== undefined) need(view.emergencyResources === e.emergencyResources, `emergency resources ${view.emergencyResources}, expected ${e.emergencyResources}`);
  if (e.status !== undefined) need(view.status === e.status, `verdict ${view.status}, expected ${e.status}`);
  const ids = (kinds?: ItemKind[]): string[] => view.shown.filter((s) => kinds === undefined || kinds.includes(s.kind)).map((s) => s.id);
  for (const id of e.show ?? []) need(ids().includes(id), `${id} should be shown (shown: ${ids()})`);
  for (const id of e.hide ?? []) need(!ids().includes(id), `${id} must not be shown`);
  if (e.noFormulas) need(ids(["formula", "study"]).length === 0, `formulas shown: ${ids(["formula", "study"])}`);
  if (e.noFoods) need(ids(["food"]).length === 0, `foods shown: ${ids(["food"])}`);
  if (e.noAcupoints) need(ids(["acupoint"]).length === 0, `acupoints shown: ${ids(["acupoint"])}`);
  if (e.onlyTiers) for (const s of view.shown.filter((x) => x.tier !== null)) need(e.onlyTiers.includes(s.tier!), `${s.id} is tier ${s.tier}; only ${e.onlyTiers} allowed`);
  for (const [id, rules] of Object.entries(e.annotated ?? {})) {
    const item = view.shown.find((s) => s.id === id);
    need(item !== undefined && rules.every((r) => item.rules.includes(r)), `annotations of ${id}: [${item?.rules ?? "not shown"}], expected to include [${rules}]`);
  }
  for (const [id, rules] of Object.entries(e.notAnnotated ?? {})) {
    const item = view.shown.find((s) => s.id === id);
    need(item === undefined || !rules.some((r) => item.rules.includes(r)), `${id} must not carry [${rules}] but carries [${item?.rules}]`);
  }
  for (const s of e.suppressed ?? []) need(view.suppressed.some((x) => x.id === s.id && x.kind === s.kind && x.reason === s.reason && (s.ruleId === undefined || x.ruleId === s.ruleId)), `${s.kind} ${s.id} should be suppressed (${s.reason}${s.ruleId ? " " + s.ruleId : ""}); suppressed: ${view.suppressed.map((x) => `${x.kind}:${x.id}:${x.ruleId ?? x.reason}`)}`);
  if (e.noSuppressed) need(view.suppressed.length === 0, `nothing should be suppressed; suppressed: ${view.suppressed.map((x) => `${x.kind}:${x.id}`)}`);
  if (e.unmatchedAllergies) need(same([...view.unmatchedAllergies].sort(), [...e.unmatchedAllergies].sort()), `unmatched allergens [${view.unmatchedAllergies}], expected [${e.unmatchedAllergies}]`);
  return out;
}

export const expectFor = (v: Vignette, profile: Profile): Expect => ({ ...v.expect.both, ...v.expect[profile] });

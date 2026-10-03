// Step 3: standardise the findings (SOP §5): drop unknown ids, attach the severity factor and the data-quality coefficient,
// report contradictions (never resolve them silently), and measure how much of the core inquiry was actually answered.
import type { KnowledgeBase, Question } from "@tcm/kb";
import type { AssessContext, FindingSource, Findings, FindingState, PregnancyStatus, Severity, Sex } from "./types.ts";

export interface NormalizedFinding {
  readonly id: string;
  readonly state: FindingState;
  readonly severity: Severity | null;
  readonly source: FindingSource;
  /** Severity factor sev(s) of a present finding (SOP §9.2); 0 for absent / unsure. */
  readonly sev: number;
  /** Data-quality coefficient q(s) (SOP §4.7). */
  readonly q: number;
}

export interface Conflict {
  readonly kind: "exclusive" | "conflict";
  readonly group: string;
  /** The symptoms of the group that are all present. */
  readonly symptoms: readonly string[];
}

export interface Normalized {
  /** Known symptom ids only, in id order. */
  readonly findings: ReadonlyMap<string, NormalizedFinding>;
  readonly present: ReadonlySet<string>;
  readonly absent: ReadonlySet<string>;
  readonly unsure: ReadonlySet<string>;
  /** Finding ids that are not in the symptom registry (reported, never scored). */
  readonly unknown: readonly string[];
  readonly conflicts: readonly Conflict[];
  /** Share of the applicable core questions that were answered (an answer = at least one present or absent symptom, or the onset context). */
  readonly coverage: number;
  readonly applicableCore: readonly string[];
  readonly unansweredCore: readonly string[];
}

export interface NormalizeInput {
  readonly findings: Findings;
  readonly sex: Sex;
  readonly pregnancy: PregnancyStatus;
  readonly context?: AssessContext;
}

export function qualityOf(kb: KnowledgeBase, symptomId: string, source: FindingSource | undefined): number {
  const q = kb.params.quality;
  const src = source ?? Object.entries(q.by_prefix).find(([prefix]) => symptomId.startsWith(prefix))?.[1] ?? q.default_source;
  return q.by_source[src as FindingSource];
}

export function sourceOf(kb: KnowledgeBase, symptomId: string, source: FindingSource | undefined): FindingSource {
  if (source) return source;
  const q = kb.params.quality;
  return (Object.entries(q.by_prefix).find(([prefix]) => symptomId.startsWith(prefix))?.[1] ?? q.default_source) as FindingSource;
}

/** Is the question asked to this person (SOP §4.8: sex and pregnancy prerequisites)? Follow-up triggers are the engine's questionnaire's job. */
export function applies(q: Question, sex: Sex, pregnancy: PregnancyStatus): boolean {
  const r = q.requires;
  if (!r) return true;
  if (r.sex && r.sex !== sex) return false;
  if (r.pregnancy === "not_pregnant" && (pregnancy === "yes" || pregnancy === "possible")) return false;
  return true;
}

export function normalize(kb: KnowledgeBase, input: NormalizeInput): Normalized {
  const sev = kb.params.severity;
  const findings = new Map<string, NormalizedFinding>();
  const present = new Set<string>(), absent = new Set<string>(), unsure = new Set<string>();
  const unknown: string[] = [];

  for (const id of Object.keys(input.findings).sort()) {
    const f = input.findings[id]!;
    if (!kb.symptoms.has(id)) { unknown.push(id); continue; }
    const source = sourceOf(kb, id, f.source);
    const isPresent = f.state === "present";
    findings.set(id, {
      id, state: f.state, severity: isPresent ? f.severity ?? null : null,
      source, sev: isPresent ? sev[f.severity ?? "ungraded"] : 0, q: qualityOf(kb, id, f.source),
    });
    (f.state === "present" ? present : f.state === "absent" ? absent : unsure).add(id);
  }

  const conflicts: Conflict[] = [];
  for (const g of kb.exclusions.groups) {
    const hit = g.symptoms.filter((s) => present.has(s));
    if (hit.length >= 2) conflicts.push({ kind: g.kind, group: g.id, symptoms: hit });
  }

  const core = kb.questions.filter((q) => q.core && applies(q, input.sex, input.pregnancy));
  const unanswered: string[] = [];
  for (const q of core) {
    const answered = q.options.some((o) => o.context ? input.context?.course !== undefined : o.symptoms.some((s) => present.has(s) || absent.has(s)));
    if (!answered) unanswered.push(q.id);
  }
  return {
    findings, present, absent, unsure, unknown, conflicts,
    coverage: core.length ? (core.length - unanswered.length) / core.length : 1,
    applicableCore: core.map((q) => q.id),
    unansweredCore: unanswered,
  };
}

// The pure part of S06/S07 (UX spec §4.4): how an answer becomes findings, which question comes next, which contradictions need a follow-up.
// Binding answer semantics (docs/kb-schema.md §3.2b): answering records the selected options' symptoms as present (graded ones with a severity) and
// the unselected options' symptoms as absent; skipping records every symptom of the question as unsure.
import { nextQuestions, normalize, type Conflict, type Finding, type InquiryState, type NextQuestions, type QuestionSuggestion, type Severity } from "@tcm/engine";
import type { KnowledgeBase, Question, QuestionModule } from "@tcm/kb";
import type { Draft } from "../../storage/types.ts";
import { subjectOf } from "../profile/model.ts";

export type Answer =
  | { readonly kind: "answered"; readonly options: readonly string[]; readonly severities: Readonly<Record<string, Severity>> }
  | { readonly kind: "skipped" };

export const DEFAULT_SEVERITY: Severity = "moderate";

const symptomsOf = (q: Question): string[] => [...new Set(q.options.flatMap((o) => o.symptoms))];

/** Record an answer in the draft (findings, context, history). The latest answer to a symptom wins. */
export function applyAnswer(d: Draft, q: Question, a: Answer): Draft {
  const findings: Record<string, Finding> = { ...d.findings };
  const withSource = (f: Finding): Finding => (q.source === "guided" ? { ...f, source: "guided" } : f);
  let context = d.context;
  if (a.kind === "skipped") {
    for (const s of symptomsOf(q)) findings[s] = withSource({ state: "unsure" });
  } else {
    const chosen = new Set(a.options);
    for (const o of q.options) {
      if (o.context) { if (chosen.has(o.id)) context = { ...context, course: o.context.course }; continue; }
      const on = chosen.has(o.id) && !o.none;
      for (const s of o.symptoms) {
        if (!on) { findings[s] = withSource({ state: "absent" }); continue; }
        const severity = q.graded.includes(s) ? (a.severities[s] ?? DEFAULT_SEVERITY) : undefined;
        findings[s] = withSource(severity === undefined ? { state: "present" } : { state: "present", severity });
      }
    }
  }
  const history = d.inquiry.history.includes(q.id) ? d.inquiry.history : [...d.inquiry.history, q.id];
  return { ...d, findings, context, inquiry: { ...d.inquiry, history } };
}

/** What the user answered before, reconstructed from the findings (for Back / edit); `null` = not answered yet. */
export function selectionOf(d: Draft, q: Question): Answer | null {
  if (!d.inquiry.history.includes(q.id)) return null;
  const syms = symptomsOf(q);
  if (syms.length === 0) return d.context.course === undefined ? { kind: "skipped" } : { kind: "answered", options: q.options.filter((o) => o.context?.course === d.context.course).map((o) => o.id), severities: {} };
  const state = (s: string): string | undefined => d.findings[s]?.state;
  if (syms.every((s) => state(s) === "unsure")) return { kind: "skipped" };
  const options: string[] = [];
  const severities: Record<string, Severity> = {};
  for (const o of q.options) {
    if (o.context) { if (d.context.course === o.context.course) options.push(o.id); continue; }
    if (o.none || o.symptoms.length === 0) continue;
    if (o.symptoms.every((s) => state(s) === "present")) {
      options.push(o.id);
      for (const s of o.symptoms) { const sev = d.findings[s]?.severity; if (sev) severities[s] = sev; }
    }
  }
  if (options.length === 0) { const none = q.options.find((o) => o.none); if (none) options.push(none.id); }
  return { kind: "answered", options, severities };
}

/** Complaint modules offered to this person (a module may require a sex and "not pregnant"). */
export function availableModules(kb: KnowledgeBase, d: Draft): QuestionModule[] {
  const s = subjectOf(d);
  return kb.modules.filter((m) => {
    if (!m.requires) return true;
    if (m.requires.sex && s?.sex !== m.requires.sex) return false;
    if (m.requires.pregnancy === "not_pregnant" && (s === null || s.pregnancy === "yes" || s.pregnancy === "possible")) return false;
    return true;
  });
}

export function inquiryState(d: Draft): InquiryState | null {
  const s = subjectOf(d);
  if (s === null) return null;
  return { sex: s.sex, pregnancy: s.pregnancy, findings: d.findings, context: d.context, modules: d.inquiry.modules ?? [] };
}

export interface Next {
  readonly engine: NextQuestions;
  /** The question to ask now: the engine's best suggestion that has not been shown (a skipped question is not re-asked). */
  readonly suggestion: QuestionSuggestion | null;
  /** The inquiry can stop: the engine says so, or nothing askable is left. */
  readonly done: "enough" | "limit" | "exhausted" | null;
}

export function pickNext(kb: KnowledgeBase, d: Draft): Next | null {
  const state = inquiryState(d);
  if (state === null) return null;
  const engine = nextQuestions(kb, state, d.inquiry.history.length + 3);
  const suggestion = engine.suggestions.find((s) => !d.inquiry.history.includes(s.questionId)) ?? null;
  const done = engine.done ?? (suggestion === null ? "exhausted" : null);
  return { engine, suggestion, done };
}

// ── contradictions ───────────────────────────────────────────────────────────

export const conflictKey = (c: Pick<Conflict, "group" | "symptoms">): string => `${c.group}|${[...c.symptoms].sort().join(",")}`;

/** Contradictions in the answers that the user has not resolved yet (SOP §5.3: never a silent pick). */
export function pendingConflicts(kb: KnowledgeBase, d: Draft): Conflict[] {
  const state = inquiryState(d);
  if (state === null) return [];
  const n = normalize(kb, { findings: state.findings, sex: state.sex, pregnancy: state.pregnancy, ...(state.context ? { context: state.context } : {}) });
  return n.conflicts.filter((c) => !d.inquiry.resolved.includes(conflictKey(c)));
}

/** Resolve a contradiction: keep one symptom (the others become absent), or keep them all ("both are true", only for `conflict` groups). */
export function resolveConflict(d: Draft, c: Conflict, keep: string | "both"): Draft {
  const findings: Record<string, Finding> = { ...d.findings };
  if (keep !== "both") for (const s of c.symptoms) if (s !== keep) findings[s] = { state: "absent" };
  return { ...d, findings, inquiry: { ...d.inquiry, resolved: [...d.inquiry.resolved, conflictKey(c)] } };
}

/** What has been recorded so far, grouped by dimension, for the side rail (never pattern names: no anchoring). */
export function recorded(kb: KnowledgeBase, d: Draft): { dimension: string; symptoms: { id: string; text: string; severity?: Severity }[] }[] {
  const byDim = new Map<string, { id: string; text: string; severity?: Severity }[]>();
  for (const [id, f] of Object.entries(d.findings)) {
    if (f.state !== "present") continue;
    const sym = kb.symptoms.get(id);
    if (!sym) continue;
    const list = byDim.get(sym.dimension) ?? [];
    list.push({ id, text: sym["zh-Hant"], ...(f.severity ? { severity: f.severity } : {}) });
    byDim.set(sym.dimension, list);
  }
  return [...byDim.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dimension, symptoms]) => ({ dimension, symptoms }));
}

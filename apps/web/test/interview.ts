// Test support: run the adaptive inquiry through the UI model for a pattern's typical patient (the one in the engine's parity fixture).
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import type { KnowledgeBase } from "@tcm/kb";
import { applyAnswer, pendingConflicts, pickNext, resolveConflict } from "../src/screens/inquiry/model.ts";
import { withAnswer, askedItems } from "../src/screens/screening/model.ts";
import { newDraft } from "../src/storage/draft.ts";
import type { Draft } from "../src/storage/types.ts";

const parity = JSON.parse(readFileSync(resolvePath(process.cwd(), "../../packages/engine/test/fixtures/parity.json"), "utf8")) as { cases: { id: string; findings: Record<string, unknown> }[] };

/** A screened draft of an adult with the given subject overrides, ready for the inquiry. */
export function screenedDraft(kb: KnowledgeBase, subject: Draft["subject"] = { ageYears: 40, sex: "female", pregnancy: "no", lactating: false }, over: Partial<Draft> = {}): Draft {
  let d: Draft = { ...newDraft("d", 1), subject, profile: { medications: "none", medicationText: [], allergies: "none", conditions: "none" }, inquiry: { modules: [], history: [], resolved: [] }, ...over };
  for (const f of [...askedItems(kb).A, ...askedItems(kb).B]) d = withAnswer(d, f.id, "no");
  return d;
}

/** Answer like the typical patient of `patternId` until the inquiry stops; the course is "chronic". Returns the finished draft. */
export function interview(kb: KnowledgeBase, patternId: string, start: Draft = screenedDraft(kb), opts: { maxQuestions?: number } = {}): Draft {
  const typical = parity.cases.find((c) => c.id === `typical-${patternId}`)!.findings;
  const patient = new Set(Object.keys(typical).filter((s) => s.startsWith("S_")));
  const course = kb.questionById.get("Q_COURSE")!;
  let d = applyAnswer(start, course, { kind: "answered", options: [course.options.find((o) => o.context?.course === "chronic")!.id], severities: {} });
  for (let i = 0; i < (opts.maxQuestions ?? 60); i++) {
    const n = pickNext(kb, d)!;
    if (n.done !== null || n.suggestion === null) break;
    const q = kb.questionById.get(n.suggestion.questionId)!;
    const chosen = q.options.filter((o) => !o.none && !o.context && o.symptoms.length > 0 && o.symptoms.every((s) => patient.has(s))).map((o) => o.id);
    d = applyAnswer(d, q, { kind: "answered", options: chosen.length > 0 ? chosen : [q.options.find((o) => o.none)?.id ?? q.options[0]!.id], severities: {} });
    for (const c of pendingConflicts(kb, d)) d = resolveConflict(d, c, "both");
  }
  return d;
}

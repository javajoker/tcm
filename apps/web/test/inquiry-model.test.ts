import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase, type Question } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { describe, expect, it } from "vitest";
import { applyAnswer, availableModules, conflictKey, pendingConflicts, pickNext, recorded, resolveConflict, selectionOf, type Answer } from "../src/screens/inquiry/model.ts";
import { subjectOf } from "../src/screens/profile/model.ts";
import { newDraft } from "../src/storage/draft.ts";
import type { Draft } from "../src/storage/types.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const q = (id: string): Question => kb.questionById.get(id)!;
const base = (over: Partial<Draft> = {}): Draft => ({
  ...newDraft("d", 1), subject: { ageYears: 40, sex: "male" }, profile: { medications: "none", medicationText: [], allergies: "none", conditions: "none" },
  inquiry: { modules: [], history: [], resolved: [] }, ...over,
});
const female = (): Draft => base({ subject: { ageYears: 30, sex: "female", pregnancy: "no", lactating: false } });
const pick = (...ids: string[]): Answer => ({ kind: "answered", options: ids, severities: {} });

describe("applyAnswer", () => {
  it("selected options are present (graded ones with a severity, default moderate), the unselected options' symptoms absent", () => {
    const d = applyAnswer(base(), q("Q_COLD"), { kind: "answered", options: ["aversion_cold", "cold_limbs"], severities: { S_COLD_LIMBS: "severe" } });
    expect(d.findings["S_AVERSION_COLD"]).toEqual({ state: "present", severity: "moderate" });
    expect(d.findings["S_COLD_LIMBS"]).toEqual({ state: "present", severity: "severe" });
    expect(d.findings["S_FEAR_COLD"]).toEqual({ state: "absent" });
    expect(d.findings["S_AVERSION_WIND"]).toEqual({ state: "absent" });
    expect(d.inquiry.history).toEqual(["Q_COLD"]);
  });

  it("'none of these' makes every symptom of the question absent", () => {
    const d = applyAnswer(base(), q("Q_COLD"), pick("none"));
    for (const s of ["S_AVERSION_COLD", "S_FEAR_COLD", "S_AVERSION_WIND", "S_COLD_LIMBS"]) expect(d.findings[s]).toEqual({ state: "absent" });
  });

  it("skipping records every symptom as unsure, and the question counts as asked", () => {
    const d = applyAnswer(base(), q("Q_COLD"), { kind: "skipped" });
    for (const s of ["S_AVERSION_COLD", "S_FEAR_COLD", "S_AVERSION_WIND", "S_COLD_LIMBS"]) expect(d.findings[s]).toEqual({ state: "unsure" });
    expect(engine.isAsked(q("Q_COLD"), d)).toBe(true);
  });

  it("the onset question sets the course instead of symptoms; skipping it records nothing but is not asked again", () => {
    const course = q("Q_COURSE");
    const acute = applyAnswer(base(), course, pick(course.options.find((o) => o.context?.course === "acute")!.id));
    expect(acute.context.course).toBe("acute");
    expect(Object.keys(acute.findings)).toEqual([]);
    const skipped = applyAnswer(base(), course, { kind: "skipped" });
    expect(skipped.context.course).toBeUndefined();
    expect(skipped.inquiry.history).toEqual(["Q_COURSE"]);
    expect(pickNext(kb, applyAnswer(skipped, q("Q_COLD"), pick("none")))?.suggestion?.questionId).not.toBe("Q_COURSE");
  });

  it("guided questions (face observation) record findings with the guided source", () => {
    const guided = kb.questions.find((x) => x.source === "guided")!;
    const o = guided.options.find((x) => !x.none && x.symptoms.length > 0)!;
    const d = applyAnswer(base(), guided, pick(o.id));
    expect(d.findings[o.symptoms[0]!]).toMatchObject({ state: "present", source: "guided" });
  });

  it("re-answering replaces the earlier answer and keeps the question's place in the history", () => {
    let d = applyAnswer(base(), q("Q_COLD"), pick("aversion_cold"));
    d = applyAnswer(d, q("Q_HEAT"), pick("none"));
    d = applyAnswer(d, q("Q_COLD"), pick("fear_cold"));
    expect(d.findings["S_AVERSION_COLD"]).toEqual({ state: "absent" });
    expect(d.findings["S_FEAR_COLD"]).toEqual({ state: "present", severity: "moderate" });
    expect(d.inquiry.history).toEqual(["Q_COLD", "Q_HEAT"]);
  });
});

describe("selectionOf", () => {
  it("reconstructs what was answered, so Back shows the earlier choice", () => {
    expect(selectionOf(base(), q("Q_COLD"))).toBeNull();
    const a = applyAnswer(base(), q("Q_COLD"), { kind: "answered", options: ["fear_cold", "cold_limbs"], severities: { S_COLD_LIMBS: "light" } });
    expect(selectionOf(a, q("Q_COLD"))).toEqual({ kind: "answered", options: ["fear_cold", "cold_limbs"], severities: { S_FEAR_COLD: "moderate", S_COLD_LIMBS: "light" } });
    expect(selectionOf(applyAnswer(base(), q("Q_COLD"), pick("none")), q("Q_COLD"))).toEqual({ kind: "answered", options: ["none"], severities: {} });
    expect(selectionOf(applyAnswer(base(), q("Q_COLD"), { kind: "skipped" }), q("Q_COLD"))).toEqual({ kind: "skipped" });
    const course = q("Q_COURSE");
    const chronic = course.options.find((o) => o.context?.course === "chronic")!.id;
    expect(selectionOf(applyAnswer(base(), course, pick(chronic)), course)).toEqual({ kind: "answered", options: [chronic], severities: {} });
    expect(selectionOf(applyAnswer(base(), course, { kind: "skipped" }), course)).toEqual({ kind: "skipped" });
  });
});

describe("modules and the next question", () => {
  it("the women's-cycle module is offered only to females who are not pregnant", () => {
    const ids = (d: Draft): string[] => availableModules(kb, d).map((m) => m.id);
    expect(ids(base())).not.toContain("womens-cycle");
    expect(ids(female())).toContain("womens-cycle");
    expect(ids(base({ subject: { ageYears: 30, sex: "female", pregnancy: "possible", lactating: false } }))).not.toContain("womens-cycle");
    expect(ids(female())).toHaveLength(8);
  });

  it("a chosen module is asked about first, a skipped question is never offered again, and the end is reported", () => {
    const d0 = base({ inquiry: { modules: ["sleep"], history: [], resolved: [] } });
    expect(pickNext(kb, d0)?.suggestion?.questionId).toBe("Q_HEAT");
    let d = applyAnswer(d0, q("Q_HEAT"), { kind: "skipped" });
    expect(pickNext(kb, d)?.suggestion?.questionId).not.toBe("Q_HEAT");
    for (let i = 0; i < 60; i++) { const n = pickNext(kb, d)!; if (n.suggestion === null) break; d = applyAnswer(d, kb.questionById.get(n.suggestion.questionId)!, pick(...[kb.questionById.get(n.suggestion.questionId)!.options.find((o) => o.none)?.id ?? kb.questionById.get(n.suggestion.questionId)!.options[0]!.id])); }
    expect(pickNext(kb, d)?.done).not.toBeNull();
  });

  it("is null for an incomplete profile", () => {
    expect(pickNext(kb, newDraft("x", 1))).toBeNull();
  });
});

describe("contradictions", () => {
  const exclusive = (): Draft => applyAnswer(applyAnswer(base(), q("Q_COLD"), pick("aversion_cold")), q("Q_BODY"), pick("none"));

  it("are found, asked once, and resolved without a silent pick", () => {
    // two cold kinds that exclude each other, answered in different places
    let d = base();
    d = { ...d, findings: { S_AVERSION_COLD: { state: "present" }, S_FEAR_COLD: { state: "present" } }, inquiry: { ...d.inquiry, history: ["Q_COLD"] } };
    const pending = pendingConflicts(kb, d);
    expect(pending.map((c) => c.group)).toEqual(["X_COLD_KIND"]);
    const kept = resolveConflict(d, pending[0]!, "S_FEAR_COLD");
    expect(kept.findings["S_AVERSION_COLD"]).toEqual({ state: "absent" });
    expect(kept.findings["S_FEAR_COLD"]).toEqual({ state: "present" });
    expect(pendingConflicts(kb, kept)).toEqual([]);
    expect(kept.inquiry.resolved).toEqual([conflictKey(pending[0]!)]);
  });

  it("'both are true' keeps both and is not asked again", () => {
    const d: Draft = { ...base(), findings: { S_NO_SWEAT: { state: "present" }, S_SPONTANEOUS_SWEAT: { state: "present" } } };
    const [c] = pendingConflicts(kb, d);
    expect(c).toMatchObject({ kind: "conflict", group: "C_SWEAT" });
    const kept = resolveConflict(d, c!, "both");
    expect(kept.findings["S_NO_SWEAT"]).toEqual({ state: "present" });
    expect(kept.findings["S_SPONTANEOUS_SWEAT"]).toEqual({ state: "present" });
    expect(pendingConflicts(kb, kept)).toEqual([]);
    expect(exclusive().inquiry.resolved).toEqual([]);
  });
});

describe("recorded (the rail)", () => {
  it("lists present symptoms by dimension, never absent or unsure ones", () => {
    const d = applyAnswer(applyAnswer(base(), q("Q_COLD"), pick("aversion_cold")), q("Q_HEAT"), { kind: "skipped" });
    const r = recorded(kb, d);
    expect(r).toEqual([{ dimension: "cold-heat", symptoms: [{ id: "S_AVERSION_COLD", text: "惡寒（加衣被仍冷）", severity: "moderate" }] }]);
  });
});

describe("simulation through the UI model: every pattern's typical patient is led to that pattern", () => {
  const parity = JSON.parse(readFileSync(resolvePath(process.cwd(), "../../packages/engine/test/fixtures/parity.json"), "utf8")) as { cases: { id: string; findings: Record<string, unknown> }[] };

  it("terminates within the budget with the right pattern among the top two", () => {
    const counts: number[] = [];
    for (const p of kb.patterns) {
      const typical = parity.cases.find((c) => c.id === `typical-${p.id}`)!.findings;
      const patient = new Set(Object.keys(typical).filter((s) => s.startsWith("S_")));
      const isFemale = [...patient].some((s) => s.startsWith("S_MENSES") || ["S_DYSMENORRHEA", "S_LEUKORRHEA_YELLOW", "S_BREAST_DISTENSION"].includes(s));
      let d: Draft = isFemale ? female() : base();
      d = applyAnswer(d, q("Q_COURSE"), pick(q("Q_COURSE").options.find((o) => o.context?.course === "chronic")!.id));
      let steps = 0;
      for (; steps < 60; steps++) {
        const n = pickNext(kb, d)!;
        if (n.done !== null || n.suggestion === null) break;
        const question = kb.questionById.get(n.suggestion.questionId)!;
        const chosen = question.options.filter((o) => !o.none && !o.context && o.symptoms.length > 0 && o.symptoms.every((s) => patient.has(s))).map((o) => o.id);
        d = applyAnswer(d, question, pick(...(chosen.length > 0 ? chosen : [question.options.find((o) => o.none)?.id ?? question.options[0]!.id])));
        for (const c of pendingConflicts(kb, d)) d = resolveConflict(d, c, "both");
      }
      expect(steps, `${p.id} took ${steps} questions`).toBeLessThanOrEqual(kb.params.questionnaire.max_questions);
      counts.push(steps);
      const subject = subjectOf(d)!;
      const a = engine.assess(kb, { subject, redFlags: new Set(), findings: d.findings, context: d.context, options: { now: 0, birthModule: false } });
      expect(a.patterns.slice(0, 2).some((x) => x.id === p.id), `${p.id}: ended with ${a.patterns.slice(0, 2).map((x) => x.id)} after ${steps} questions`).toBe(true);
    }
    expect(Math.max(...counts)).toBeLessThanOrEqual(30);
  });
});

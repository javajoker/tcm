import assert from "node:assert/strict";
import { test } from "node:test";
import { indexKnowledgeBase, type Question } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { isAsked, nextQuestions, normalize, scorePatterns } from "../src/index.ts";
import type { Findings, InquiryState } from "../src/index.ts";
import { dev } from "./kbs.ts";
import { PARITY } from "./parity.ts";

const state = (over: Partial<InquiryState> = {}): InquiryState => ({ sex: "female", pregnancy: "no", findings: {}, modules: [], ...over });

/** What an interviewee with these symptoms answers: selected options present (moderate), the other symptoms of the question absent. */
function answer(q: Question, patient: ReadonlySet<string>): Findings {
  const out: Record<string, { state: "present" | "absent"; severity?: "moderate" }> = {};
  for (const o of q.options) for (const s of o.symptoms) out[s] = patient.has(s) ? { state: "present", severity: "moderate" } : { state: "absent" };
  return out;
}

test("at the start: core questions in order; the chosen module comes first", () => {
  const plain = nextQuestions(dev, state(), 5);
  assert.deepEqual(plain.suggestions.map((s) => s.questionId), ["Q_COLD", "Q_HEAT", "Q_SWEAT", "Q_HEAD", "Q_BODY"]);
  assert.ok(plain.suggestions.every((s) => s.reason.kind === "core"));
  assert.equal(plain.done, null);
  assert.equal(plain.asked, 0);
  const sleep = nextQuestions(dev, state({ modules: ["sleep"] }), 4);
  assert.equal(sleep.suggestions[0]!.questionId, "Q_HEAT", "the earliest core question of the sleep module");
  assert.ok(sleep.suggestions.slice(0, 3).every((s) => s.reason.kind === "module"), JSON.stringify(sleep.suggestions.map((s) => s.reason)));
  assert.ok(sleep.suggestions.some((s) => s.questionId === "Q_SLEEP"));
});

test("prerequisites: no menstrual question for men or in pregnancy; the male question only for men", () => {
  const all = (st: InquiryState): string[] => { const ids: string[] = []; let f: Findings = {}; for (let i = 0; i < 60; i++) { const r = nextQuestions(dev, { ...st, findings: f }, 1); if (!r.suggestions[0]) break; const q = dev.questionById.get(r.suggestions[0].questionId)!; ids.push(q.id); f = { ...f, ...answer(q, new Set()) }; } return ids; };
  const man = all(state({ sex: "male", pregnancy: "not-applicable" }));
  assert.ok(!man.includes("Q_MENSES") && man.includes("Q_COLD"));
  assert.ok(!all(state({ pregnancy: "yes" })).includes("Q_MENSES"));
  assert.ok(all(state()).includes("Q_MENSES"));
  assert.ok(!all(state()).includes("Q_MALE"));
});

test("follow-up questions appear only after their trigger symptom", () => {
  const without = nextQuestions(dev, state({ findings: { S_FATIGUE: { state: "present" } } }), 30).suggestions.map((s) => s.questionId);
  assert.ok(!without.includes("Q_PAIN_QUALITY") && !without.includes("Q_ABD_PRESS"));
  const with_ = nextQuestions(dev, state({ findings: { S_HEADACHE: { state: "present" }, S_EPIGASTRIC_PAIN: { state: "present" } } }), 30).suggestions.map((s) => s.questionId);
  assert.ok(with_.includes("Q_PAIN_QUALITY") && with_.includes("Q_ABD_PRESS"));
});

test("an answered or skipped question is never asked again", () => {
  const findings: Findings = { ...answer(dev.questionById.get("Q_COLD")!, new Set(["S_FEAR_COLD"])), S_FEVER: { state: "unsure" }, S_FEVER_UNEVEN: { state: "unsure" } };
  const ids = nextQuestions(dev, state({ findings }), 40).suggestions.map((s) => s.questionId);
  assert.ok(!ids.includes("Q_COLD") && !ids.includes("Q_HEAT"), "a skipped question (all unsure) counts as asked");
  assert.ok(isAsked(dev.questionById.get("Q_COLD")!, { findings }));
  assert.ok(!isAsked(dev.questionById.get("Q_SLEEP")!, { findings }));
  const course = dev.questionById.get("Q_COURSE")!;
  assert.ok(!isAsked(course, { findings }) && isAsked(course, { findings, context: { course: "acute" } }));
});

test("once enough is known the ranking is by how well a question separates the leading patterns, with its reason", () => {
  // an EX2 / EX4 ambiguous presentation: after a few answers the next question should separate the two (桂枝湯 patterns)
  const patient = new Set(["S_AVERSION_WIND", "S_SPONTANEOUS_SWEAT", "S_FEVER", "S_HEADACHE"]);
  let f: Findings = {};
  for (const id of ["Q_COLD", "Q_HEAT", "Q_SWEAT", "Q_HEAD"]) f = { ...f, ...answer(dev.questionById.get(id)!, patient) };
  const r = nextQuestions(dev, state({ findings: f }), 3);
  assert.ok(r.suggestions.length === 3);
  const top = r.suggestions[0]!;
  assert.ok(top.gain > 0.5, `gain ${top.gain}`);
  assert.equal(top.reason.kind, "separates");
  if (top.reason.kind === "separates") {
    assert.equal(top.reason.between.length, 2);
    assert.ok(top.reason.symptoms.length > 0 && top.reason.symptoms.length <= 3);
    const q = dev.questionById.get(top.questionId)!;
    assert.ok(top.reason.symptoms.every((s) => q.options.some((o) => o.symptoms.includes(s))), "the listed symptoms belong to the question");
  }
});

test("stop rule: enough when the confidence is at least medium and the core coverage ≥ 80 %; 'exhausted' when nothing is left", () => {
  const typical = PARITY.cases.find((c) => c.id === "typical-SP1")!.findings;
  const patient = new Set(Object.keys(typical).filter((s) => s.startsWith("S_")));
  let f: Findings = {};
  let last = nextQuestions(dev, state({ findings: f }), 1);
  let n = 0;
  while (last.done === null && last.suggestions[0] && n < 60) { f = { ...f, ...answer(dev.questionById.get(last.suggestions[0].questionId)!, patient) }; last = nextQuestions(dev, state({ findings: f }), 1); n++; }
  assert.equal(last.done, "enough");
  assert.ok(last.coverage >= 0.8 && (last.confidence === "high" || last.confidence === "medium"));
  assert.ok(n <= 28);
  // nothing left
  let all: Findings = {};
  for (const q of dev.questions) all = { ...all, ...answer(q, new Set()) };
  assert.deepEqual([nextQuestions(dev, state({ findings: all, context: { course: "chronic" } })).done, nextQuestions(dev, state({ findings: all, context: { course: "chronic" } })).suggestions.length], ["exhausted", 0]);
});

test("the question limit stops the inquiry", () => {
  const raw = rawChunksFromDisk("dev");
  const kb = indexKnowledgeBase({ ...raw, core: { ...raw.core, params: { ...raw.core.params, questionnaire: { ...raw.core.params.questionnaire, max_questions: 2 } } } });
  const f: Findings = { ...answer(kb.questionById.get("Q_COLD")!, new Set()), ...answer(kb.questionById.get("Q_HEAT")!, new Set()) };
  const r = nextQuestions(kb, state({ findings: f }));
  assert.deepEqual([r.done, r.suggestions.length], ["limit", 0]);
});

test("simulation: for every pattern's typical patient the adaptive inquiry terminates within the budget and reaches that pattern", () => {
  const counts: number[] = [];
  for (const p of dev.patterns) {
    const typical = PARITY.cases.find((c) => c.id === `typical-${p.id}`)!.findings;
    const patient = new Set(Object.keys(typical).filter((s) => s.startsWith("S_")));
    const female = [...patient].some((s) => s.startsWith("S_MENSES") || ["S_DYSMENORRHEA", "S_LEUKORRHEA_YELLOW", "S_BREAST_DISTENSION"].includes(s));
    const st = (f: Findings): InquiryState => ({ sex: female ? "female" : "male", pregnancy: female ? "no" : "not-applicable", findings: f, modules: [], context: { course: "chronic" } });
    let f: Findings = {};
    let r = nextQuestions(dev, st(f), 1);
    let steps = 0;
    while (r.done === null && r.suggestions[0] && steps < 60) { f = { ...f, ...answer(dev.questionById.get(r.suggestions[0].questionId)!, patient) }; r = nextQuestions(dev, st(f), 1); steps++; }
    assert.ok(steps <= dev.params.questionnaire.max_questions, `${p.id}: ${steps} questions`);
    assert.notEqual(r.done, null, `${p.id}: did not terminate`);
    counts.push(steps);
    const ranked = scorePatterns(dev, normalize(dev, { findings: f, sex: female ? "female" : "male", pregnancy: female ? "no" : "not-applicable" }));
    assert.ok(ranked.slice(0, 2).some((x) => x.id === p.id), `${p.id}: ended with ${ranked.slice(0, 2).map((x) => x.id)} after ${steps} questions`);
  }
  assert.ok(Math.max(...counts) <= 28, `max ${Math.max(...counts)}`);
});

test("deterministic", () => {
  const st = state({ findings: answer(dev.questionById.get("Q_SLEEP")!, new Set(["S_INSOMNIA_ONSET"])), modules: ["sleep"] });
  assert.deepEqual(nextQuestions(dev, st, 5), nextQuestions(dev, st, 5));
});

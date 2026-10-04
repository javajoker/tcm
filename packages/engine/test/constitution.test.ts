import assert from "node:assert/strict";
import { test } from "node:test";
import { assess, scoreConstitution, susceptibilityAt, BALANCED, MIN_ANSWERED_SHARE } from "../src/index.ts";
import type { AssessInput, Findings, Subject } from "../src/index.ts";
import { dev, release } from "./kbs.ts";
import { PARITY } from "./parity.ts";

const types = dev.constitutionItems.types;
const typeOf = (id: string) => types.find((t) => t.constitution === id)!;
/** Answers giving every item of the listed types the same value (a reversed item the mirrored one, so a "high" type stays high). */
function answersFor(spec: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, v] of Object.entries(spec)) for (const item of typeOf(id).items) out[item.id] = item.reverse ? 6 - v : v;
  return out;
}
const score = (r: ReturnType<typeof scoreConstitution>, id: string) => r!.scores.find((s) => s.id === id)!;

test("the converted score follows the standard: (raw − n) ÷ (4n) × 100", () => {
  const all5 = scoreConstitution(dev, answersFor({ C_QIXU: 5 }));
  assert.equal(score(all5, "C_QIXU").converted, 100);
  assert.equal(score(scoreConstitution(dev, answersFor({ C_QIXU: 1 })), "C_QIXU").converted, 0);
  assert.equal(score(scoreConstitution(dev, answersFor({ C_QIXU: 3 })), "C_QIXU").converted, 50);
  const items = typeOf("C_QIXU").items;
  const half = Object.fromEntries(items.map((i, k) => [i.id, k < 2 ? 5 : 1]));                       // raw 5+5+1+1 = 12, n 4 → 50
  assert.equal(score(scoreConstitution(dev, half), "C_QIXU").converted, 50);
});

test("a reversed item scores 6 − answer (the balanced type)", () => {
  const b = typeOf(BALANCED).items;
  assert.equal(b.filter((i) => i.reverse).length, 1);
  const r = scoreConstitution(dev, Object.fromEntries(b.map((i) => [i.id, i.reverse ? 1 : 5])));       // every item at its best
  assert.equal(score(r, BALANCED).raw, 25);
  assert.equal(score(r, BALANCED).converted, 100);
});

test("levels of the biased types: ≥ 40 yes, 30–39 tends, < 30 no (n = 5 balanced is not used here; n = 4 raw 4 + 1.6·k)", () => {
  const items = typeOf("C_YINXU").items;                                    // n = 4: converted = (raw − 4) / 16 × 100
  const lvl = (raw: number): string => {
    const ans = [1, 1, 1, 1];
    let extra = raw - 4;
    for (let i = 0; i < 4 && extra > 0; i++) { const add = Math.min(4, extra); ans[i] = 1 + add; extra -= add; }
    return score(scoreConstitution(dev, Object.fromEntries(items.map((it, k) => [it.id, ans[k]!]))), "C_YINXU").level;
  };
  assert.equal(lvl(4), "no");                                              //   0
  assert.equal(lvl(8), "no");                                              //  25
  assert.equal(lvl(9), "tends");                                           //  31.25
  assert.equal(lvl(10), "tends");                                          //  37.5
  assert.equal(lvl(11), "yes");                                            //  43.75
  assert.equal(lvl(20), "yes");
});

test("the balanced type: ≥ 60 and every biased type < 30 → yes; < 40 → basically; otherwise no", () => {
  const forward = (id: string, hi: number, lo: number, upTo: number): Record<string, number> => Object.fromEntries(typeOf(id).items.map((i, k) => [i.id, k < upTo ? hi : lo]));
  const yes = scoreConstitution(dev, { ...answersFor({ C_PINGHE: 5 }), ...answersFor({ C_QIXU: 1, C_YANGXU: 1 }) });
  assert.equal(yes!.balanced, "yes");
  assert.equal(yes!.primary, BALANCED);

  const tends = { ...answersFor({ C_PINGHE: 5 }), ...forward("C_QIXU", 3, 2, 2) };                  // raw 3+3+2+2 = 10 → 37.5: "tends", below 40
  assert.equal(score(scoreConstitution(dev, tends), "C_QIXU").converted, 37.5);
  assert.equal(scoreConstitution(dev, tends)!.balanced, "basically");
  assert.equal(scoreConstitution(dev, tends)!.primary, "C_QIXU", "a biased tendency of at least 'tends' leads over the balanced type");

  const strong = { ...answersFor({ C_PINGHE: 5 }), ...forward("C_QIXU", 4, 2, 2) };                 // raw 4+4+2+2 = 12 → 50 ≥ 40
  assert.equal(score(scoreConstitution(dev, strong), "C_QIXU").level, "yes");
  assert.equal(scoreConstitution(dev, strong)!.balanced, "no");

  const lowBalanced = scoreConstitution(dev, { ...answersFor({ C_PINGHE: 2 }), ...answersFor({ C_QIXU: 1 }) });
  assert.equal(lowBalanced!.balanced, "no");                                                         // the balanced score itself is below 60
  assert.equal(lowBalanced!.primary, null);
});

test("primary and secondary are the two strongest biased tendencies; ties go to the order of the knowledge base", () => {
  const r = scoreConstitution(dev, { ...answersFor({ C_QIXU: 5, C_YANGXU: 4, C_YINXU: 1, C_PINGHE: 1 }) });
  assert.equal(r!.primary, "C_QIXU");
  assert.equal(r!.secondary, "C_YANGXU");
  const tie = scoreConstitution(dev, answersFor({ C_YANGXU: 5, C_QIXU: 5 }));
  assert.equal(tie!.primary, "C_QIXU", "C_QIXU comes before C_YANGXU in the knowledge base");
  assert.equal(tie!.secondary, "C_YANGXU");
  const none = scoreConstitution(dev, answersFor({ C_QIXU: 2, C_YANGXU: 2, C_PINGHE: 2 }));
  assert.equal(none!.primary, null);                                         // no clear tendency, not a label
  assert.equal(none!.secondary, null);
});

test("partial answers: a type with at least half its items answered is scored over what was answered, fewer is not scored", () => {
  assert.equal(MIN_ANSWERED_SHARE, 0.5);
  const items = typeOf("C_TANSHI").items;
  const two = scoreConstitution(dev, { [items[0]!.id]: 5, [items[1]!.id]: 5 });
  assert.equal(score(two, "C_TANSHI").converted, 100);
  assert.equal(score(two, "C_TANSHI").answered, 2);
  assert.equal(two!.complete, false);
  const one = scoreConstitution(dev, { [items[0]!.id]: 5 });
  assert.equal(score(one, "C_TANSHI").converted, null);
  assert.equal(score(one, "C_TANSHI").level, "unscored");
  assert.equal(one!.primary, null);
});

test("nothing valid answered means no result; unknown ids and invalid values are ignored", () => {
  assert.equal(scoreConstitution(dev, {}), null);
  assert.equal(scoreConstitution(dev, { CI_NOPE_1: 5, [typeOf("C_QIXU").items[0]!.id]: 9 }), null);
  assert.equal(scoreConstitution(dev, { [typeOf("C_QIXU").items[0]!.id]: 2.5 }), null);
  assert.equal(scoreConstitution(dev, answersFor({ C_QIXU: 4 }))!.complete, false);       // the other eight types are unanswered
  const everything = Object.fromEntries(types.flatMap((t) => t.items.map((i) => [i.id, 3])));
  assert.equal(scoreConstitution(dev, everything)!.complete, true);
});

test("susceptibility = Σ risk × exposure; the season's qi counts 1.0, the climate adds", () => {
  const panel = (name: string, climate: Record<string, number>) => ({ season: { name, element: "水", model: "changxia", longitude: 0 }, climate: { 風: 0, 寒: 0, 暑: 0, 濕: 0, 燥: 0, 火: 0, ...climate } }) as never;
  const winter = susceptibilityAt(dev, "C_YANGXU", panel("冬", { 寒: 0.5 }));
  assert.deepEqual(winter.items.map((i) => [i.evil, i.score]), [["寒", 3]]);          // risk 2 × (1 + 0.5); 濕 is not the season's qi and has no climate
  const longSummer = susceptibilityAt(dev, "C_TANSHI", panel("長夏", {}));
  assert.deepEqual(longSummer.items.map((i) => [i.evil, i.score]), [["濕", 2]]);
  const withClimate = susceptibilityAt(dev, "C_SHIRE", panel("夏", { 濕: 0.4 }));
  assert.deepEqual(withClimate.items.map((i) => i.evil).sort(), ["暑", "濕", "火"].sort());
  assert.equal(withClimate.items[0]!.evil, "暑");                                       // 2 × 1.0 first, then 濕 2 × 0.4, 火 1 × 1.0
  assert.deepEqual(susceptibilityAt(dev, BALANCED, panel("冬", { 寒: 1 })).items, []);
  assert.deepEqual(susceptibilityAt(dev, "C_YANGXU", panel("春", {})).items, []);       // nothing of this constitution's risks is exposed in spring
});

// ── in the assessment ────────────────────────────────────────────────────────────────────────────────────

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const person = (over: Partial<Subject> = {}): Subject => ({ ageYears: 35, sex: "female", pregnancy: "no", lactating: false, medications: [], allergies: [], seriousChronicDisease: false, ...over });
const worked = PARITY.cases.find((c) => c.id === "worked-example")!.findings as Findings;
const base = (over: Partial<AssessInput> = {}): AssessInput => ({ subject: person(), redFlags: new Set(), findings: worked, options: { now: NOW, birthModule: false }, ...over });

test("without the quiz the assessment has no constitution block and is unchanged", () => {
  assert.equal(assess(dev, base()).constitution, null);
  const withQuiz = assess(dev, base({ constitutionAnswers: answersFor({ C_QIXU: 5 }) }));
  const without = assess(dev, base());
  assert.deepEqual(withQuiz.patterns, without.patterns, "the constitution never changes a pattern score");
  assert.deepEqual(withQuiz.verdict, without.verdict);
  assert.deepEqual(withQuiz.panel, without.panel);
});

test("with the quiz: the result, and the susceptibility now and for the coming seasons when a reference exists", () => {
  const a = assess(dev, base({ constitutionAnswers: answersFor({ C_YANGXU: 5, C_QIXU: 4 }) }));
  assert.equal(a.constitution!.result.primary, "C_YANGXU");
  assert.equal(a.constitution!.result.secondary, "C_QIXU");
  const s = a.constitution!.susceptibility!;
  assert.equal(s.constitution, "C_YANGXU");
  assert.ok(a.reference !== null);
  assert.equal(s.now!.season, a.reference!.panel.season.name);
  assert.equal(s.upcoming.length, a.reference!.forecast.length);
});

test("a quiz with no clear tendency has a result but no susceptibility", () => {
  const a = assess(dev, base({ constitutionAnswers: answersFor({ C_QIXU: 2, C_PINGHE: 2 }) }));
  assert.equal(a.constitution!.result.primary, null);
  assert.equal(a.constitution!.susceptibility, null);
});

test("the allergic constitution reaches the safety rule: tonic items are annotated only for that primary constitution", () => {
  const typical = PARITY.cases.find((c) => c.id === "typical-SP1")!.findings as Findings;
  const filled: Record<string, Findings[string]> = { ...typical };
  for (const q of dev.questions) { if (q.requires?.sex === "male") continue; for (const o of q.options) for (const sym of o.symptoms) if (!(sym in filled)) filled[sym] = { state: "absent" }; }
  const mk = (answers?: Record<string, number>): AssessInput => ({ subject: person(), redFlags: new Set(), findings: filled, context: { course: "chronic" }, options: { now: NOW, birthModule: false }, ...(answers ? { constitutionAnswers: answers } : {}) });
  const tebing = assess(dev, mk(answersFor({ C_TEBING: 5 })));
  const plain = assess(dev, mk(answersFor({ C_QIXU: 5 })));
  assert.equal(tebing.constitution!.result.primary, "C_TEBING");
  const fired = (a: ReturnType<typeof assess>): boolean => JSON.stringify(a.recommendations).includes("R_TEBING_CONSTITUTION");
  assert.equal(fired(tebing), true);
  assert.equal(fired(plain), false);
  assert.equal(fired(assess(dev, mk())), false);
  assert.equal(release.constitutionItems.types.length, 9, "both profiles carry the questionnaire");
});

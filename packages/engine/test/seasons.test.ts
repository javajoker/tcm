// The person's choice of how seasons are counted (docs/post-mvp/design/five-phase-extensions.md §4; task PM-26), at the engine: the southern basis and "no seasons" are stamped, start a series of their own,
// change only what a season changes, and — like every prior — never the diagnosis. The northern answer, named or not, is the one recorded before the choice existed (result-stability.test.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { assess } from "../src/index.ts";
import type { AssessInput, Findings, Subject } from "../src/index.ts";
import { dev, release } from "./kbs.ts";
import { PARITY } from "./parity.ts";

const BIRTH = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
const person = (over: Partial<Subject> = {}): Subject => ({ ageYears: 35, sex: "female", pregnancy: "no", lactating: false, medications: [], allergies: [], seriousChronicDisease: false, ...over });
const worked: Findings = PARITY.cases.find((c) => c.id === "worked-example")!.findings;
const answers = Object.fromEntries(dev.constitutionItems.types.flatMap((t) => t.items).map((it, i) => [it.id, i % 3 === 0 ? 5 : 2]));
const MARCH = Date.UTC(2026, 2, 20, 12);
const run = (kb: typeof dev, seasons: AssessInput["options"]["seasons"], now = MARCH, birth = true) => assess(kb, {
  subject: person(birth ? { birth: BIRTH } : {}), redFlags: new Set(), findings: worked, constitutionAnswers: answers,
  options: { now, birthModule: birth, ...(seasons ? { seasons } : {}) },
});

const NORTH_FINGERPRINT = "366e19e0+4c3e3303";          // result-stability.test.ts pins the same string

test("naming the northern calendar is the same as not naming a basis: the same result, no key in the stamp", () => {
  const plain = run(dev, undefined);
  const named = run(dev, "north");
  assert.deepEqual(named, plain);
  assert.equal(plain.meta.paramsFingerprint, NORTH_FINGERPRINT);
  assert.equal("seasons" in plain.meta, false);
});

test("the southern basis is stamped, and the stamp of the parameters is the northern one with its own ending — a series of its own in the history", () => {
  const a = run(dev, "south");
  assert.equal(a.meta.seasons, "south");
  assert.equal(a.meta.paramsFingerprint, `${NORTH_FINGERPRINT}+south`);
  assert.equal(a.reference!.panel.season.hemisphere, "south");
  assert.equal(a.reference!.panel.season.name, "秋", "20 March in the south is autumn (in the north: spring)");
  assert.equal(run(dev, undefined).reference!.panel.season.name, "春");
  assert.deepEqual(run(dev, "south"), a, "deterministic");
});

test("the coming seasons are listed in the order the person lives them", () => {
  const north = run(dev, undefined).reference!.forecast.map((p) => p.season.name);
  const south = run(dev, "south").reference!.forecast.map((p) => p.season.name);
  assert.deepEqual(north, ["春", "夏", "長夏", "秋", "冬"]);
  assert.deepEqual(south, ["秋", "冬", "春", "夏", "長夏"]);
});

test("only a season moves: the innate and annual blocks, the year's qi and the climate are the same, and so is the diagnosis", () => {
  const n = run(dev, undefined);
  const s = run(dev, "south");
  assert.deepEqual(s.reference!.panel.components.innate, n.reference!.panel.components.innate);
  assert.deepEqual(s.reference!.panel.components.annualBazi, n.reference!.panel.components.annualBazi);
  assert.deepEqual(s.reference!.panel.components.yunqi, n.reference!.panel.components.yunqi);
  assert.deepEqual(s.reference!.panel.climate, n.reference!.panel.climate);
  assert.deepEqual(s.reference!.panel.yunqi, n.reference!.panel.yunqi);
  assert.notDeepEqual(s.reference!.panel.components.season, n.reference!.panel.components.season);
  // a prior is context: the scores, the observed panel and the verdict's patterns do not depend on it
  assert.deepEqual(s.patterns.map((p) => [p.id, p.pct]), n.patterns.map((p) => [p.id, p.pct]));
  assert.deepEqual(s.panel.wuxingFunction, n.panel.wuxingFunction);
  assert.deepEqual(s.verdict.patterns.map((p) => p.id), n.verdict.patterns.map((p) => p.id));
  assert.deepEqual(s.recommendations.formulas.map((f) => f.id), n.recommendations.formulas.map((f) => f.id));
  assert.deepEqual(s.policy, n.policy);
});

test("the susceptibility to the season follows the season the person lives, not the calendar's", () => {
  const n = run(dev, undefined).constitution!.susceptibility!;
  const s = run(dev, "south").constitution!.susceptibility!;
  assert.equal(n.now!.season, "春");
  assert.equal(s.now!.season, "秋");
  assert.deepEqual(s.upcoming.map((u) => u.season), ["秋", "冬", "春", "夏", "長夏"]);
});

test("no seasons: the season block, the forecast and the susceptibility to a season are left out, the rest is the same, and it is stamped", () => {
  const n = run(dev, undefined);
  const off = run(dev, "off");
  assert.equal(off.meta.seasons, "off");
  assert.equal(off.meta.paramsFingerprint, `${NORTH_FINGERPRINT}+noseason`);
  assert.equal(off.reference!.enabled.season, false);
  assert.equal(off.reference!.panel.components.season, null);
  assert.deepEqual(off.reference!.forecast, []);
  assert.equal(off.constitution!.susceptibility!.now, null);
  assert.deepEqual(off.constitution!.susceptibility!.upcoming, []);
  assert.deepEqual(off.reference!.panel.components.annualBazi, n.reference!.panel.components.annualBazi);
  assert.deepEqual(off.reference!.panel.components.yunqi, n.reference!.panel.components.yunqi);
  assert.deepEqual(off.patterns.map((p) => [p.id, p.pct]), n.patterns.map((p) => [p.id, p.pct]));
  assert.ok(!off.trace.some((t) => t.kind === "prior" && /season/i.test(JSON.stringify(t))), "the explanation names no season block");
});

test("the choice is stamped in the release profile too, and a result with no reference carries no stamp for a choice it did not use", () => {
  const a = run(release, "south");
  assert.equal(a.meta.seasons, "south");
  assert.equal(a.meta.profile, "release");
  const noModule = assess(release, { subject: person(), redFlags: new Set(), findings: worked, options: { now: MARCH, birthModule: false, seasons: "south" } });
  assert.notEqual(noModule.reference, null, "the season and the year's qi need no birth data");
  assert.equal(noModule.meta.seasons, "south", "so the choice is used, and stamped");
  // a knowledge base whose profile has the five-phase module off: nothing to count seasons for, nothing stamped, the stamp of the parameters unchanged
  const wuxingOff = { ...release, config: { ...release.config, profile: { ...release.config.profile, wuxing: { ...release.config.profile.wuxing, enabled: false } } } } as typeof release;
  const none = assess(wuxingOff, { subject: person(), redFlags: new Set(), findings: worked, options: { now: MARCH, birthModule: false, seasons: "south" } });
  assert.equal(none.reference, null);
  assert.equal("seasons" in none.meta, false);
  assert.equal(none.meta.paramsFingerprint, assess(wuxingOff, { subject: person(), redFlags: new Set(), findings: worked, options: { now: MARCH, birthModule: false } }).meta.paramsFingerprint);
});

test("the other season model is stamped as before and combines with the basis", () => {
  const a = assess(dev, { subject: person(), redFlags: new Set(), findings: worked, options: { now: Date.UTC(2026, 7, 1, 12), birthModule: false, seasonModel: "tuwang18", seasons: "south" } });
  assert.equal(a.meta.seasonModel, "tuwang18");
  assert.equal(a.meta.seasons, "south");
  assert.equal(a.reference!.panel.season.model, "tuwang18");
});

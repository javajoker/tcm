// The season model is a school choice, declared and stamped (docs/post-mvp/design/five-phase-extensions.md §7; task PM-29): the default leaves no trace — a result made with it is exactly what it was —
// and the other model ends the stamp of the parameters, so it starts a series of its own in the history, as the southern basis does. With no season block there is no model to speak of.
import assert from "node:assert/strict";
import { test } from "node:test";
import { assess } from "../src/index.ts";
import type { AssessInput, Findings, Subject } from "../src/index.ts";
import { dev, release } from "./kbs.ts";
import { PARITY } from "./parity.ts";

const BIRTH = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
const person = (over: Partial<Subject> = {}): Subject => ({ ageYears: 35, sex: "female", pregnancy: "no", lactating: false, medications: [], allergies: [], seriousChronicDisease: false, ...over });
const worked: Findings = PARITY.cases.find((c) => c.id === "worked-example")!.findings;
const JULY = Date.UTC(2026, 6, 10, 12);           // 長夏 has begun (小暑, 7 July), and the days of 土 before 立秋 have not
const AUGUST = Date.UTC(2026, 7, 1, 12);          // 長夏 and the days of 土 are the same days
const run = (kb: typeof dev, options: Partial<AssessInput["options"]> = {}, birth = true, now = AUGUST) => assess(kb, {
  subject: person(birth ? { birth: BIRTH } : {}), redFlags: new Set(), findings: worked, options: { now, birthModule: birth, ...options },
});
const NORTH = "c4504d83+4c3e3303";                 // result-stability.test.ts pins the same string (recorded again at PM-52, a knowledge-base change)

test("the default model leaves no trace: naming it is the same as not naming it, and the stamp is the one it always was", () => {
  const plain = run(dev);
  const named = run(dev, { seasonModel: "changxia" });
  assert.deepEqual(named, plain);
  assert.equal(plain.meta.seasonModel, "changxia");
  assert.equal(plain.meta.paramsFingerprint, NORTH);
});

test("the other model ends the stamp of the parameters, so a result made with it is never in the series of one made with the default", () => {
  const a = run(dev, { seasonModel: "tuwang18" });
  assert.equal(a.meta.seasonModel, "tuwang18");
  assert.equal(a.meta.paramsFingerprint, `${NORTH}+tuwang18`);
  assert.notEqual(a.meta.paramsFingerprint, run(dev).meta.paramsFingerprint);
  assert.equal(a.reference!.panel.season.model, "tuwang18");
});

test("it combines with the southern basis, the model first: +tuwang18+south", () => {
  const a = run(dev, { seasonModel: "tuwang18", seasons: "south" });
  assert.equal(a.meta.paramsFingerprint, `${NORTH}+tuwang18+south`);
  assert.equal(a.meta.seasons, "south");
  assert.equal(run(dev, { seasons: "south" }).meta.paramsFingerprint, `${NORTH}+south`, "the default model leaves the southern stamp as PM-26 made it");
});

test("with no seasons there is no model to speak of: the stamp is the one of no seasons, whatever model was asked for", () => {
  const off = run(dev, { seasons: "off" });
  const offOther = run(dev, { seasons: "off", seasonModel: "tuwang18" });
  assert.equal(off.meta.paramsFingerprint, `${NORTH}+noseason`);
  assert.equal(offOther.meta.paramsFingerprint, `${NORTH}+noseason`);
});

test("the two models give the same diagnosis and differ only where a season does: the season block, the forecast and what follows from them", () => {
  const a = run(dev, {}, true, JULY);
  const b = run(dev, { seasonModel: "tuwang18" }, true, JULY);
  assert.deepEqual(b.patterns.map((p) => [p.id, p.pct]), a.patterns.map((p) => [p.id, p.pct]));
  assert.deepEqual(b.verdict.patterns.map((p) => p.id), a.verdict.patterns.map((p) => p.id));
  assert.deepEqual(b.recommendations.formulas.map((f) => f.id), a.recommendations.formulas.map((f) => f.id));
  assert.deepEqual(b.reference!.panel.components.innate, a.reference!.panel.components.innate);
  assert.deepEqual(b.reference!.panel.components.annualBazi, a.reference!.panel.components.annualBazi);
  assert.notDeepEqual(b.reference!.panel.components.season, a.reference!.panel.components.season, "10 July: 長夏 under the first model, still summer under the second");
  assert.deepEqual([a.reference!.panel.season.name, b.reference!.panel.season.name], ["長夏", "夏"]);
});

test("on the days where both models give 土 only the name differs, and the model is still declared", () => {
  const a = run(dev);
  const b = run(dev, { seasonModel: "tuwang18" });
  assert.deepEqual([a.reference!.panel.season.name, b.reference!.panel.season.name], ["長夏", "土旺"]);
  assert.deepEqual(b.reference!.panel.components.season, a.reference!.panel.components.season);
  assert.deepEqual([a.meta.seasonModel, b.meta.seasonModel], ["changxia", "tuwang18"]);
});

test("the release profile carries the same stamps, and a profile with no five-phase module has none", () => {
  assert.equal(run(release, { seasonModel: "tuwang18" }).meta.paramsFingerprint, `${run(release).meta.paramsFingerprint}+tuwang18`);
  const wuxingOff = { ...release, config: { ...release.config, profile: { ...release.config.profile, wuxing: { ...release.config.profile.wuxing, enabled: false } } } } as typeof release;
  const none = run(wuxingOff, { seasonModel: "tuwang18" }, false);
  assert.equal(none.reference, null);
  assert.equal(none.meta.paramsFingerprint, run(wuxingOff, {}, false).meta.paramsFingerprint);
});

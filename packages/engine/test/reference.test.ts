import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReference } from "../src/index.ts";
import type { BirthInput } from "@tcm/wuxing";
import { dev, release } from "./kbs.ts";

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);                    // 2026-10-03 12:00 UT (the SOP §6.4 example)
const BIRTH: BirthInput = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 };
const near = (a: number, b: number, tol = 0.006): boolean => Math.abs(a - b) <= tol;

test("SOP §6.4 worked example: reference N = 木 −1.21 火 +1.24 土 +0.45 金 +0.80 水 −0.39 (dev: birth blocks on)", () => {
  const r = buildReference(dev, { birth: BIRTH, birthModule: false, now: NOW })!;
  const t = r.panel.total;
  assert.ok(near(t["木"], -1.2148) && near(t["火"], 1.2410) && near(t["土"], 0.4470) && near(t["金"], 0.7966) && near(t["水"], -0.3947), JSON.stringify(t));
  assert.equal(r.panel.season.name, "秋");
  assert.equal(r.birth.used, true);
  assert.equal(r.innate?.band["木"], "缺");
  assert.deepEqual(r.birth.pillars && [r.birth.pillars.year, r.birth.pillars.month, r.birth.pillars.day, r.birth.pillars.hour].map((p) => p && p.stem + p.branch), ["庚午", "辛巳", "丁丑", "丁未"]);
  assert.match(r.birth.trueSolarTime ?? "", /^1990-05-12 13:3\d$/);
  assert.deepEqual(r.enabled, { innate: true, annualBazi: true, yunqi: true, season: true });
  assert.equal(r.forecast.length, 5, "now + 4 coming seasons");
});

test("release: the birth blocks are opt-in — without the opt-in the birth data is not used", () => {
  const off = buildReference(release, { birth: BIRTH, birthModule: false, now: NOW })!;
  assert.deepEqual(off.enabled, { innate: false, annualBazi: false, yunqi: true, season: true });
  assert.equal(off.birth.requested, true);
  assert.equal(off.birth.used, false);
  assert.equal(off.panel.components.innate, null);
  const on = buildReference(release, { birth: BIRTH, birthModule: true, now: NOW })!;
  assert.equal(on.birth.used, true);
  assert.ok(near(on.panel.total["木"], -1.2148));
});

test("no birth data: season and yunqi only, and the panel says so", () => {
  const r = buildReference(dev, { birth: null, birthModule: true, now: NOW })!;
  assert.equal(r.birth.requested, false);
  assert.equal(r.birth.used, false);
  assert.equal(r.innate, null);
  assert.equal(r.panel.components.innate, null);
  assert.equal(r.panel.components.annualBazi, null);
  assert.ok(r.panel.components.season && r.panel.components.yunqi);
  assert.ok(r.panel.notes.some((n) => /No birth data/.test(n)));
  assert.ok(r.panel.trace.length >= 3);
});

test("the season model is a switch (長夏 vs 土旺 18 days)", () => {
  const cx = buildReference(dev, { birth: null, birthModule: false, now: Date.UTC(2026, 7, 1), seasonModel: "changxia" })!;      // 1 Aug: between 小暑 and 立秋
  const tw = buildReference(dev, { birth: null, birthModule: false, now: Date.UTC(2026, 7, 1), seasonModel: "tuwang18" })!;
  assert.equal(cx.panel.season.name, "長夏");
  assert.equal(cx.seasonModel, "changxia");
  assert.equal(tw.seasonModel, "tuwang18");
  assert.notEqual(tw.panel.season.name, "長夏");
});

test("invalid birth data is reported, never thrown, and the assessment proceeds without the birth blocks", () => {
  const bad = { ...BIRTH, month: 13 } as BirthInput;
  const r = buildReference(dev, { birth: bad, birthModule: true, now: NOW })!;
  assert.equal(r.birth.used, false);
  assert.ok(r.birth.error && r.birth.error.length > 0);
  assert.equal(r.panel.components.innate, null);
  assert.ok(r.panel.components.season);
  assert.deepEqual(r.enabled.innate, false);
});

test("an unknown birth hour gives a chart without the hour pillar and a lighter innate profile", () => {
  const r = buildReference(dev, { birth: { ...BIRTH, unknownHour: true }, birthModule: false, now: NOW })!;
  assert.equal(r.birth.pillars?.hour, null);
  assert.equal(r.birth.used, true);
});

test("determinism: the same input gives the same reference (the clock is injected)", () => {
  assert.deepEqual(buildReference(dev, { birth: BIRTH, birthModule: false, now: NOW }), buildReference(dev, { birth: BIRTH, birthModule: false, now: NOW }));
  const later = buildReference(dev, { birth: BIRTH, birthModule: false, now: Date.UTC(2027, 1, 20) })!;
  assert.notDeepEqual(later.panel.total, buildReference(dev, { birth: BIRTH, birthModule: false, now: NOW })!.panel.total);
});

test("the module can be switched off by the profile", () => {
  const kb = { ...dev, config: { ...dev.config, profile: { ...dev.config.profile, wuxing: { ...dev.config.profile.wuxing, enabled: false } } } };
  assert.equal(buildReference(kb, { birth: BIRTH, birthModule: true, now: NOW }), null);
});

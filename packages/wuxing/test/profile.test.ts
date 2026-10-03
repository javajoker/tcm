import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildChart, buildBase, innateProfile, buildReferencePanel, forecastReferencePanels, seasonAt, transmission, bandOf, analyzeOffset,
  DEFAULT_PROFILE_PARAMS, ELEMENTS, toJulianDay, type BirthInput, type ProfileParams,
} from "../src/index.ts";

const birth: BirthInput = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 };
const jd = (y: number, m: number, d: number): number => toJulianDay({ year: y, month: m, day: d, hour: 12, minute: 0, second: 0 });

test("innate profile: shares sum to 1, degrees are capped, bands follow the thresholds", () => {
  const base = buildBase(buildChart(birth));
  const ip = innateProfile(base);
  assert.ok(Math.abs(ELEMENTS.reduce((a, e) => a + ip.shares[e], 0) - 1) < 1e-12);
  for (const e of ELEMENTS) assert.ok(Math.abs(ip.degree[e]) <= DEFAULT_PROFILE_PARAMS.innate.cap + 1e-12);
  // 1990-05-12 chart: 木 is nearly absent (≈1 %), 水 is thin (≈5 %); 火 土 are rich.
  assert.equal(ip.band["木"], "缺");
  assert.deepEqual(ip.missing, ["木"]);
  assert.ok(Math.abs(ip.degree["木"] - ip.relative["木"]) < 1e-12 && ip.degree["木"] < -0.9);   // r = −0.94 is inside the cap
  assert.ok(ip.degree["火"] > 0);
});

test("bands: 缺 / 偏弱 / 平 / 偏旺 / 過旺 at the documented cut points", () => {
  const p = DEFAULT_PROFILE_PARAMS;
  assert.equal(bandOf(0.04, p), "缺");
  assert.equal(bandOf(0.1, p), "偏弱");     // r = −0.5
  assert.equal(bandOf(0.2, p), "平");
  assert.equal(bandOf(0.3, p), "偏旺");     // r = +0.5
  assert.equal(bandOf(0.4, p), "過旺");     // r = +1.0
});

test("season: changxia model boundaries and 土旺 in the tuwang18 model", () => {
  assert.equal(seasonAt(jd(2026, 4, 15)).element, "木");
  assert.equal(seasonAt(jd(2026, 6, 10)).element, "火");
  assert.equal(seasonAt(jd(2026, 7, 20)).name, "長夏");
  assert.equal(seasonAt(jd(2026, 10, 3)).element, "金");
  assert.equal(seasonAt(jd(2026, 12, 15)).element, "水");
  assert.equal(seasonAt(jd(2026, 1, 25)).element, "水");   // before 立春 is still winter
  // tuwang18: the 18 days before 立冬 (7 Nov) belong to 土
  assert.equal(seasonAt(jd(2026, 10, 25), "tuwang18").element, "土");
  assert.equal(seasonAt(jd(2026, 10, 3), "tuwang18").element, "金");
  assert.equal(seasonAt(jd(2026, 7, 5), "tuwang18").element, "火");
  assert.equal(seasonAt(jd(2026, 7, 25), "tuwang18").element, "土");   // within 18 days before 立秋
});

test("reference panel: components, cap and zangfu mapping (norm shifts 氣 and 陽, not 血 and 陰)", () => {
  const base = buildBase(buildChart(birth));
  const panel = buildReferencePanel(base, jd(2026, 10, 3));
  assert.ok(panel.components.innate && panel.components.annualBazi && panel.components.yunqi && panel.components.season);
  for (const e of ELEMENTS) {
    assert.ok(Math.abs(panel.total[e]) <= DEFAULT_PROFILE_PARAMS.totalCap + 1e-12);
    const z = panel.zangfu[e];
    assert.equal(z.qi, panel.total[e]);
    assert.equal(z.yang, panel.total[e]);
    assert.equal(z.blood, 0);
    assert.equal(z.yin, 0);
  }
  assert.equal(panel.zangfu["木"].zang, "肝");
  assert.equal(panel.zangfu["水"].fu, "膀胱");
  assert.equal(panel.baziYear, 2026);
  assert.equal(panel.yunqiYear, 2026);
  assert.equal(panel.season.element, "金");
  assert.ok(panel.trace.length >= 5);
});

test("reference panel without birth data keeps only the yunqi and season blocks and says so", () => {
  const panel = buildReferencePanel(null, jd(2026, 10, 3));
  assert.equal(panel.components.innate, null);
  assert.equal(panel.components.annualBazi, null);
  assert.ok(panel.components.yunqi && panel.components.season);
  assert.ok(panel.notes.some((n) => n.includes("No birth data")));
});

test("each block can be switched off independently and the total follows", () => {
  const base = buildBase(buildChart(birth));
  const only = (k: keyof ProfileParams["enable"]): ProfileParams => ({ ...DEFAULT_PROFILE_PARAMS, enable: { innate: false, annualBazi: false, yunqi: false, season: false, [k]: true } });
  const season = buildReferencePanel(base, jd(2026, 10, 3), only("season"));
  assert.equal(season.components.innate, null);
  for (const e of ELEMENTS) assert.equal(season.total[e], (season.components.season as Record<string, number>)[e]);
  const none = buildReferencePanel(base, jd(2026, 10, 3), { ...DEFAULT_PROFILE_PARAMS, enable: { innate: false, annualBazi: false, yunqi: false, season: false } });
  for (const e of ELEMENTS) assert.equal(none.total[e], 0);
});

test("climate vector is bounded by the configured weights", () => {
  const panel = buildReferencePanel(null, jd(2026, 10, 3));
  const w = DEFAULT_PROFILE_PARAMS.climate;
  const total = Object.values(panel.climate).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - (w.siTian + w.zaiQuan + w.guest + w.host)) < 1e-12);
});

test("forecast: current panel plus the next seasons, in chronological order", () => {
  const base = buildBase(buildChart(birth));
  const panels = forecastReferencePanels(base, jd(2026, 10, 3), 4);
  assert.equal(panels.length, 5);
  for (let i = 1; i < panels.length; i++) assert.ok((panels[i] as { jdUT: number }).jdUT > (panels[i - 1] as { jdUT: number }).jdUT);
  // From early October: 冬 (立冬) → 春 (立春) → 夏 (立夏) → 長夏 (小暑)
  assert.deepEqual(panels.slice(1).map((p) => p.season.name), ["冬", "春", "夏", "長夏"]);
});

test("transmission: excess 木 pressures 土 (制己所勝) and drains 水 (子盜母氣); deficient 木 deepens itself and starves 火 (母病及子)", () => {
  const excess = transmission({ 木: 2, 火: 0, 土: 0, 金: 0, 水: 0 });
  assert.ok(excess.pressure["土"] < 0);
  assert.ok(excess.pressure["金"] < 0);       // 侮所不勝: 金 is what controls 木
  assert.ok(excess.pressure["水"] < 0);       // 子盜母氣: 水 is the mother of 木
  assert.equal(excess.rules[0]?.rule, "制己所勝");
  assert.equal(excess.rules[0]?.to, "土");
  const deficient = transmission({ 木: -2, 火: 0, 土: 0, 金: 0, 水: 0 });
  assert.ok(deficient.pressure["木"] < 0);
  assert.ok(deficient.pressure["火"] < 0);
  assert.deepEqual(Object.values(transmission({ 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 }).pressure), [0, 0, 0, 0, 0]);
});

test("offset analysis: the population offset is never reduced by a prior; the personal offset and alignment are context only", () => {
  const reference = { total: { 木: -1.2, 火: 1.0, 土: 0.1, 金: 0.8, 水: -0.4 } };
  const observed = { 木: -1, 火: -0.5, 土: 0.5, 金: 0, 水: -1 };
  const a = analyzeOffset(observed, reference);
  // Primary offset equals the observation exactly, whatever the reference says.
  for (const e of ELEMENTS) assert.equal(a.offsetPopulation[e], observed[e]);
  assert.ok(Math.abs(a.offsetPersonal["木"] - 0.2) < 1e-12);      // −1 − (−1.2): "as expected" for this person …
  assert.equal(a.offsetPopulation["木"], -1);                       // … yet still −1 against the average person
  assert.equal(a.alignment["木"], "aligned");                       // weak 木 and a weak-木 tendency
  assert.equal(a.alignment["火"], "opposed");                       // observed low, tendency high
  assert.equal(a.alignment["土"], "neutral");                       // reference 0.1 is below the threshold
  assert.equal(a.alignment["金"], "neutral");                       // nothing observed
  assert.equal(a.alignment["水"], "aligned");
});

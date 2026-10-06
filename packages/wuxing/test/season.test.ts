// The season on the southern basis (docs/post-mvp/design/five-phase-extensions.md §4, §9; task PM-26): the northern answer never changes, the southern one is the northern one at the Sun's longitude + 180°, the
// calendar constructs do not move, and a default parameter leaves no trace.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";
import {
  apparentSolarLongitude, asTT, buildReferencePanel, DEFAULT_PROFILE_PARAMS, forecastReferencePanels, millisToJulianDay, seasonAt, utToTT,
  type Element, type ProfileParams, type SeasonModel,
} from "../src/index.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const jd = (ms: number): number => millisToJulianDay(ms);
const lambdaAt = (ms: number): number => apparentSolarLongitude(asTT(utToTT(jd(ms))));
const norm = (x: number): number => ((x % 360) + 360) % 360;

/** The element the northern lookup gives at a longitude — written out here, from the rule in the doc comment of seasonAt, not copied from it. */
const northChangxia = (l: number): Element => (norm(l - 315) < 90 ? "木" : norm(l - 45) < 60 ? "火" : norm(l - 105) < 30 ? "土" : norm(l - 135) < 90 ? "金" : "水");
const northFour = (l: number): Element => (norm(l - 315) < 90 ? "木" : norm(l - 45) < 90 ? "火" : norm(l - 135) < 90 ? "金" : "水");

test("the northern answer is the one recorded before the southern basis existed: every fifth day of two centuries, both models", () => {
  const golden = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "season-north.json"), "utf8")) as { _meta: { start: string; stepDays: number } } & Record<SeasonModel, string>;
  const start = Date.parse(golden._meta.start);
  assert.ok(Number.isFinite(start), "the fixture says where it starts");
  for (const model of ["changxia", "tuwang18"] as const) {
    let wrong = 0;
    const letters = golden[model];
    for (let i = 0; i < letters.length; i++) {
      const got = seasonAt(jd(start + i * golden._meta.stepDays * DAY), model).element;
      if (got !== letters[i]) wrong += 1;
    }
    assert.equal(wrong, 0, `${model}: ${wrong} of ${letters.length} days differ from the recording`);
    assert.equal(letters.length, 14610);
  }
});

test("the default is the northern basis, and naming it changes nothing — not even a key of the result", () => {
  const start = Date.UTC(2026, 0, 1, 12);
  for (let d = 0; d < 366; d += 7) {
    for (const model of ["changxia", "tuwang18"] as const) {
      const plain = seasonAt(jd(start + d * DAY), model);
      assert.deepEqual(seasonAt(jd(start + d * DAY), model, "north"), plain);
      assert.deepEqual(Object.keys(plain).sort(), ["element", "longitude", "model", "name"], "a northern season carries nothing about a hemisphere");
    }
  }
});

test("a southern season is the northern one at the Sun's longitude + 180°: spring where the north has autumn", () => {
  let checked = 0;
  for (let i = 0; i < 3000; i++) {
    const ms = Date.UTC(1950, 0, 1) + i * 8.3 * DAY;
    const l = lambdaAt(ms);
    const south = seasonAt(jd(ms), "changxia", "south");
    assert.equal(south.element, northChangxia(l + 180), `λ=${l.toFixed(2)}`);
    assert.equal(south.hemisphere, "south");
    assert.equal(south.longitude, l, "the longitude reported is the calendar's: it is the same Sun");
    checked += 1;
  }
  assert.equal(checked, 3000);
});

test("the named dates: March is autumn and December summer in the south, and the south has its own long summer from early January", () => {
  const at = (y: number, m: number, d: number, basis: "north" | "south", model: SeasonModel = "changxia") => seasonAt(jd(Date.UTC(y, m - 1, d, 12)), model, basis);
  assert.deepEqual([at(2026, 3, 20, "north").name, at(2026, 3, 20, "south").name], ["春", "秋"]);
  assert.deepEqual([at(2026, 6, 25, "north").name, at(2026, 6, 25, "south").name], ["夏", "冬"]);
  assert.deepEqual([at(2026, 9, 25, "north").name, at(2026, 9, 25, "south").name], ["秋", "春"]);
  assert.deepEqual([at(2026, 12, 25, "north").name, at(2026, 12, 25, "south").name], ["冬", "夏"]);
  assert.deepEqual([at(2026, 1, 20, "north").name, at(2026, 1, 20, "south").name], ["冬", "長夏"]);
  assert.deepEqual([at(2026, 7, 20, "north").name, at(2026, 7, 20, "south").name], ["長夏", "冬"]);
});

test("the second model: the days of 土 are the same days in both hemispheres, and every other day flips", () => {
  let earth = 0;
  for (let i = 0; i < 4000; i++) {
    const ms = Date.UTC(1960, 0, 1) + i * 6.7 * DAY;
    const l = lambdaAt(ms);
    const n = seasonAt(jd(ms), "tuwang18", "north");
    const s = seasonAt(jd(ms), "tuwang18", "south");
    assert.equal(n.element === "土", s.element === "土", `${new Date(ms).toISOString()}: the same days of 土`);
    if (s.element === "土") earth += 1;
    else assert.equal(s.element, northFour(l + 180), `λ=${l.toFixed(2)}`);
  }
  assert.ok(earth > 200, "the property is not vacuous: 土 commands about a fifth of the year");
});

test("the 18 days of 土 are the 18 days before each of the four 立 terms, in both hemispheres", () => {
  // 立春 2026 is 4 February at about 14:00 UTC: the days before it, and not the days after
  const li = Date.UTC(2026, 1, 4, 14);
  for (const basis of ["north", "south"] as const) {
    assert.equal(seasonAt(jd(li - 10 * DAY), "tuwang18", basis).element, "土", `${basis}, ten days before`);
    assert.notEqual(seasonAt(jd(li - 20 * DAY), "tuwang18", basis).element, "土", `${basis}, twenty days before`);
    assert.notEqual(seasonAt(jd(li + 2 * DAY), "tuwang18", basis).element, "土", `${basis}, after`);
  }
});

test("the southern forecast lists the seasons in the order the person lives them", () => {
  const from = jd(Date.UTC(2026, 2, 20, 12));
  const order = (basis: ProfileParams["hemisphere"]): Element[] => forecastReferencePanels(null, from, 4, { ...DEFAULT_PROFILE_PARAMS, ...(basis ? { hemisphere: basis } : {}) }).map((p) => p.season.element);
  assert.deepEqual(order(undefined), ["木", "火", "土", "金", "水"], "the north from the equinox: spring, summer, long summer, autumn, winter");
  assert.deepEqual(order("north"), order(undefined));
  assert.deepEqual(order("south"), ["金", "水", "木", "火", "土"], "the south from the same day: autumn, winter, spring, summer, long summer");
  // each forecast panel is the first moment of its season
  for (const p of forecastReferencePanels(null, from, 4, { ...DEFAULT_PROFILE_PARAMS, hemisphere: "south" })) assert.equal(p.season.hemisphere, "south");
});

test("only the season moves: the annual block, the climate and the year's qi are calendar constructs and are the same in the south", () => {
  for (const ms of [Date.UTC(2026, 2, 20, 12), Date.UTC(2026, 7, 8, 12), Date.UTC(2026, 11, 25, 12)]) {
    const n = buildReferencePanel(null, jd(ms), DEFAULT_PROFILE_PARAMS);
    const s = buildReferencePanel(null, jd(ms), { ...DEFAULT_PROFILE_PARAMS, hemisphere: "south" });
    assert.deepEqual(s.components.yunqi, n.components.yunqi);
    assert.deepEqual(s.climate, n.climate);
    assert.deepEqual(s.yunqi, n.yunqi);
    assert.equal(s.baziYear, n.baziYear);
    assert.notDeepEqual(s.components.season, n.components.season, "the season block is the one thing that follows the person");
    assert.notEqual(s.season.element, n.season.element);
    assert.match(s.trace.find((t) => t.startsWith("Season "))!, /southern basis/);
    assert.doesNotMatch(n.trace.find((t) => t.startsWith("Season "))!, /southern/);
  }
});

test("a northern panel with the basis named is the northern panel, and the defaults do not carry the parameter at all", () => {
  assert.equal("hemisphere" in DEFAULT_PROFILE_PARAMS, false);
  const ms = Date.UTC(2026, 9, 3, 12);
  assert.deepEqual(buildReferencePanel(null, jd(ms), { ...DEFAULT_PROFILE_PARAMS, hemisphere: "north" }), buildReferencePanel(null, jd(ms), DEFAULT_PROFILE_PARAMS));
});

test("flipping the season never changes a chart: the season block is the only thing that depends on the basis", () => {
  const ms = Date.UTC(2026, 4, 5, 12);
  const s = buildReferencePanel(null, jd(ms), { ...DEFAULT_PROFILE_PARAMS, hemisphere: "south" });
  const n = buildReferencePanel(null, jd(ms), DEFAULT_PROFILE_PARAMS);
  assert.deepEqual(s.components.innate, n.components.innate);
  assert.deepEqual(s.components.annualBazi, n.components.annualBazi);
});

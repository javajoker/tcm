import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STEMS, BRANCHES, suiYunOf, SITIAN_OF_BRANCH, SIX_QI_ORDER, zaiQuanOf, guestQiOf, yunqiOfYear, yunqiAt, daHanOf,
  yunqiYearNumberAt, stepOfLongitude, HOST_QI, QI_ELEMENT, toJulianDay, CONTROLS,
} from "../src/index.ts";

test("歲運 from the year stem: 甲己土 乙庚金 丙辛水 丁壬木 戊癸火; 陽 stem 太過, 陰 stem 不及", () => {
  const expected: Record<string, string> = { 甲: "土", 己: "土", 乙: "金", 庚: "金", 丙: "水", 辛: "水", 丁: "木", 壬: "木", 戊: "火", 癸: "火" };
  for (const s of STEMS) {
    const r = suiYunOf(s);
    assert.equal(r.element, expected[s], s);
    assert.equal(r.kind, STEMS.indexOf(s) % 2 === 0 ? "太過" : "不及", s);
  }
});

test("司天 by branch and 在泉 as the opposite qi (《素問·天元紀大論》/《六元正紀大論》)", () => {
  assert.equal(SITIAN_OF_BRANCH.子, "少陰君火");
  assert.equal(SITIAN_OF_BRANCH.午, "少陰君火");
  assert.equal(SITIAN_OF_BRANCH.丑, "太陰濕土");
  assert.equal(SITIAN_OF_BRANCH.寅, "少陽相火");
  assert.equal(SITIAN_OF_BRANCH.卯, "陽明燥金");
  assert.equal(SITIAN_OF_BRANCH.辰, "太陽寒水");
  assert.equal(SITIAN_OF_BRANCH.巳, "厥陰風木");
  const pairs: [string, string][] = [["少陰君火", "陽明燥金"], ["太陰濕土", "太陽寒水"], ["少陽相火", "厥陰風木"], ["陽明燥金", "少陰君火"], ["太陽寒水", "太陰濕土"], ["厥陰風木", "少陽相火"]];
  for (const [d, z] of pairs) assert.equal(zaiQuanOf(d as never), z);
  // Branches six apart share a 司天 (子午, 丑未, …).
  for (let i = 0; i < 6; i++) assert.equal(SITIAN_OF_BRANCH[BRANCHES[i] as never], SITIAN_OF_BRANCH[BRANCHES[i + 6] as never]);
});

test("guest qi: 司天 is step 3, 在泉 is step 6, order follows 厥陰→少陰→太陰→少陽→陽明→太陽", () => {
  for (const siTian of SIX_QI_ORDER) {
    assert.equal(guestQiOf(siTian, 3), siTian);
    assert.equal(guestQiOf(siTian, 6), zaiQuanOf(siTian));
    for (let k = 1; k < 6; k++) {
      const a = SIX_QI_ORDER.indexOf(guestQiOf(siTian, k));
      const b = SIX_QI_ORDER.indexOf(guestQiOf(siTian, k + 1));
      assert.equal((a + 1) % 6, b);
    }
  }
  // 子午 years: 初之氣 太陽寒水, 二 厥陰風木, 三 少陰君火 (司天), 四 太陰濕土, 五 少陽相火, 終 陽明燥金.
  assert.deepEqual(yunqiOfYear(2026 - 12).guestQi, ["太陽寒水", "厥陰風木", "少陰君火", "太陰濕土", "少陽相火", "陽明燥金"]);
});

test("2026 丙午: 水運太過, 少陰君火司天, 陽明燥金在泉", () => {
  const y = yunqiOfYear(2026);
  assert.equal(y.stem + y.branch, "丙午");
  assert.deepEqual(y.suiYun, { element: "水", kind: "太過" });
  assert.equal(y.siTian, "少陰君火");
  assert.equal(y.zaiQuan, "陽明燥金");
});

test("the yunqi year changes at 大寒, ~2 weeks before 立春", () => {
  const dahan = daHanOf(2026);
  assert.equal(yunqiYearNumberAt(dahan - 0.01), 2025);
  assert.equal(yunqiYearNumberAt(dahan + 0.01), 2026);
  assert.equal(yunqiYearNumberAt(toJulianDay({ year: 2026, month: 1, day: 10, hour: 0, minute: 0, second: 0 })), 2025);
  assert.equal(yunqiYearNumberAt(toJulianDay({ year: 2026, month: 12, day: 25, hour: 0, minute: 0, second: 0 })), 2026);
});

test("step of the year from solar longitude: 初 300–0°, 二 0–60°, 三 60–120°, 四 120–180°, 五 180–240°, 終 240–300°", () => {
  const cases: [number, number][] = [[300, 1], [359.9, 1], [0, 2], [59.9, 2], [60, 3], [119.9, 3], [120, 4], [179.9, 4], [180, 5], [239.9, 5], [240, 6], [299.9, 6]];
  for (const [lambda, step] of cases) assert.equal(stepOfLongitude(lambda), step, `${lambda}°`);
  assert.deepEqual(HOST_QI.map((q) => QI_ELEMENT[q]), ["木", "火", "火", "土", "金", "水"]);
});

test("yunqiAt: early October 2026 is step 5 (陽明燥金 host); guest/host relation is classified", () => {
  const m = yunqiAt(toJulianDay({ year: 2026, month: 10, day: 3, hour: 12, minute: 0, second: 0 }));
  assert.equal(m.yunqi.year, 2026);
  assert.equal(m.step, 5);
  assert.equal(m.hostQi, "陽明燥金");
  assert.equal(m.guestQi, "少陽相火");                      // 子午 pattern, step 5
  assert.equal(CONTROLS[QI_ELEMENT[m.guestQi]], QI_ELEMENT[m.hostQi]);   // 火 克 金
  assert.equal(m.relation, "guestControlsHost");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BRANCHES, ELEMENTS, STEMS, HIDDEN_STEMS, SILING, GENERATES, CONTROLS, MONTH_BRANCH_ORDER,
  elementOf, polarityOf, branchElement, branchQiPolarity, stemAt, branchAt, mod, actingRelation,
  generatedBy, controlledBy, yinMonthStemOf, monthStemOf, ziHourStemOf, hourStemOf,
  sexagenaryAt, sexagenaryIndexOf, isValidPair, stepStem, stepBranch,
} from "../src/index.ts";
import { silingOf } from "../src/chart.ts";

test("stem element and polarity match the literal table", () => {
  const literal: Record<string, [string, string]> = {
    甲: ["木", "陽"], 乙: ["木", "陰"], 丙: ["火", "陽"], 丁: ["火", "陰"], 戊: ["土", "陽"],
    己: ["土", "陰"], 庚: ["金", "陽"], 辛: ["金", "陰"], 壬: ["水", "陽"], 癸: ["水", "陰"],
  };
  for (const s of STEMS) assert.deepEqual([elementOf(s), polarityOf(s)], literal[s], s);
});

test("hidden stems: 3 single (子卯酉), 2 double (午亥), 7 triple", () => {
  const sizes = BRANCHES.map((b) => (HIDDEN_STEMS[b] as readonly string[]).length);
  assert.equal(sizes.filter((n) => n === 1).length, 3);
  assert.equal(sizes.filter((n) => n === 2).length, 2);
  assert.equal(sizes.filter((n) => n === 3).length, 7);
  for (const b of ["子", "卯", "酉"] as const) assert.equal(HIDDEN_STEMS[b].length, 1);
  for (const b of ["午", "亥"] as const) assert.equal(HIDDEN_STEMS[b].length, 2);
});

test("branch principal element = element of principal hidden stem", () => {
  const literal = { 子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火", 午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水" } as const;
  for (const b of BRANCHES) assert.equal(branchElement(b), literal[b], b);
});

test("qi polarity differs from positional polarity exactly for 子午巳亥 (體陰用陽)", () => {
  const differing = BRANCHES.filter((b, i) => (i % 2 === 0 ? "陽" : "陰") !== branchQiPolarity(b));
  assert.deepEqual([...differing].sort(), ["亥", "午", "子", "巳"].sort());
});

test("generation and restraint are 5-cycles and mutually consistent", () => {
  let e = "木" as (typeof ELEMENTS)[number];
  for (let i = 0; i < 5; i++) e = GENERATES[e];
  assert.equal(e, "木");
  e = "木";
  for (let i = 0; i < 5; i++) e = CONTROLS[e];
  assert.equal(e, "木");
  for (const x of ELEMENTS) {
    assert.equal(GENERATES[generatedBy(x)], x);
    assert.equal(CONTROLS[controlledBy(x)], x);
    assert.equal(actingRelation(x, x), "同");
    assert.equal(actingRelation(x, GENERATES[x]), "生");
    assert.equal(actingRelation(x, CONTROLS[x]), "克");
    assert.equal(actingRelation(GENERATES[x], x), "無");   // the reverse direction never acts
    assert.equal(actingRelation(CONTROLS[x], x), "無");
  }
});

test("五虎遁: stem of 寅 month", () => {
  const expected: Record<string, string> = { 甲: "丙", 己: "丙", 乙: "戊", 庚: "戊", 丙: "庚", 辛: "庚", 丁: "壬", 壬: "壬", 戊: "甲", 癸: "甲" };
  for (const [y, m] of Object.entries(expected)) assert.equal(yinMonthStemOf(y as never), m, y);
  assert.equal(monthStemOf("庚", "巳"), "辛");   // 庚午 year: 寅=戊 … 巳=辛
  assert.equal(monthStemOf("甲", "丑"), "丁");   // 甲 year: 寅=丙 … 丑=丁
});

test("五鼠遁: stem of 子 hour", () => {
  const expected: Record<string, string> = { 甲: "甲", 己: "甲", 乙: "丙", 庚: "丙", 丙: "戊", 辛: "戊", 丁: "庚", 壬: "庚", 戊: "壬", 癸: "壬" };
  for (const [d, h] of Object.entries(expected)) assert.equal(ziHourStemOf(d as never), h, d);
  assert.equal(hourStemOf("丁", "未"), "丁");   // 丁 day: 子=庚 … 未(+7)=丁
});

test("sexagenary cycle: 60 unique valid pairs, index round-trips, 甲子=0 癸亥=59", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const p = sexagenaryAt(i);
    assert.ok(isValidPair(p.stem, p.branch));
    seen.add(p.stem + p.branch);
    assert.equal(sexagenaryIndexOf(p), i);
  }
  assert.equal(seen.size, 60);
  assert.deepEqual(sexagenaryAt(0), { stem: "甲", branch: "子" });
  assert.deepEqual(sexagenaryAt(59), { stem: "癸", branch: "亥" });
  assert.throws(() => sexagenaryIndexOf({ stem: "甲", branch: "丑" }));
});

test("mod is non-negative and stepping wraps both ways", () => {
  assert.equal(mod(-1, 10), 9);
  assert.equal(stemAt(-1), "癸");
  assert.equal(branchAt(-1), "亥");
  assert.equal(stepStem("甲", -1), "癸");
  assert.equal(stepBranch("子", 12), "子");
});

test("司令 segments cover 30 days; only 亥's first segment is unresolvable", () => {
  const unresolvable: string[] = [];
  for (const b of MONTH_BRANCH_ORDER) {
    const days = (SILING[b] as readonly { days: number }[]).reduce((a, s) => a + s.days, 0);
    assert.equal(days, 30, b);
    const segs = SILING[b] as readonly { stem: (typeof STEMS)[number] }[];
    segs.forEach((seg, i) => {
      const info = silingOf(b, (SILING[b] as readonly { days: number }[]).slice(0, i).reduce((a, s) => a + s.days, 0) + 0.1);
      if (info.resolution === "unresolvable") unresolvable.push(`${b}#${i}:${seg.stem}`);
    });
  }
  assert.deepEqual(unresolvable, ["亥#0:戊"]);
});

test("司令 stems that are not hidden in the branch resolve by same element: 子→癸 卯→乙 午→丁 酉→辛", () => {
  assert.equal(silingOf("子", 1).resolvedTo, "癸");
  assert.equal(silingOf("卯", 1).resolvedTo, "乙");
  assert.equal(silingOf("午", 1).resolvedTo, "丁");
  assert.equal(silingOf("酉", 1).resolvedTo, "辛");
  assert.equal(silingOf("子", 1).resolution, "sameElement");
  assert.equal(silingOf("寅", 10).resolution, "exact");
});

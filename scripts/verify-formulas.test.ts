// The formula verification report (PM-39): current, complete, read-only, and it lists what fails.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { verifyLibrary } from "../packages/engine/src/index.ts";
import type { Formula } from "../packages/kb/src/types.ts";
import { REPORT, build, inputs, render } from "./verify-formulas.ts";

const inp = inputs();
const report = verifyLibrary(inp);
const idOf = (name: string): string => [...inp.herbs.values()].find((h) => h.name["zh-Hant"] === name)!.id;

test("the committed report is what the knowledge base gives", () => {
  assert.equal(readFileSync(REPORT, "utf8"), build(), "docs/formula-verification.md is stale: run `node scripts/verify-formulas.ts`");
});

test("every formula of the library is verified once, and the report names each", () => {
  assert.deepEqual(report.map((r) => r.formula), [...inp.kb.formulas.keys()].sort());
  const text = render(report, inp);
  for (const f of inp.kb.formulas.values()) assert.ok(text.includes(`| ${f.name["zh-Hant"]} |`), f.id);
});

test("the verification changes nothing: the knowledge base and the data files are as they were", () => {
  const file = join(import.meta.dirname, "..", "data", "formulas", "formulas.json");
  const hash = (): string => createHash("sha256").update(readFileSync(file)).digest("hex");
  const before = hash(), formulas = JSON.stringify([...inp.kb.formulas.values()]);
  verifyLibrary(inp);
  assert.equal(hash(), before);
  assert.equal(JSON.stringify([...inp.kb.formulas.values()]), formulas);
});

test("a check that fails is listed, never fixed: a threshold no formula can meet puts every formula in the findings", () => {
  const strict = verifyLibrary({ ...inp, tables: { ...inp.tables, params: { ...inp.tables.params, verification: { ...inp.tables.params.verification, cosine_min: 1.01 } } } });
  assert.ok(strict.every((r) => r.findings.includes("effect")));
});

test("an incompatible pair is a safety finding: 人參 with 藜蘆 (諸參辛芍叛藜蘆)", () => {
  const base = inp.kb.formulas.get("F_SIJUNZI")!;
  const row = base.composition[0]!;
  const bad: Formula = { ...base, composition: [...base.composition, { ...row, herb: idOf("藜蘆"), name: "藜蘆", role: "佐" }] };
  const kb = { ...inp.kb, formulas: new Map([...inp.kb.formulas].map(([id, f]) => [id, id === base.id ? bad : f] as const)) };
  const r = verifyLibrary({ ...inp, kb }).find((x) => x.formula === base.id)!;
  assert.ok(!r.safety.pass && r.findings.includes("safety"));
  assert.deepEqual(r.safety.incompatible, [["藜蘆", "人參"]]);
});

test("the findings the first reading reported stay visible: 桂枝湯 for its own patterns, the classical 相惡 inside 小柴胡湯", () => {
  const guizhi = report.find((r) => r.formula === "F_GUIZHI")!;
  assert.ok(guizhi.findings.includes("indication:EX2"));
  const xiaochaihu = report.find((r) => r.formula === "F_XIAOCHAIHU")!;
  assert.ok(xiaochaihu.safety.opposed.some((p) => p.herb === idOf("生薑") && p.other === idOf("黃芩")));
});

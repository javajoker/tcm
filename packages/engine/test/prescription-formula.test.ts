// The prescription model, part 2 (PM-38): a formula's action from its herbs, each herb's exact share, the roles measured, the 方解 in numbers.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { DoseBands, Formula, Herb, Herbs, Pairings, Prescription, Processing, Yinjing } from "@tcm/kb";
import { analyseFormula, classicalRows, compositionAction, contributions, dimensionWeight, formulaMechanism, normalize, scorePatterns, synthesizePanel, type PrescriptionTables } from "../src/index.ts";
import type { Findings } from "../src/index.ts";
import { dev, release } from "./kbs.ts";
import { PARITY } from "./parity.ts";

const data = <T>(rel: string): T => JSON.parse(readFileSync(new URL(`../../../data/${rel}`, import.meta.url), "utf8")) as T;
const herbs = new Map(data<Herbs>("herbs/herbs.json").items.map((h) => [h.id, h] as const)) as ReadonlyMap<string, Herb>;
const nameOf = (id: string): string => herbs.get(id)!.name["zh-Hant"];
const idOf = (name: string): string => [...herbs.values()].find((h) => h.name["zh-Hant"] === name)!.id;
const tables: PrescriptionTables = {
  params: data<Prescription>("treatment/prescription.json").params,
  pairings: data<Pairings>("herbs/pairings.json").items,
  processing: data<Processing>("herbs/processing.json").methods,
  doseBands: data<DoseBands>("herbs/dose-bands.json").items,
  yinjing: data<Yinjing>("herbs/yinjing.json").channels,
};
const formula = (id: string): Formula => dev.formulas.get(id) ?? assert.fail(`no formula ${id}`);
const deviationOf = (patternId: string) => {
  const findings = PARITY.cases.find((c) => c.id === `typical-${patternId}`)!.findings as Findings;
  const n = normalize(dev, { findings, sex: "female", pregnancy: "no" });
  return synthesizePanel(dev, scorePatterns(dev, n), null).observed;
};

test("the formula at its own amounts: every row relative to its herb's typical dose; nothing to compute in a bundle without amounts", () => {
  const r = classicalRows(formula("F_SIJUNZI"), herbs)!;
  assert.deepEqual(r.rows.map((x) => nameOf(x.herb)), ["人參", "白朮", "茯苓", "炙甘草"]);
  assert.ok(r.rows.every((x) => x.x > 0));
  assert.deepEqual(r.atTypical, []);
  assert.equal(classicalRows(release.formulas.get("F_SIJUNZI")!, herbs), null, "a release bundle has no amounts");
  const yiwei = classicalRows(formula("F_YIWEI"), herbs)!;
  assert.ok(yiwei.atTypical.includes(idOf("冰糖")), "a herb without a Pharmacopoeia range is taken at its typical dose");
});

test("each herb's share sums exactly to the formula's action, for every formula of the library", () => {
  for (const f of dev.formulas.values()) {
    const a = analyseFormula(dev, f, herbs, tables)!;
    const sums = new Map<string, number>();
    for (const c of a.contributions) for (const [d, x] of Object.entries(c.total)) sums.set(d, (sums.get(d) ?? 0) + x);
    for (const [d, x] of Object.entries(a.action.total)) assert.ok(Math.abs((sums.get(d) ?? 0) - x) < 1e-9, `${f.id} ${d}`);
    assert.equal(a.contributions.length, f.composition.length);
  }
});

test("a pairing is credited half to each side: 茯苓 shares in the strengthening it gives 人參 (四君子湯)", () => {
  const a = analyseFormula(dev, formula("F_SIJUNZI"), herbs, tables)!;
  assert.ok(a.action.applied.some((p) => p.type === "相使" && p.herb === idOf("人參") && p.other === idOf("茯苓")));
  const poria = a.contributions.find((c) => c.herb === idOf("茯苓"))!, ginseng = a.contributions.find((c) => c.herb === idOf("人參"))!;
  const dim = a.action.applied.find((p) => p.herb === idOf("人參") && p.other === idOf("茯苓"))!.dimensions[0]!;
  assert.ok((poria.paired[dim] ?? 0) > 0 && Math.abs((poria.paired[dim] ?? 0) - (ginseng.paired[dim] ?? 0)) < 1e-12, "half each");
});

test("the roles, measured: every herb of every formula is read, and the classical readings appear where the classics put them", () => {
  for (const f of dev.formulas.values()) {
    const a = analyseFormula(dev, f, herbs, tables)!;
    assert.equal(a.roles.checks.length, f.composition.length);
    assert.ok(a.roles.principal !== null);
    const shares = a.roles.checks.reduce((s, c) => s + c.principalShare, 0);
    assert.ok(Math.abs(shares - 1) < 1e-9, `${f.id}: principal shares sum to 1`);
  }
  const xiaochaihu = analyseFormula(dev, formula("F_XIAOCHAIHU"), herbs, tables)!;
  assert.ok(xiaochaihu.roles.checks.find((c) => c.herb === idOf("生薑"))!.readings.includes("佐制"), "生薑 restrains 半夏 (半夏畏生薑)");
  const sijunzi = analyseFormula(dev, formula("F_SIJUNZI"), herbs, tables)!;
  assert.ok(sijunzi.roles.checks.find((c) => c.herb === idOf("茯苓"))!.readings.includes("為之使"), "茯苓為人參之使");
});

test("with its own pattern as the target, the 君 is read where the classics put it: 麻黃 for 風寒表實, 乾薑 for 脾陽虛, 柴胡 for 肝鬱", () => {
  const read = (fid: string, pid: string, herb: string) => analyseFormula(dev, formula(fid), herbs, tables, deviationOf(pid))!.roles.checks.find((c) => c.herb === idOf(herb))!;
  assert.ok(read("F_MAHUANG", "EX1", "麻黃").readings.includes("主"));
  assert.ok(read("F_LIZHONG", "SP2", "乾薑").readings.includes("主"));
  assert.ok(read("F_XIAOYAO", "LV1", "柴胡").readings.includes("主"));
});

test("使 as the classics read it: 升麻 leads to the spleen's channel (引經報使) and with 柴胡 carries 補中益氣湯 upward; 桔梗 carries 血府逐瘀湯 (載藥)", () => {
  const buzhong = analyseFormula(dev, formula("F_BUZHONG"), herbs, tables, deviationOf("SP3"))!;
  const shengma = buzhong.roles.checks.find((c) => c.herb === idOf("升麻"))!, chaihu = buzhong.roles.checks.find((c) => c.herb === idOf("柴胡"))!;
  assert.equal(buzhong.roles.principal, "脾.qi");
  assert.ok(shengma.readings.includes("引經") && shengma.readings.includes("載藥") && shengma.agrees);
  assert.ok(chaihu.readings.includes("載藥") && chaihu.agrees);
  const xuefu = analyseFormula(dev, formula("F_XUEFU"), herbs, tables, deviationOf("QB2"))!;
  assert.ok(xuefu.roles.checks.find((c) => c.herb === idOf("桔梗"))!.agrees);
  const noGuides = analyseFormula(dev, formula("F_BUZHONG"), herbs, { ...tables, yinjing: [] }, deviationOf("SP3"))!;
  assert.ok(!noGuides.roles.checks.find((c) => c.herb === idOf("升麻"))!.readings.includes("引經"), "it is the classical table that reads 升麻 as 引經 here, not its channels");
});

test("a disagreement is reported, never relabelled: the labels in the knowledge base are untouched by a measurement", () => {
  const f = formula("F_BUZHONG");
  const before = JSON.stringify(f);
  const a = analyseFormula(dev, f, herbs, tables, deviationOf("SP3"))!;
  assert.equal(JSON.stringify(f), before);
  const huangqi = a.roles.checks.find((c) => c.herb === idOf("黃耆"))!;
  assert.equal(huangqi.labelled, "君");
  assert.equal(typeof huangqi.agrees, "boolean");
});

test("why 四君子湯 fits the typical 脾氣虛 patient: the reductions add up exactly, it addresses the spleen's qi, and 人參 does the most of it", () => {
  const D = deviationOf("SP1");
  const f = formula("F_SIJUNZI");
  const a = analyseFormula(dev, f, herbs, tables)!;
  const m = formulaMechanism(dev, D, f, a.action, a.contributions, tables.params);
  assert.ok(m.costAfter <= m.costBefore && m.k > 0);
  for (const c of m.components) assert.ok(Math.abs(c.herbs.reduce((s, h) => s + h.part, 0) - c.reduction) < 1e-9, c.dim);
  assert.ok(m.zhifa.addresses.includes("脾.qi"), `addresses ${m.zhifa.addresses.join(", ")}`);
  assert.ok(m.zhifa.addresses.every((d) => m.components.find((c) => c.dim === d)!.share! >= tables.params.mechanism.theta));
  const spleen = m.components.find((c) => c.dim === "脾.qi")!;
  assert.equal(nameOf(spleen.herbs[0]!.herb), "人參");
  assert.equal(m.bingji[0]?.dim !== undefined, true);
  assert.ok(m.bingji.length <= tables.params.mechanism.top && m.residual.length <= tables.params.mechanism.top);
  const weighted = (d: string): number => dimensionWeight(dev, d) * (D[d] ?? 0) ** 2;
  assert.ok(m.bingji.every((b, i) => i === 0 || weighted(m.bingji[i - 1]!.dim) >= weighted(b.dim)), "病機: the largest components first");
  assert.deepEqual(formulaMechanism(dev, D, f, a.action, a.contributions, tables.params), m, "deterministic");
});

test("a composition built by hand and the analysis of the same formula agree", () => {
  const f = formula("F_ERCHEN");
  const rows = classicalRows(f, herbs)!.rows;
  const direct = compositionAction(herbs, rows, tables);
  assert.deepEqual(analyseFormula(dev, f, herbs, tables)!.action, direct);
  assert.deepEqual(contributions(direct).map((c) => c.herb), f.composition.map((c) => c.herb));
});

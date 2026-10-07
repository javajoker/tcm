// The prescription model, part 1 (PM-37): a herb at an amount, its dose band, processing and the 七情 of a composition.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { DoseBands, Herb, Herbs, Pairing, Pairings, Prescription, Processing } from "@tcm/kb";
import { applyPairings, doseBandOf, burdenGrowth, compositionAction, herbAtDose, processingOf, saturation, typicalDose, type PrescriptionTables } from "../src/index.ts";

const data = <T>(rel: string): T => JSON.parse(readFileSync(new URL(`../../../data/${rel}`, import.meta.url), "utf8")) as T;
const herbs: Herb[] = data<Herbs>("herbs/herbs.json").items;
const byName = new Map(herbs.map((h) => [h.name["zh-Hant"], h] as const));
const byId = new Map(herbs.map((h) => [h.id, h] as const));
const tables: PrescriptionTables = {
  params: data<Prescription>("treatment/prescription.json").params,
  pairings: data<Pairings>("herbs/pairings.json").items,
  processing: data<Processing>("herbs/processing.json").methods,
  doseBands: data<DoseBands>("herbs/dose-bands.json").items,
};
const { params } = tables;
const herb = (name: string): Herb => byName.get(name) ?? assert.fail(`no herb ${name}`);
const band = (name: string) => tables.doseBands.find((b) => b.herb === herb(name).id);
const method = (id: string) => tables.processing.find((m) => m.id === id) ?? assert.fail(`no method ${id}`);
const close = (a: number, b: number, eps = 1e-12) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

// a small deterministic generator for the properties
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("the dose–response: s(0) = 0, s(1) = 1, increasing, concave and below 1 + κ; the burden x^γ is 1 at the typical dose and at least linear above it", () => {
  const k = params.dose.kappa, g = params.dose.gamma;
  assert.equal(saturation(0, k), 0);
  close(saturation(1, k), 1);
  close(burdenGrowth(1, g), 1);
  let prev = 0, prevSlope = Infinity;
  for (let i = 1; i <= 400; i++) {
    const x = i / 50, s = saturation(x, k), slope = s - prev;
    assert.ok(s > prev && s < 1 + k, `s(${x})`);
    assert.ok(slope <= prevSlope + 1e-12, `concave at ${x}`);
    if (x >= 1) assert.ok(burdenGrowth(x, g) >= x - 1e-12, `burden at ${x}`);
    prev = s;
    prevSlope = slope;
  }
  close(saturation(2, k), (1 + k) * 2 / (k + 2));          // twice the typical dose: a third more with κ = 1, not double
});

test("at the typical dose, with no band and no processing, a herb does exactly what its record says", () => {
  for (const h of herbs) {
    const a = herbAtDose(h, 1, { params });
    assert.deepEqual(Object.keys(a.benefit).sort(), Object.keys(h.effects).sort());
    for (const [d, x] of Object.entries(h.effects)) close(a.benefit[d]!, x);
    for (const [d, x] of Object.entries(h.harms)) close(a.burden[d]!, x);
    assert.equal(a.direction, h.props.direction);
    assert.deepEqual(a.changes, []);
  }
});

test("property: over every herb and random amounts, the benefit keeps its dimensions and signs and never exceeds (1 + κ) × the record; the burden scales as x^γ", () => {
  const r = rng(20261007);
  for (let i = 0; i < 3000; i++) {
    const h = herbs[Math.floor(r() * herbs.length)]!;
    const x = r() * 3;
    const a = herbAtDose(h, x, { params });
    for (const [d, e] of Object.entries(h.effects)) {
      assert.ok(Math.sign(a.benefit[d]!) === Math.sign(e) || x === 0, `${h.id} ${d}`);
      assert.ok(Math.abs(a.benefit[d]!) <= (1 + params.dose.kappa) * Math.abs(e) + 1e-12);
    }
    for (const [d, e] of Object.entries(h.harms)) close(a.burden[d]!, e * burdenGrowth(x, params.dose.gamma), 1e-9);
  }
});

test("the typical dose is the middle of the Pharmacopoeia range, and none without one", () => {
  const h = herb("當歸");
  assert.deepEqual(h.dose_g_reference, [6, 12]);
  assert.equal(typicalDose(h), 9);
  assert.equal(typicalDose({ dose_g_reference: null }), null);
});

test("量效: 葛根 少用則浮而外散，多用則沉而內降 — the band switches at the thresholds and not in between", () => {
  const g = herb("葛根"), b = band("葛根");
  assert.equal(doseBandOf(params.bands.small_below - 0.01, params), "small");
  assert.equal(doseBandOf(1, params), null);
  assert.equal(doseBandOf(params.bands.large_above + 0.01, params), "large");
  const small = herbAtDose(g, 0.5, { params, band: b });
  const typical = herbAtDose(g, 1, { params, band: b });
  const large = herbAtDose(g, 2, { params, band: b });
  assert.ok(small.direction > 0.4 && large.direction < 0, "it rises when little is used and sinks when much");
  assert.equal(typical.direction, g.props.direction);
  assert.deepEqual([small.band, typical.band, large.band], ["small", null, "large"]);
  assert.ok((small.benefit["bagang.exterior"] ?? 0) < 0, "a small amount releases the exterior");
  assert.ok((large.benefit["liuxie.火"] ?? 0) < (typical.benefit["liuxie.火"] ?? 0) * saturation(2, params.dose.kappa) + 1e-12, "a large amount clears more heat");
});

test("量效: 紅花 多用破血 — above the band the stasis-moving effect grows by half and a burden on the blood appears", () => {
  const h = herb("紅花"), b = band("紅花");
  const typical = herbAtDose(h, 1.2, { params, band: b }), large = herbAtDose(h, 1.3, { params, band: b });
  close(large.benefit["product.瘀"]! / saturation(1.3, params.dose.kappa), 1.5 * h.effects["product.瘀"]!);
  assert.ok((large.burden["肝.blood"] ?? 0) < (typical.burden["肝.blood"] ?? 0));
});

test("炮製: 酒製升提, 入鹽走腎, 蜜製甘緩 — each method changes only what it names", () => {
  const h = herb("當歸");
  const plain = herbAtDose(h, 1, { params });
  const jiu = herbAtDose(h, 1, { params, processing: [method("jiu")] });
  close(jiu.direction, Math.min(1, plain.direction + 0.3));
  assert.deepEqual(jiu.benefit, plain.benefit);
  const yan = herbAtDose(h, 1, { params, processing: [method("yan")] });
  assert.ok(yan.tropism["腎"]! > 0 && yan.direction < plain.direction);
  close(Object.values(yan.tropism).reduce((a, b) => a + b, 0), 1);
  const mi = herbAtDose(herb("黃耆"), 1, { params, processing: [method("mi")] });
  assert.equal(mi.runZao, "潤");
  for (const [d, x] of Object.entries(herb("黃耆").harms)) close(mi.burden[d]!, 0.8 * x);
  assert.deepEqual(processingOf("酒洗", tables.processing).map((m) => m.id), ["jiu"]);
  assert.deepEqual(processingOf("去皮", tables.processing), [], "cleaning has no effect");
  assert.deepEqual(processingOf(null, tables.processing), []);
});

test("七情: 半夏畏生薑 — in 小柴胡湯 the burden of 半夏 is halved and nothing else changes", () => {
  const rows = ["柴胡", "黃芩", "半夏", "人參", "炙甘草", "生薑", "大棗"].map((n) => herbAtDose(herb(n), 1, { params }));
  const out = applyPairings(rows, tables.pairings, params);
  const banxia = herb("半夏").id;
  const before = rows.find((a) => a.herb === banxia)!, after = out.actions.find((a) => a.herb === banxia)!;
  for (const [d, x] of Object.entries(before.burden)) close(after.burden[d]!, x * (1 - params.pairs.tau));
  assert.ok(out.applied.some((p) => p.type === "相畏" && p.herb === banxia && p.other === herb("生薑").id));
  assert.ok(out.applied.some((p) => p.type === "相惡" && p.herb === herb("生薑").id && p.other === herb("黃芩").id), "生薑惡黃芩: the classical table names it, inside the formula");
});

test("七情: 茯苓為人參之使 — only the benefit of 人參 on the dimensions both act on grows, by (1 + σ)", () => {
  const ginseng = herbAtDose(herb("人參"), 1, { params }), poria = herbAtDose(herb("茯苓"), 1, { params });
  const out = applyPairings([ginseng, poria], tables.pairings, params);
  const shared = Object.keys(ginseng.benefit).filter((d) => ginseng.benefit[d]! * (poria.benefit[d] ?? 0) > 0);
  assert.ok(shared.length > 0);
  const after = out.actions[0]!;
  for (const [d, x] of Object.entries(ginseng.benefit)) close(after.benefit[d]!, shared.includes(d) ? x * (1 + params.pairs.sigma) : x);
  assert.deepEqual(after.burden, ginseng.burden);
  assert.equal(out.actions[1], poria, "the servant is unchanged");
});

test("七情: the order of the pairings never matters and no factor compounds; 相反 is never computed", () => {
  const names = ["柴胡", "黃芩", "半夏", "人參", "炙甘草", "生薑", "大棗", "茯苓", "白朮", "當歸", "地黃", "麥冬"];
  const rows = names.map((n) => herbAtDose(herb(n), 1, { params }));
  const base = applyPairings(rows, tables.pairings, params);
  const r = rng(7);
  for (let i = 0; i < 20; i++) {
    const shuffled = [...tables.pairings].sort(() => r() - 0.5);
    assert.deepEqual(applyPairings(rows, shuffled, params).actions, base.actions);
  }
  const twice = applyPairings(rows, [...tables.pairings, ...tables.pairings.map((p) => ({ ...p, id: `${p.id}x` }))], params);
  assert.deepEqual(twice.actions, base.actions, "a pairing listed twice changes nothing more");
  const fan: Pairing = { id: "chaihu.fan.huangqin", herb: herb("柴胡").id, other: herb("黃芩").id, type: "相反", says: "test", status: "derived", source: { book: "test", chapter: "test" } };
  const withFan = applyPairings(rows, [...tables.pairings, fan], params);
  assert.deepEqual(withFan.actions, base.actions);
  assert.deepEqual(withFan.conflicts, [fan]);
});

test("a composition's action sums its herbs after the pairings, and its direction leans with the herbs that do the most", () => {
  const rows = [{ herb: herb("升麻").id, x: 1 }, { herb: herb("柴胡").id, x: 1 }, { herb: herb("黃耆").id, x: 1.5 }];
  const c = compositionAction(byId, rows, tables);
  assert.equal(c.herbs.length, 3);
  for (const [d, x] of Object.entries(c.total)) close(x, (c.benefit[d] ?? 0) + (c.burden[d] ?? 0), 1e-9);
  assert.ok(c.direction > 0.3, "升麻、柴胡 raise: the whole rises");
  assert.throws(() => compositionAction(byId, [{ herb: "herb-nope", x: 1 }], tables), /unknown herb/);
  assert.throws(() => herbAtDose(herb("升麻"), Number.NaN, { params }), /finite/);
});

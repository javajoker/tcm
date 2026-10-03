import assert from "node:assert/strict";
import { test } from "node:test";
import { checkConsistency, normalize, orient } from "../src/index.ts";
import type { Findings } from "../src/index.ts";
import { dev } from "./kbs.ts";

const present = (...ids: string[]): Findings => Object.fromEntries(ids.map((s) => [s, { state: "present" as const }]));
const o = (findings: Findings, course?: "acute" | "subacute" | "chronic") =>
  orient(dev, normalize(dev, { findings, sex: "female", pregnancy: "no", ...(course ? { context: { course } } : {}) }), course ? { course } : undefined);

test("channel routing (SOP §9.1): acute onset with a new chill, fever, sore throat, blocked nose or cough → external", () => {
  assert.equal(o(present("S_AVERSION_COLD"), "acute").channel, "external");
  for (const s of ["S_FEVER", "S_SORE_THROAT", "S_NASAL_CONGESTION", "S_RUNNY_NOSE_CLEAR", "S_COUGH_DRY"]) assert.equal(o(present(s), "acute").channel, "external", s);
  assert.equal(o(present("S_AVERSION_COLD"), "chronic").channel, "internal", "not acute");
  assert.equal(o(present("S_AVERSION_COLD")).channel, "internal", "unknown course");
  assert.equal(o(present("S_FATIGUE"), "acute").channel, "internal", "no external trigger");
});

test("表 / 半表半裡 / 裡", () => {
  assert.equal(o(present("S_AVERSION_COLD", "S_FEVER", "S_BODY_ACHE"), "acute").exterior, "exterior");
  assert.equal(o(present("S_AVERSION_COLD"), "acute").exterior, "interior", "惡寒 alone lacks a supporting sign");
  assert.equal(o(present("S_FEVER", "S_HEADACHE"), "acute").exterior, "interior", "惡寒 is a necessary condition");
  assert.equal(o(present("S_AVERSION_COLD", "S_FEVER"), "chronic").exterior, "interior");
  assert.equal(o(present("S_ALTERNATING_CHILLS_FEVER")).exterior, "half-exterior");
  assert.equal(o(present("S_BITTER_MOUTH", "S_HYPOCHONDRIAC_DISTENSION")).exterior, "half-exterior");
  assert.equal(o(present("S_BITTER_MOUTH")).exterior, "interior");
});

test("cold/heat and deficiency/excess leans need a margin of two signs", () => {
  assert.equal(o(present("S_FEAR_COLD", "S_COLD_LIMBS", "S_LOOSE_STOOL")).coldHeat.lean, "cold");
  assert.equal(o(present("S_FEAR_HEAT", "S_THIRST_COLD_DRINK")).coldHeat.lean, "heat");
  assert.equal(o(present("S_FEAR_COLD")).coldHeat.lean, "neutral", "one sign is not a lean");
  assert.equal(o(present("S_FEAR_COLD", "S_COLD_LIMBS", "S_FEAR_HEAT", "S_BITTER_MOUTH")).coldHeat.lean, "neutral");
  assert.equal(o(present("S_FATIGUE", "S_LAZY_SPEAK")).deficiencyExcess.lean, "deficiency");
  assert.equal(o(present("S_ABD_REFUSE_PRESS", "S_PAIN_DISTENDING")).deficiencyExcess.lean, "excess");
  assert.deepEqual(o(present("S_FEAR_COLD", "S_COLD_LIMBS")).coldHeat.cold, ["S_FEAR_COLD", "S_COLD_LIMBS"]);
});

test("absent and unsure findings are not signs", () => {
  const f: Findings = { S_FEAR_COLD: { state: "absent" }, S_COLD_LIMBS: { state: "unsure" } };
  assert.equal(o(f).coldHeat.cold.length, 0);
});

test("consistency check: signs against the panel are reported (寒熱真假, 虛實真假), never resolved", () => {
  const cold = o(present("S_FEAR_COLD", "S_COLD_LIMBS"));
  const hotPanel = { coldHeat: 0.5, deficiencyExcess: 0, exterior: 0, yinYang: "yang" as const };
  assert.deepEqual(checkConsistency(dev, cold, hotPanel), [{ axis: "cold-heat", signs: "cold", panel: "heat" }]);
  assert.deepEqual(checkConsistency(dev, cold, { ...hotPanel, coldHeat: -0.5 }), []);
  const def = o(present("S_FATIGUE", "S_LAZY_SPEAK"));
  assert.deepEqual(checkConsistency(dev, def, { ...hotPanel, coldHeat: 0, deficiencyExcess: 0.4 }), [{ axis: "deficiency-excess", signs: "deficiency", panel: "excess" }]);
  assert.deepEqual(checkConsistency(dev, o(present("S_FATIGUE")), { ...hotPanel, deficiencyExcess: 0.9 }), [], "no lean, nothing to contradict");
  assert.deepEqual(checkConsistency(dev, def, { ...hotPanel, coldHeat: 0, deficiencyExcess: 0.1 }), [], "inside the threshold");
});

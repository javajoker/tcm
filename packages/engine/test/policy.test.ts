import assert from "node:assert/strict";
import { test } from "node:test";
import { baselineFacts, resolvePolicy } from "../src/index.ts";
import type { MedicationClass, Policy, PolicyFacts } from "../src/index.ts";
import { forAll, type Rng } from "./gen.ts";
import { dev, release } from "./kbs.ts";

const facts = (over: Partial<PolicyFacts> = {}): PolicyFacts => ({ ...baselineFacts(), ...over });
const flags = (...ids: string[]): ReadonlySet<string> => new Set(ids);
const both = (f: PolicyFacts): { r: Policy; d: Policy } => ({ r: resolvePolicy(release, f), d: resolvePolicy(dev, f) });
const LEVELS = ["L0", "L1", "L2", "L3"];
const rank = (l: string): number => LEVELS.indexOf(l);

// ── the SOP §0.2 table ──────────────────────────────────────────────────────

test("healthy adult: L1 in release, L3 in dev, no notice", () => {
  const { r, d } = both(facts());
  assert.deepEqual([r.level, r.notice, d.level, d.notice], ["L1", "none", "L3", "none"]);
  assert.deepEqual(r.notices, []);
  assert.equal(r.flow, "continue");
});

test("65 and over: inline notice, same level as an adult", () => {
  const { r, d } = both(facts({ ageYears: 70 }));
  assert.deepEqual([r.level, r.notice, d.level, d.notice], ["L1", "inline", "L3", "inline"]);
  assert.deepEqual(r.notices.map((n) => n.id), ["N-ELDERLY"]);
});

test("minor, pregnant, lactating: blocking notice; L0 in release, L3 in dev", () => {
  for (const [over, id] of [[{ ageYears: 12 }, "N-MINOR"], [{ pregnant: true }, "N-PREG"], [{ lactating: true }, "N-LACT"]] as const) {
    const { r, d } = both(facts(over));
    assert.deepEqual([r.level, r.notice, d.level, d.notice], ["L0", "blocking_ack", "L3", "blocking_ack"], id);
    assert.equal(r.notices[0]?.id, id);
    assert.equal(r.notices[0]?.kind, "blocking_ack");
    assert.equal(r.flow, "continue");
  }
});

test("red flags A and B, and serious chronic disease: blocking notice with the reasons; emergency resources for A/B", () => {
  const a = both(facts({ redFlags: flags("RF_A_CHEST_PAIN") }));
  assert.deepEqual([a.r.level, a.r.notice, a.d.level, a.d.notice], ["L0", "blocking_ack", "L3", "blocking_ack"]);
  assert.deepEqual(a.r.notices[0], { id: "N-A", kind: "blocking_ack", cell: { dimension: "condition", key: "red_flag_A" }, reasons: ["RF_A_CHEST_PAIN"] });
  assert.equal(a.r.emergencyResources, true);
  const b = both(facts({ redFlags: flags("RF_B_HIGH_FEVER") }));
  assert.equal(b.r.notices[0]?.id, "N-B");
  assert.equal(b.r.emergencyResources, true);
  const s = both(facts({ seriousChronic: true }));
  assert.deepEqual([s.r.level, s.r.notice], ["L0", "blocking_ack"]);
  assert.equal(s.r.emergencyResources, false);
});

test("scope flags of level C map to populations and conditions", () => {
  assert.equal(resolvePolicy(release, facts({ redFlags: flags("RF_C_MINOR") })).notices[0]?.id, "N-MINOR");
  assert.equal(resolvePolicy(release, facts({ redFlags: flags("RF_C_PREGNANT") })).notices[0]?.id, "N-PREG");
  assert.equal(resolvePolicy(release, facts({ redFlags: flags("RF_C_LACTATING") })).notices[0]?.id, "N-LACT");
  for (const id of ["RF_C_CANCER_TREATMENT", "RF_C_KIDNEY", "RF_C_LIVER", "RF_C_TRANSPLANT", "RF_C_PSYCHIATRIC", "RF_C_CARDIOPULMONARY"]) {
    const p = resolvePolicy(release, facts({ redFlags: flags(id) }));
    assert.equal(p.notices[0]?.id, "N-SERIOUS", id);
    assert.deepEqual(p.notices[0]?.reasons, [id]);
  }
});

test("medications, allergy match and acute external symptoms: inline notice, L1 in release", () => {
  for (const over of [{ medications: ["anticoagulant"] as MedicationClass[] }, { medications: ["antidiabetic"] as MedicationClass[] }, { allergyMatch: true }, { acuteExternal: true }]) {
    const { r, d } = both(facts(over));
    assert.deepEqual([r.level, r.notice, d.level, d.notice], ["L1", "inline", "L3", "inline"], JSON.stringify(over));
  }
  const both2 = resolvePolicy(release, facts({ medications: ["anticoagulant", "antidiabetic"] }));
  assert.deepEqual(both2.notices.map((n) => n.id), ["N-MED"], "anticoagulant + other medication merge into one notice");
  assert.deepEqual(both2.notices[0]?.reasons, ["anticoagulant", "antidiabetic"]);
});

test("states: low confidence and insufficient information drop release to L0; conflicting data stays L1", () => {
  assert.equal(resolvePolicy(release, facts({ states: { lowConfidence: true, insufficientInformation: false, conflictingData: false } })).level, "L0");
  assert.equal(resolvePolicy(release, facts({ states: { lowConfidence: false, insufficientInformation: true, conflictingData: false } })).level, "L0");
  assert.equal(resolvePolicy(release, facts({ states: { lowConfidence: false, insufficientInformation: false, conflictingData: true } })).level, "L1");
  assert.equal(resolvePolicy(dev, facts({ states: { lowConfidence: true, insufficientInformation: true, conflictingData: true } })).level, "L3");
});

test("notices are sorted: blocking first, emergency before urgent before scope; one entry per notice id", () => {
  const p = resolvePolicy(release, facts({ ageYears: 70, pregnant: true, redFlags: flags("RF_B_VISION", "RF_A_SEIZURE"), medications: ["sedative"] }));
  assert.deepEqual(p.notices.map((n) => n.id), ["N-A", "N-B", "N-PREG", "N-ELDERLY", "N-MED"]);
});

// ── features follow the level and the profile flags ─────────────────────────

test("features: release L1 shows tier-A formulas, diet and acupoints only; dev L3 shows everything", () => {
  const r = resolvePolicy(release, facts()).features;
  assert.deepEqual(r, { formulas: true, tiers: ["A"], dosage: false, modification: false, herbWeights: false, acupoints: true, diet: true });
  const d = resolvePolicy(dev, facts()).features;
  assert.deepEqual(d, { formulas: true, tiers: ["A", "B", "C"], dosage: true, modification: true, herbWeights: true, acupoints: true, diet: true });
  const l0 = resolvePolicy(release, facts({ pregnant: true })).features;
  assert.deepEqual(l0, { formulas: false, tiers: [], dosage: false, modification: false, herbWeights: false, acupoints: false, diet: false });
});

// ── properties ──────────────────────────────────────────────────────────────

const MEDS: readonly MedicationClass[] = ["anticoagulant", "antidiabetic", "antihypertensive", "diuretic", "cardiac-glycoside", "immunosuppressant", "sedative", "MAOI", "stimulant", "other"];
const ALL_FLAGS = [...release.redFlags.map((f) => f.id)];

function randomFacts(rng: Rng): PolicyFacts {
  return {
    ageYears: rng.pick([3, 12, 17, 18, 30, 64, 65, 80]), pregnant: rng.chance(0.15), lactating: rng.chance(0.1),
    redFlags: new Set(rng.subset(ALL_FLAGS, 0.04)), seriousChronic: rng.chance(0.1), medications: rng.subset(MEDS, 0.15),
    allergyMatch: rng.chance(0.1), acuteExternal: rng.chance(0.2),
    states: { lowConfidence: rng.chance(0.2), insufficientInformation: rng.chance(0.2), conflictingData: rng.chance(0.2) },
  };
}

/** Add one risk factor to the facts (never removes one). */
function addRisk(rng: Rng, f: PolicyFacts): PolicyFacts {
  switch (rng.int(0, 7)) {
    case 0: return f.ageYears >= 18 ? { ...f, ageYears: Math.max(f.ageYears, 70) } : f;   // growing older is only a risk step for adults (a child is already blocked)
    case 1: return { ...f, pregnant: true };
    case 2: return { ...f, lactating: true };
    case 3: return { ...f, redFlags: new Set([...f.redFlags, rng.pick(ALL_FLAGS)]) };
    case 4: return { ...f, seriousChronic: true };
    case 5: return { ...f, medications: [...new Set([...f.medications, rng.pick(MEDS)])] };
    case 6: return { ...f, allergyMatch: true, acuteExternal: true };
    default: return { ...f, states: { lowConfidence: true, insufficientInformation: f.states.insufficientInformation, conflictingData: true } };
  }
}

test("property P3: adding a risk factor never raises the level and never lowers the notice", () => {
  const nrank = { none: 0, inline: 1, blocking_ack: 2 } as const;
  forAll("monotone policy", 600, (rng) => { const f = randomFacts(rng); return { f, g: addRisk(rng, f) }; }, ({ f, g }) => {
    for (const kb of [release, dev]) {
      const a = resolvePolicy(kb, f), b = resolvePolicy(kb, g);
      assert.ok(rank(b.level) <= rank(a.level), `${kb.profile}: level ${a.level} → ${b.level}`);
      assert.ok(nrank[b.notice] >= nrank[a.notice], `${kb.profile}: notice ${a.notice} → ${b.notice}`);
    }
  });
});

test("property P4: dev opens everything, release restricts, blocking notices are identical, flow always continues", () => {
  forAll("dev opens, release restricts", 600, (rng) => randomFacts(rng), (f) => {
    const r = resolvePolicy(release, f), d = resolvePolicy(dev, f);
    assert.equal(d.level, "L3");
    assert.ok(rank(r.level) <= 1, `release level ${r.level}`);
    assert.ok(rank(d.level) >= rank(r.level));
    assert.equal(r.flow, "continue");
    assert.equal(d.flow, "continue");
    const blocking = (p: Policy): string[] => p.notices.filter((n) => n.kind === "blocking_ack").map((n) => n.id).sort();
    assert.deepEqual(blocking(r), blocking(d), "the same blocking notices in both profiles");
    if (blocking(r).length) assert.equal(r.level, "L0", "any blocking cause restricts release to L0");
    assert.equal(r.emergencyResources, d.emergencyResources);
    assert.equal(d.safetyEnforcement, "annotate_only");
    assert.equal(r.safetyEnforcement, "suppress_hard");
  });
});

test("the state re-check can only tighten the policy (equal or more restrictive)", () => {
  forAll("two-phase policy", 400, (rng) => randomFacts(rng), (f) => {
    const before = resolvePolicy(release, { ...f, states: { lowConfidence: false, insufficientInformation: false, conflictingData: false } });
    const after = resolvePolicy(release, f);
    assert.ok(rank(after.level) <= rank(before.level));
  });
});

test("the policy is deterministic and does not depend on the order of flags or medications", () => {
  forAll("determinism", 200, (rng) => randomFacts(rng), (f) => {
    const shuffled: PolicyFacts = { ...f, medications: [...f.medications].reverse(), redFlags: new Set([...f.redFlags].reverse()) };
    assert.deepEqual(resolvePolicy(release, f), resolvePolicy(release, f));
    assert.deepEqual(resolvePolicy(release, f).notices.map((n) => n.id), resolvePolicy(release, shuffled).notices.map((n) => n.id));
    assert.equal(resolvePolicy(release, f).level, resolvePolicy(release, shuffled).level);
  });
});

test("an overridden release profile can only be stricter than release", async () => {
  const { indexKnowledgeBase } = await import("@tcm/kb");
  const { rawChunksFromDisk } = await import("@tcm/kb/node");
  const strict = indexKnowledgeBase(rawChunksFromDisk("release", { population: { adult: { level: "L0" } } }));
  forAll("override restricts", 200, (rng) => randomFacts(rng), (f) => {
    assert.ok(rank(resolvePolicy(strict, f).level) <= rank(resolvePolicy(release, f).level));
  });
  assert.equal(resolvePolicy(strict, facts()).level, "L0");
});

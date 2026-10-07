// Learners and practitioners (PM-53; docs/post-mvp/design/prescription-model.md §7.4): the role overlay may only raise an adult's level and switch the study features on; the
// reference holds what the role reaches beyond the release profile and is built only where L2 and L3 content may ship; a role's knowledge base merges it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChunks, indexKnowledgeBase, reachOf, roleProfile } from "../src/index.ts";
import type { ScopeProfile } from "../src/index.ts";
import { buildFromDisk, readDataFiles } from "../node/fromDisk.ts";

const files = readDataFiles();
const release = files.scope.profiles.release as ScopeProfile;
const overlay = files.scope.roles.learner;

test("the overlay raises an adult's level and switches the study features on — every other cell and the enforcement stay the release profile's", () => {
  const p = roleProfile(release, overlay);
  assert.equal(p.population.adult.level, "L3");
  assert.equal(p.population.elderly_65_plus.level, "L3");
  for (const key of ["minor_under_18", "pregnant", "lactating"] as const) assert.deepEqual(p.population[key], release.population[key], key);
  assert.deepEqual(p.condition, release.condition);
  assert.deepEqual(p.state, release.state);
  assert.equal(p.safety_enforcement, "suppress_hard");
  assert.deepEqual(Object.values(p.features), [true, true, true, true, true, true]);
  const reach = reachOf(p);
  assert.deepEqual([reach.maxLevel, reach.dosage, reach.tierB, reach.tierC, reach.modification, reach.herbRecords], ["L3", true, true, true, true, true]);
  assert.equal(reachOf(release).maxLevel, "L1", "the release profile itself is untouched");
});

test("an overlay that would lower a level or switch a feature off is refused; the build's overrides restrict a role as they restrict the profile", () => {
  assert.throws(() => roleProfile(release, { ...overlay, population: { ...overlay.population, adult: { level: "L0" } } }), /would lower L1/);
  assert.throws(() => roleProfile(release, { ...overlay, features: { ...overlay.features, show_tier_c: false } }), /only switches a study feature on/);
  const restricted = roleProfile(release, overlay, { population: { adult: { level: "L2" } }, features: { show_dosage_reference: false } });
  assert.equal(restricted.population.adult.level, "L2");
  assert.equal(reachOf(restricted).dosage, false);
});

test("the reference: in the closed beta only — every tier with its amounts, the classical 加減, the herb records with the tables, the dose references, each pattern's formulas", () => {
  const beta = buildFromDisk("release", undefined, true);
  const ref = beta.referenceFile!;
  assert.ok(ref);
  assert.equal(ref.formulas.items.length, 33);
  assert.deepEqual(new Set(ref.formulas.items.map((f) => f.tier)), new Set(["A", "B", "C"]));
  assert.ok(ref.formulas.items.some((f) => f.composition.some((c) => typeof c.typical_g === "number")), "amounts");
  assert.ok(ref.formulas.items.some((f) => f.modifications.length > 0), "the classical 加減");
  assert.ok(ref.formulas.items.every((f) => !("kb_commit" in f) && !("repo_path" in f.source)), "no internal provenance");
  assert.equal(ref.herbs.items.length, 94);
  assert.ok(ref.herbs.prescription);
  assert.ok(ref.doseReferences.minor_fractions.length > 0);
  assert.ok(ref.patternFormulas["EX1"]!.includes("F_MAHUANG"), "麻黃湯 (tier C) is the role's for 風寒束表");
  assert.equal(ref.roles.learner.population.adult.level, "L3");
  // the general chunks are those of the release profile, unchanged
  assert.equal(beta.chunks.formulas.items.length, 20);
  assert.ok(beta.chunks.formulas.items.every((f) => f.tier === "A" && f.composition.every((c) => c.typical_g === undefined)));
  assert.equal(beta.chunks.herbs, null);
  assert.equal(beta.chunks.core.safety.dose_references, undefined);
  assert.equal(buildFromDisk("release", undefined, false).referenceFile, null, "a public build ships no L2 or L3 content before the reviews");
  assert.equal(buildFromDisk("dev").referenceFile, null, "development reaches L3 for everyone");
});

test("an override that takes the study content away leaves no role to serve", () => {
  const r = buildChunks(files, { profile: "release", version: "t", draftLabel: true, overrides: { features: { show_dosage_reference: false } } });
  assert.equal(r.referenceFile, null);
  assert.equal(r.chunks.reference, null);
});

test("a role's knowledge base: the release profile with the overlay, every formula and herb record, the dose references — the general one is unchanged, and a build without a reference serves no role", async () => {
  const beta = buildFromDisk("release", undefined, true);
  const kb = indexKnowledgeBase(beta.chunks);
  assert.equal(kb.role, null);
  assert.deepEqual(kb.roles, ["learner", "practitioner"]);
  const learner = await kb.forRole("learner");
  assert.equal(learner.role, "learner");
  assert.equal(learner.version, kb.version);
  assert.equal(learner.config.profile.population.adult.level, "L3");
  assert.equal(learner.config.profile.population.pregnant.level, "L0");
  assert.equal(learner.formulas.size, 33);
  assert.equal(learner.herbs?.size, 94);
  assert.ok(learner.prescription);
  assert.ok(learner.safety.dose_references);
  assert.ok(learner.patternById.get("EX1")!.formulas.includes("F_MAHUANG"));
  assert.equal(await kb.forRole("learner"), learner, "made once");
  assert.equal(learner.general(), kb, "a role's view knows the general one");
  assert.equal(kb.general(), kb);
  assert.deepEqual(learner.roles, kb.roles);
  assert.equal(await learner.forRole("practitioner"), await kb.forRole("practitioner"), "a role's view asks the general one for another role");
  assert.equal(kb.formulas.size, 20, "the general view is unchanged");
  assert.equal(kb.patternById.get("EX1")!.formulas.includes("F_MAHUANG"), false);
  const pub = indexKnowledgeBase(buildFromDisk("release", undefined, false).chunks);
  assert.deepEqual(pub.roles, []);
  await assert.rejects(pub.forRole("learner"), /serves no learner/);
});

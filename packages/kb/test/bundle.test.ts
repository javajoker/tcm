import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOverrides, buildChunks, indexKnowledgeBase, maxReachableLevel, reachOf } from "../src/index.ts";
import { buildFromDisk, readDataFiles } from "../node/fromDisk.ts";

const files = readDataFiles();
const release = buildFromDisk("release");
const dev = buildFromDisk("dev");
const text = (x: unknown): string => JSON.stringify(x);

test("reach: release reaches L1 only, dev reaches everything", () => {
  assert.equal(maxReachableLevel(files.scope.profiles.release), "L1");
  assert.equal(maxReachableLevel(files.scope.profiles.dev), "L3");
  assert.deepEqual(release.reach, { maxLevel: "L1", dosage: false, tierB: false, tierC: false, modification: false, herbWeights: false, herbRecords: false });
  assert.deepEqual(dev.reach, { maxLevel: "L3", dosage: true, tierB: true, tierC: true, modification: true, herbWeights: true, herbRecords: true });
});

test("feature flags can only restrict the level grid", () => {
  const p = structuredClone(files.scope.profiles.dev);
  p.features.show_dosage_reference = false;
  p.features.show_tier_c = false;
  assert.equal(reachOf(p).dosage, false);
  assert.equal(reachOf(p).tierC, false);
  const q = structuredClone(files.scope.profiles.release);
  q.features.show_tier_c = true;      // release grid is L1: a flag cannot raise it
  q.features.show_dosage_reference = true;
  assert.equal(reachOf(q).tierC, false);
  assert.equal(reachOf(q).dosage, false);
});

test("release bundle: tier A formulas only, no amounts, no modifications, no herb records, no internal fields", () => {
  const { chunks } = release;
  assert.equal(chunks.formulas.items.length, 20);
  assert.ok(chunks.formulas.items.every((f) => f.tier === "A"));
  assert.equal(chunks.herbs, null);
  for (const f of chunks.formulas.items) {
    assert.equal(f.classical_amounts, null, f.id);
    assert.deepEqual(f.modifications, [], f.id);
    assert.ok(f.composition.every((c) => !("typical_g" in c) && !("classical_amount" in c)), f.id);
    assert.ok(!("kb_commit" in f), f.id);
    assert.ok(!("repo_path" in f.source), f.id);
    assert.ok(!("second_source" in f.verification), `${f.id}: the second-source record is for reviewers`);
  }
  const all = text(chunks);
  for (const needle of ["second_source", "zh.wikisource.org", "typical_g", '"classical_amount":', '"classical_amounts":[', "dose_g_reference", "dose_references", "annotate_only", "kb_commit", "repo_path", "book_path", "reference/sources"]) {
    assert.ok(!all.includes(needle), `release bundle must not contain ${needle}`);
  }
  assert.equal(chunks.core.config.profileName, "release");
  assert.equal(chunks.core.config.profile.safety_enforcement, "suppress_hard");
  assert.ok(!all.includes("Development default"), "the dev profile description must be absent");
});

test("release bundle: every listed formula still exists; herb names remain available", () => {
  const ids = new Set(release.chunks.formulas.items.map((f) => f.id));
  for (const p of release.chunks.core.patterns.items) for (const f of p.formulas) assert.ok(ids.has(f), `${p.id} → ${f}`);
  const kb = indexKnowledgeBase(release.chunks);
  assert.equal(kb.herbs, null);
  assert.equal(kb.herbName("herb-renshen")?.name["zh-Hant"], "人參");
  assert.ok(!kb.formulas.has("F_MAHUANG"), "tier C is not shipped");
});

test("dev bundle: everything reachable is present", () => {
  const { chunks } = dev;
  assert.equal(chunks.formulas.items.length, 33);
  assert.ok(chunks.formulas.items.some((f) => f.classical_amounts !== null));
  assert.ok(chunks.formulas.items.some((f) => f.modifications.length > 0));
  assert.ok(chunks.formulas.items.every((f) => f.composition.every((c) => typeof c.typical_g === "number")));
  assert.equal(chunks.herbs?.items.length, 94);
  assert.ok(chunks.herbs?.items.every((h) => h.status === "curated-draft"));
  assert.equal(chunks.core.config.profile.safety_enforcement, "annotate_only");
  assert.ok(chunks.core.safety.dose_references);
  const all = text(chunks.core.config);
  assert.ok(!all.includes('"release"') || chunks.core.config.profileName === "dev");
});

test("a profile never contains the other profile's block", () => {
  assert.ok(!("profiles" in release.chunks.core.config));
  assert.equal(Object.keys(release.chunks.core.config).sort().join(), "dimensions,levels,noticeKinds,profile,profileName,resolution");
});

test("blocking notices of the release grid survive in the dev profile (config sanity)", () => {
  for (const dim of ["population", "condition", "state"] as const) {
    for (const [k, cell] of Object.entries(release.profile[dim])) {
      if (cell.notice === "blocking_ack") assert.equal((dev.profile[dim] as Record<string, { notice: string }>)[k]?.notice, "blocking_ack", `${dim}.${k}`);
    }
  }
  assert.equal(release.chunks.core.config.resolution.flow, "continue");
});

// ── overrides ───────────────────────────────────────────────────────────────
const rel = files.scope.profiles.release;

test("overrides can restrict: lower a level, raise a notice, switch a feature off", () => {
  const p = applyOverrides(rel, { population: { adult: { level: "L0", notice: "inline" } }, features: { show_acupoints: false }, safety_enforcement: "suppress_hard" });
  assert.equal(p.population.adult.level, "L0");
  assert.equal(p.population.adult.notice, "inline");
  assert.equal(p.features.show_acupoints, false);
  assert.equal(rel.population.adult.level, "L1", "the base profile is not mutated");
});

test("overrides cannot loosen anything", () => {
  assert.throws(() => applyOverrides(rel, { population: { adult: { level: "L2" } } }), /would raise L1/);
  assert.throws(() => applyOverrides(rel, { population: { pregnant: { notice: "inline" } } }), /would weaken blocking_ack/);
  assert.throws(() => applyOverrides(rel, { features: { show_tier_c: true } }), /cannot be switched on/);
  assert.throws(() => applyOverrides(rel, { safety_enforcement: "annotate_only" }), /would loosen/);
  assert.throws(() => applyOverrides(rel, { wuxing: { enabled: false } }), /not overridable/);
  assert.throws(() => applyOverrides(rel, { population: { martian: { level: "L0" } } }), /unknown cell/);
});

test("all violations of an override are reported at once", () => {
  assert.throws(() => applyOverrides(rel, { population: { adult: { level: "L3" } }, features: { show_tier_c: true } }), (e: unknown) => /L3/.test(String(e)) && /show_tier_c/.test(String(e)));
});

test("an overridden release build is smaller still", () => {
  const lower: Record<string, Record<string, { level: string }>> = {};
  for (const dim of ["population", "condition", "state"] as const) {
    lower[dim] = {};
    for (const [k, cell] of Object.entries(rel[dim])) if (cell.level !== "L0") lower[dim]![k] = { level: "L0" };
  }
  const strict = buildChunks(files, { profile: "release", version: "t", overrides: lower });
  assert.equal(strict.reach.maxLevel, "L0");
  assert.ok(strict.chunks.formulas.items.every((f) => f.tier === "A"));
});

test("the closed beta and the dev profile carry every regional emergency row; there is no default region", () => {
  for (const { chunks } of [release, dev]) {
    const kb = indexKnowledgeBase(chunks);
    assert.equal(kb.emergency.regions.length, files.emergency.regions.length);
    assert.ok(!("default_region" in kb.emergency._meta));
    const tw = kb.emergency.regions.find((r) => r.id === "TW")!;
    assert.deepEqual(tw.emergency.map((n) => n.number), ["119"]);
    assert.deepEqual(tw.timezones, ["Asia/Taipei"]);
    assert.ok(kb.emergency.regions.some((r) => r.id === "OTHER" && r.emergency.length === 0), "the fallback region exists");
  }
});

test("a public build (no draft label) ships only verified emergency rows, and always the generic one", () => {
  const publicRelease = buildFromDisk("release", undefined, false);
  assert.deepEqual(publicRelease.chunks.core.emergency.regions.map((r) => r.id), ["OTHER"], "nothing is verified yet: the generic line is all a public build says");
  assert.equal(buildFromDisk("dev", undefined, false).chunks.core.emergency.regions.length, files.emergency.regions.length, "the dev profile is never a public build");
  // once a regional owner has verified a row it ships, and only that row
  const verified = structuredClone(files);
  verified.emergency.regions.find((r) => r.id === "HK")!.verification = { at: "2026-09-01", by: "regional owner", scope: "both", source: "an official page" };
  const built = buildChunks(verified, { profile: "release", version: "t", draftLabel: false });
  assert.deepEqual(built.chunks.core.emergency.regions.map((r) => r.id), ["HK", "OTHER"]);
});

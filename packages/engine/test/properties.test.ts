// The twelve properties of docs/test-plan.md §3.2, each over randomly generated people and through the whole pipeline (`assess`). Per-module versions of some of them live next to the
// code they exercise (patterns, panel, formulas, policy, safety); this file is the end-to-end suite CI runs on every commit and the nightly job runs ×10 with a fresh seed
// (`PROPERTY_RUNS`, `PROPERTY_SEED`; both are printed, and a failure prints the seed and the case). The table at the bottom is typed to need all twelve.
import assert from "node:assert/strict";
import { test } from "node:test";
import { indexKnowledgeBase, type KnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { assess, recomputeTier } from "../src/index.ts";
import type { AssessInput, Assessment, Findings, MedicationClass, Subject } from "../src/index.ts";
import { forAll, type Rng } from "./gen.ts";
import { dev, release } from "./kbs.ts";
import { interviewOf } from "./vignettes.ts";

const BIRTH = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
const SYMPTOMS = [...dev.symptoms.keys()];
const FLAGS = release.redFlags.map((f) => f.id);
const MEDS: readonly MedicationClass[] = ["anticoagulant", "antidiabetic", "antihypertensive", "diuretic", "cardiac-glycoside", "immunosuppressant", "sedative", "MAOI", "stimulant", "other"];
const ALLERGENS = ["當歸", "人參", "甘草", "薑", "xyzzy-nut"];
const LEVEL = { L0: 0, L1: 1, L2: 2, L3: 3 } as const;
const NOTICE = { none: 0, inline: 1, blocking_ack: 2 } as const;

/** A generated person: everything `assess` takes, as plain data (red flags as an array so it can be stored and replayed). */
interface Person { subject: Subject; redFlags: string[]; findings: Findings; context: { course: "acute" | "subacute" | "chronic" } | Record<string, never>; now: number; birth: boolean }

function randomFindings(rng: Rng, density = 0.1): Findings {
  return Object.fromEntries(rng.subset(SYMPTOMS, density).map((s) => [s, { state: rng.pick(["present", "present", "absent", "unsure"] as const), severity: rng.pick(["light", "moderate", "severe"] as const) }])) as Findings;
}
/** The adaptive inquiry of each pattern's typical patient: well-answered findings, so a random person can reach L1 in release and have formulas to filter (a purely random one rarely does). */
const INTERVIEWS = dev.patterns.map((p) => interviewOf(dev, p.id).findings);
/** Random answers, or — half the time — a typical patient's interview with a few answers changed. */
function randomFindingsOrTypical(rng: Rng): Findings {
  if (!rng.chance(0.5)) return randomFindings(rng, rng.pick([0.03, 0.1, 0.2]));
  return { ...rng.pick(INTERVIEWS), ...randomFindings(rng, 0.03) };
}
function randomPerson(rng: Rng): Person {
  const sex = rng.pick(["female", "male"] as const);
  return {
    subject: {
      ageYears: rng.pick([6, 15, 17, 18, 30, 45, 64, 65, 80]), sex, pregnancy: sex === "male" ? "not-applicable" : rng.pick(["no", "no", "possible", "yes"] as const), lactating: sex === "female" && rng.chance(0.1),
      medications: rng.subset(MEDS, 0.15), allergies: rng.subset(ALLERGENS, 0.15), seriousChronicDisease: rng.chance(0.05),
    },
    redFlags: rng.subset(FLAGS, 0.03), findings: randomFindingsOrTypical(rng), context: rng.pick([{ course: "acute" }, { course: "chronic" }, {}] as const) as Person["context"],
    now: Date.UTC(2026, rng.int(0, 11), rng.int(1, 28), 12), birth: rng.chance(0.3),
  };
}
/** Most of the time a person with no risk factor, so release can reach L1 and has formulas to filter; the rest keep whatever the generator drew. */
function calm(rng: Rng, p: Person): Person {
  return rng.chance(0.6) ? { ...p, redFlags: [], subject: { ...p.subject, ageYears: 35, pregnancy: p.subject.sex === "male" ? "not-applicable" : "no", lactating: false, medications: [], allergies: [], seriousChronicDisease: false } } : p;
}
const inputOf = (p: Person, over: { birthModule?: boolean; now?: number } = {}): AssessInput => ({
  subject: p.birth ? { ...p.subject, birth: BIRTH } : p.subject, redFlags: new Set(p.redFlags), findings: p.findings, ...(Object.keys(p.context).length > 0 ? { context: p.context } : {}),
  options: { now: over.now ?? p.now, birthModule: over.birthModule ?? p.birth },
});
const run = (kb: KnowledgeBase, p: Person, over: { birthModule?: boolean; now?: number } = {}): Assessment => assess(kb, inputOf(p, over));
const shownFormulas = (a: Assessment) => [...a.recommendations.formulas, ...a.recommendations.studyOnly];
const json = (x: unknown): string => JSON.stringify(x);

/** A release knowledge base whose population cells reach L1, so the safety rules (not the level) have to do the work. */
function releaseAtL1(cells: readonly string[]): KnowledgeBase {
  const raw = rawChunksFromDisk("release");
  const profile = structuredClone(raw.core.config.profile) as typeof raw.core.config.profile;
  for (const k of cells) (profile.population as Record<string, { level: string }>)[k]!.level = "L1";
  return indexKnowledgeBase({ ...raw, core: { ...raw.core, config: { ...raw.core.config, profile } } });
}

// ── the properties ──────────────────────────────────────────────────────────

const PROPERTIES = {
  P1: ["priors never change evidence: the pattern scores, the verdict and the primary offset are the same with the birth module on or off and at any date", () => {
    forAll("P1", 60, randomPerson, (p) => {
      const base = run(dev, p, { birthModule: false });
      const withBirth = run(dev, { ...p, birth: true }, { birthModule: true });
      const later = run(dev, { ...p, birth: true }, { birthModule: true, now: p.now + 200 * 86_400_000 });
      for (const other of [withBirth, later]) {
        assert.deepEqual(other.patterns, base.patterns);
        // the verdict keeps the same patterns, status and confidence; the one thing a prior may do is order two patterns that are within the tie margin (SOP §11, "平手裁決"), and then it says so
        const ids = (a: Assessment): string[] => a.verdict.patterns.map((x) => x.id);
        assert.deepEqual([...ids(other)].sort(), [...ids(base)].sort());
        assert.deepEqual([other.verdict.status, other.verdict.confidence], [base.verdict.status, base.verdict.confidence]);
        if (ids(other).join() !== ids(base).join()) {
          assert.equal(other.verdict.tieBreak?.by, "alignment", "the order changed without a recorded tie-break");
          assert.ok(other.patterns[0]!.pct - other.patterns[1]!.pct < dev.params.reconcile.tie_margin, "the order changed although the top two are not tied");
        }
        assert.deepEqual(other.panel.observed, base.panel.observed);
        assert.deepEqual(other.panel.offsetPopulation, other.panel.wuxingFunction, "the primary offset is exactly W");
        assert.deepEqual(other.panel.offsetPopulation, base.panel.offsetPopulation);
      }
    });
  }],

  P2: ["missing optional data never lowers a score: adding unsure or absent answers, or a tongue/pulse the person did not give, never decreases a pattern's Pct", () => {
    const optional = SYMPTOMS.filter((s) => s.startsWith("T_") || s.startsWith("P_"));
    forAll("P2", 80, (rng) => ({ p: randomPerson(rng), extra: rng.subset(SYMPTOMS, 0.3).concat(rng.subset(optional, 0.5)), state: rng.pick(["unsure", "absent"] as const) }), ({ p, extra, state }) => {
      const before = run(dev, p, { birthModule: false });
      const added: Findings = { ...p.findings, ...Object.fromEntries(extra.filter((s) => !(s in p.findings)).map((s) => [s, { state }])) };
      const after = run(dev, { ...p, findings: added }, { birthModule: false });
      const pct = new Map(before.patterns.map((x) => [x.id, x.pct]));
      for (const x of after.patterns) assert.ok(x.pct >= pct.get(x.id)! - 1e-9, `${x.id}: ${pct.get(x.id)} → ${x.pct}`);
    });
  }],

  P3: ["monotone policy: adding a risk factor never raises the level and never lowers the notice severity; the flow always continues", () => {
    forAll("P3", 120, (rng) => ({ p: randomPerson(rng), step: rng.int(0, 5), flag: rng.pick(FLAGS), med: rng.pick(MEDS) }), ({ p, step, flag, med }) => {
      const more: Person = structuredClone(p);
      if (step === 0) { more.subject = { ...more.subject, ageYears: Math.min(more.subject.ageYears, 16) }; }
      else if (step === 1) { more.subject = { ...more.subject, sex: "female", pregnancy: "yes" }; }
      else if (step === 2) { more.subject = { ...more.subject, sex: "female", lactating: true, pregnancy: more.subject.sex === "male" ? "no" : more.subject.pregnancy }; }
      else if (step === 3) { more.redFlags = [...new Set([...more.redFlags, flag])]; }
      else if (step === 4) { more.subject = { ...more.subject, seriousChronicDisease: true }; }
      else { more.subject = { ...more.subject, medications: [...new Set([...more.subject.medications, med])] }; }
      for (const kb of [release, dev]) {
        const a = run(kb, p), b = run(kb, more);
        assert.ok(LEVEL[b.policy.level] <= LEVEL[a.policy.level], `${kb.profile}: level ${a.policy.level} → ${b.policy.level}`);
        assert.ok(NOTICE[b.policy.notice] >= NOTICE[a.policy.notice], `${kb.profile}: notice ${a.policy.notice} → ${b.policy.notice}`);
        assert.equal(a.policy.flow, "continue");
        assert.equal(b.policy.flow, "continue");
      }
    });
  }],

  P4: ["dev opens, release restricts: dev is at least as open as release for everyone, release never goes above L1, and the blocking notices are the same", () => {
    forAll("P4", 150, randomPerson, (p) => {
      const r = run(release, p), d = run(dev, p);
      assert.ok(LEVEL[d.policy.level] >= LEVEL[r.policy.level], `dev ${d.policy.level} < release ${r.policy.level}`);
      assert.ok(LEVEL[r.policy.level] <= LEVEL.L1);
      assert.deepEqual(r.requiredAcknowledgements, d.requiredAcknowledgements);
      assert.deepEqual(r.policy.notices.filter((n) => n.kind === "blocking_ack"), d.policy.notices.filter((n) => n.kind === "blocking_ack"));
    });
  }],

  P5: ["determinism: two runs are deep-equal, and the order of the keys of the input and of the red flags changes nothing", () => {
    forAll("P5", 60, randomPerson, (p) => {
      for (const kb of [release, dev]) {
        const a = run(kb, p);
        assert.deepEqual(run(kb, p), a);
        const shuffled: Person = { ...p, findings: Object.fromEntries(Object.entries(p.findings).reverse()) as Findings, redFlags: [...p.redFlags].reverse() };
        assert.deepEqual(run(kb, shuffled), a);
      }
    });
  }],

  P6: ["bounded values: Pct ∈ [0, 100], panel values within the channel range, k ∈ [0, 3] and the explained fraction ≤ 1 for every formula shown", () => {
    forAll("P6", 120, randomPerson, (p) => {
      const a = run(dev, p);
      for (const x of a.patterns) assert.ok(x.pct >= 0 && x.pct <= 100 + 1e-9, `${x.id} Pct ${x.pct}`);
      for (const [dim, v] of Object.entries(a.panel.observed)) assert.ok(Math.abs(v) <= 3 + 1e-9, `${dim} = ${v}`);
      for (const f of shownFormulas(a)) { assert.ok(f.fit.k >= 0 && f.fit.k <= 3 + 1e-9, `${f.id} k ${f.fit.k}`); assert.ok(f.fit.explained <= 1 + 1e-9, `${f.id} explained ${f.fit.explained}`); }
    });
  }],

  P7: ["suppression is visible: every formula the dev profile shows is, in release, either shown or listed as suppressed — and nothing is both", () => {
    let withFormulas = 0;
    forAll("P7", 120, (rng) => calm(rng, randomPerson(rng)), (p) => {
      const r = run(release, p), d = run(dev, p);
      const shown = new Set(shownFormulas(r).map((f) => f.id));
      const listed = new Set(r.suppressed.filter((s) => s.kind === "formula").map((s) => s.id));
      if (shownFormulas(d).length > 0) withFormulas++;
      for (const id of shown) assert.ok(!listed.has(id), `${id} is both shown and suppressed`);
      for (const f of shownFormulas(d)) {
        if (f.tier !== "A") continue;                                   // tier B and C formulas are not even shipped in the release data (the profile cannot reach them)
        assert.ok(shown.has(f.id) || listed.has(f.id), `${f.id} (${f.tier}) shown in dev vanished in release`);
      }
      for (const s of r.suppressed) assert.ok((s.reason === "rule") === (s.ruleId !== null), `${s.id}: reason ${s.reason} rule ${s.ruleId}`);
    });
    assert.ok(withFormulas >= 10, `only ${withFormulas} generated people had formulas to account for: the property is vacuous`);
  }],

  P8: ["policy at the producer: no output exists above the effective level (no amounts, modifications, tiers, points or diet the policy does not allow)", () => {
    let releaseWithFormulas = 0, devWithStudy = 0;
    forAll("P8", 120, (rng) => calm(rng, randomPerson(rng)), (p) => {
      for (const kb of [release, dev]) {
        const a = run(kb, p);
        const features = a.policy.features, out = json(a.recommendations);
        if (kb.profile === "release" && a.recommendations.formulas.length > 0) releaseWithFormulas++;
        if (kb.profile === "dev" && a.recommendations.studyOnly.length > 0) devWithStudy++;
        if (!features.dosage) assert.ok(!out.includes("typicalG") && !out.includes("classicalAmount"), `${kb.profile}: amounts without permission`);
        if (!features.modification) assert.ok(a.recommendations.formulas.every((f) => f.classicalModifications.length === 0 && f.residualModification === null), `${kb.profile}: a modification without permission`);
        if (!features.formulas) assert.deepEqual([a.recommendations.formulas.length, a.recommendations.studyOnly.length], [0, 0]);
        if (!features.acupoints) assert.deepEqual(a.recommendations.acupoints, []);
        if (!features.diet) assert.deepEqual(a.recommendations.foods, []);
        for (const f of shownFormulas(a)) assert.ok(features.tiers.includes(f.tier), `${kb.profile}: tier ${f.tier} shown at ${a.policy.level}`);
        if (a.verdict.status === "insufficient") assert.deepEqual(shownFormulas(a), []);
      }
    });
    assert.ok(releaseWithFormulas >= 5 && devWithStudy >= 1, `vacuous: ${releaseWithFormulas} release people with formulas, ${devWithStudy} dev people with study-only formulas`);
  }],

  P9: ["exclusion handling: mutually exclusive findings produce a conflict item, never a silent choice", () => {
    const groups = dev.exclusions.groups.filter((g) => g.kind === "exclusive");
    assert.ok(groups.length > 0);
    forAll("P9", 80, (rng) => ({ p: randomPerson(rng), g: rng.pick(groups) }), ({ p, g }) => {
      const findings: Findings = { ...p.findings, ...Object.fromEntries(g.symptoms.map((s) => [s, { state: "present" as const, severity: "moderate" as const }])) };
      for (const kb of [release, dev]) {
        const a = run(kb, { ...p, findings });
        const c = a.quality.conflicts.find((x) => x.group === g.id);
        assert.ok(c, `${kb.profile}: no conflict reported for ${g.id}`);
        assert.deepEqual([...c.symptoms].sort(), [...g.symptoms].sort());
      }
    });
  }],

  P10: ["formula safety: in release a pregnant (or possibly pregnant) person never gets a formula with an avoid/caution herb, and a user of an anticoagulant never gets one with an activating herb", () => {
    const kb = releaseAtL1(["pregnant", "minor_under_18", "lactating"]);
    let removedForPregnancy = 0, removedForAnticoagulant = 0;
    forAll("P10", 250, (rng) => ({ p: { ...calm(rng, randomPerson(rng)), findings: { ...rng.pick(INTERVIEWS), ...randomFindings(rng, 0.02) } }, pregnant: rng.chance(0.5), anticoag: rng.chance(0.5) }), ({ p, pregnant, anticoag }) => {
      const subject: Subject = { ...p.subject, sex: pregnant ? "female" : p.subject.sex, pregnancy: pregnant ? pregnancyStatus(p) : p.subject.pregnancy, medications: anticoag ? [...new Set([...p.subject.medications, "anticoagulant" as const])] : p.subject.medications };
      const a = run(kb, { ...p, subject });
      removedForPregnancy += a.suppressed.filter((x) => x.ruleId?.startsWith("R_PREG_HERB")).length;
      removedForAnticoagulant += a.suppressed.filter((x) => x.ruleId === "R_ANTICOAGULANT").length;
      for (const f of shownFormulas(a)) {
        const rec = kb.formulas.get(f.id)!;
        if (subject.pregnancy === "yes" || subject.pregnancy === "possible") assert.ok(rec.pregnancy !== "avoid" && rec.pregnancy !== "caution", `pregnant user got ${f.id} (${rec.pregnancy})`);
        if (anticoag) assert.ok(!rec.interactions.includes("anticoagulant"), `anticoagulant user got ${f.id}`);
      }
    });
    assert.ok(removedForPregnancy >= 3 && removedForAnticoagulant >= 3, `vacuous: the rules removed ${removedForPregnancy} formulas for pregnancy and ${removedForAnticoagulant} for anticoagulants`);
  }],

  P11: ["tier consistency: the tier recomputed from the herbs equals the stored tier for every formula, and flagging any herb as strong can only raise a tier", () => {
    const order = { A: 0, B: 1, C: 2 } as const;
    for (const f of dev.formulas.values()) assert.equal(recomputeTier(dev, f), f.tier, f.id);
    const ids = [...dev.formulas.keys()];
    forAll("P11", 40, (rng) => ({ f: dev.formulas.get(rng.pick(ids))! }), ({ f }) => {
      for (const c of f.composition) {
        const strong = indexKnowledgeBase({ ...rawChunksFromDisk("dev"), core: (() => { const raw = rawChunksFromDisk("dev"); return { ...raw.core, params: { ...raw.core.params, tier: { ...raw.core.params.tier, strong_herbs: [...raw.core.params.tier.strong_herbs, c.herb] } } }; })() });
        const after = recomputeTier(strong, strong.formulas.get(f.id)!)!;
        assert.ok(order[after] >= order[f.tier], `${f.id}: making ${c.herb} strong lowered ${f.tier} to ${after}`);
        assert.equal(after, "C", `${f.id} contains the strong herb ${c.herb}`);
      }
    }, 20261005);
  }],

  P12: ["idempotent save and load: storing the input as JSON and assessing it again gives the same assessment", () => {
    forAll("P12", 60, randomPerson, (p) => {
      for (const kb of [release, dev]) {
        const i = inputOf(p);
        const a = assess(kb, i);
        const stored = JSON.parse(JSON.stringify({ ...i, redFlags: [...i.redFlags] })) as Omit<AssessInput, "redFlags"> & { redFlags: string[] };
        const again = assess(kb, { ...stored, redFlags: new Set(stored.redFlags) });
        assert.deepEqual(JSON.parse(json(again)), JSON.parse(json(a)));
      }
    });
  }],
} satisfies Record<`P${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}`, [string, () => void]>;

/** "possibly pregnant" half of the time, so both statuses are exercised. */
const pregnancyStatus = (p: Person): "yes" | "possible" => (p.now % 2 === 0 ? "yes" : "possible");

for (const [id, [title, body]] of Object.entries(PROPERTIES)) test(`property ${id}: ${title}`, body);

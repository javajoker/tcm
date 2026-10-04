// Runs every safety vignette against the real knowledge base in both profiles; a failure blocks the release (docs/safety-policy.md §9, test plan §3.3).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dev, release } from "./kbs.ts";
import { check, expectFor, runVignette, vignetteFiles, type Profile } from "./vignettes.ts";

const KB = { release, dev } as const;
const files = vignetteFiles();

describe("safety vignettes", () => {
  for (const { file, vignettes } of files) {
    describe(file, () => {
      for (const v of vignettes) {
        for (const profile of ["release", "dev"] as Profile[]) {
          test(`${v.id} · ${profile} — ${v.title}`, () => {
            const problems = check(runVignette(KB[profile], v), expectFor(v, profile));
            assert.deepEqual(problems, [], `${v.id} (${profile}): ${v.title}${v.ref ? ` [${v.ref}]` : ""}`);
          });
        }
      }
    });
  }
});

describe("the suite covers what the policy names", () => {
  const all = files.flatMap((f) => f.vignettes);
  const expectations = all.flatMap((v) => (["both", "release", "dev"] as const).map((k) => v.expect[k]).filter((e) => e !== undefined));
  const used = (pick: (v: (typeof all)[number]) => readonly string[]): Set<string> => new Set(all.flatMap(pick));

  test("ids are unique and every vignette says what it expects", () => {
    const ids = all.map((v) => v.id);
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
    for (const v of all) assert.ok(Object.keys(v.expect).length > 0 && expectations.length > 0, v.id);
  });

  test("every red-flag item of the knowledge base has a vignette of its own", () => {
    const flags = used((v) => (v.kind === "candidates" ? [] : v.input.redFlags ?? []));
    assert.deepEqual(release.redFlags.map((r) => r.id).filter((id) => !flags.has(id)), []);
    assert.equal(release.redFlags.length, 28);
  });

  test("every medication class and every notice id of the catalogue is exercised", () => {
    const classes = used((v) => (v.kind === "candidates" ? [] : v.input.subject?.medications ?? []));
    assert.deepEqual(["anticoagulant", "antidiabetic", "antihypertensive", "diuretic", "cardiac-glycoside", "immunosuppressant", "sedative", "MAOI", "stimulant", "other"].filter((c) => !classes.has(c)), []);
    const notices = new Set(expectations.flatMap((e) => e.notices ?? []));
    assert.deepEqual(["N-A", "N-B", "N-MINOR", "N-PREG", "N-LACT", "N-SERIOUS", "N-ELDERLY", "N-MED", "N-ALLERGY", "N-ACUTE", "N-LOWCONF", "N-CONFLICT"].filter((n) => !notices.has(n)), []);
  });

  test("every safety rule is asserted by a vignette, or is listed here with the test that covers it instead", () => {
    const elsewhere: Record<string, string> = {
      R_LOW_CONFIDENCE: "the state vignettes assert the L0 it causes",
      R_TEBING_CONSTITUTION: "needs the constitution questionnaire: test/constitution.test.ts, test/safety.test.ts",
      R_PATTERN_HEAT_VS_WARM: "needs a mismatch between the person and a formula: test/safety.test.ts (pattern-direction conflicts)",
      R_PATTERN_COLD_VS_COLD: "same", R_EXCESS_VS_TONIC: "same", R_DEFICIENCY_VS_ATTACK: "same",
      R_SHIBAFAN: "herb pairs of a modification: test/safety.test.ts",
    };
    const named = new Set(expectations.flatMap((e) => [...Object.values(e.annotated ?? {}).flat(), ...(e.suppressed ?? []).map((s) => s.ruleId ?? "")]));
    const missing = release.safety.rules.map((r) => r.id).filter((id) => !named.has(id) && !(id in elsewhere));
    assert.deepEqual(missing, [], "a new safety rule needs a vignette (or an entry in `elsewhere` naming the test that covers it)");
    assert.deepEqual(Object.keys(elsewhere).filter((id) => named.has(id) && id !== "R_LOW_CONFIDENCE"), [], "remove the entry: a vignette covers it now");
  });

  test("every food with a pregnancy caution has a vignette of its own", () => {
    const ids = new Set(all.map((v) => v.id));
    assert.deepEqual(release.treatment.food_pregnancy_caution.filter((f) => !ids.has(`PREG-FOOD-${f}`)), []);
    assert.deepEqual(release.treatment.food_pregnancy_caution.length, 5);
  });

  test("the checker is not vacuous: wrong expectations are reported", () => {
    const v = all.find((x) => x.id === "POP-ADULT")!;
    const view = runVignette(release, v);
    assert.deepEqual(check(view, { level: "L0" }), ["level L1, expected L0"]);
    assert.ok(check(view, { notices: ["N-MINOR"] }).length > 0);
    assert.ok(check(view, { hide: ["F_SHENLING"] }).length > 0);
    assert.ok(check(view, { noFormulas: true }).length > 0);
    assert.ok(check(view, { suppressed: [{ kind: "formula", id: "F_SHENLING", reason: "rule", ruleId: "R_ANTICOAGULANT" }] }).length > 0);
    assert.ok(check({ ...view, flow: "stop" }, {}).length > 0, "the flow invariant");
    assert.ok(check({ ...view, shown: [...view.shown, { kind: "formula", id: "F_X", tier: "A", rules: [] }], suppressed: [{ kind: "formula", id: "F_X", reason: "level", ruleId: null }] }, {}).length > 0, "shown and suppressed at once");
  });
});

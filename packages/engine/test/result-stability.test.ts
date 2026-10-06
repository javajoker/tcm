// A northern result never changes (five-phase extensions design §3, §9; task PM-26). The southern basis, the person's choice of no seasons and every later extension are additive: with the default they
// are absent from the result, and the result — all of it, the parameter stamp included — comes out byte for byte as it did before they existed. The hashes below were recorded from the engine BEFORE the
// southern basis was written, over whole results (canonical JSON). A saved result is proved genuine by re-running it and comparing exactly, so this is also what keeps every saved result replayable.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { assess } from "../src/index.ts";
import type { AssessInput, Findings, Subject } from "../src/index.ts";
import { dev, release } from "./kbs.ts";
import { PARITY } from "./parity.ts";

const canonical = (v: unknown): string => JSON.stringify(v, (_k, x) => (x !== null && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x));
const sha = (v: unknown): string => createHash("sha256").update(canonical(v)).digest("hex").slice(0, 16);

const BIRTH = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
const person = (over: Partial<Subject> = {}): Subject => ({ ageYears: 35, sex: "female", pregnancy: "no", lactating: false, medications: [], allergies: [], seriousChronicDisease: false, ...over });
const worked: Findings = PARITY.cases.find((c) => c.id === "worked-example")!.findings;
const answers = Object.fromEntries(dev.constitutionItems.types.flatMap((t) => t.items).map((it, i) => [it.id, i % 3 === 0 ? 5 : 2]));

const at = (y: number, m: number, d: number): number => Date.UTC(y, m - 1, d, 12);
const input = (now: number, over: Partial<AssessInput> = {}, s: Partial<Subject> = {}, options: Partial<AssessInput["options"]> = {}): AssessInput =>
  ({ subject: person(s), redFlags: new Set(), findings: worked, constitutionAnswers: answers, options: { now, birthModule: false, ...options }, ...over });

/** [label, run] — a spread of seasons, models, profiles and birth data. */
const CASES: readonly (readonly [string, () => unknown])[] = [
  ["dev, spring, no birth data", () => assess(dev, input(at(2026, 3, 20)))],
  ["dev, long summer, no birth data", () => assess(dev, input(at(2026, 7, 20)))],
  ["dev, autumn, birth data", () => assess(dev, input(at(2026, 10, 3), {}, { birth: BIRTH }, { birthModule: true }))],
  ["dev, winter, birth data, the other season model", () => assess(dev, input(at(2026, 12, 25), {}, { birth: BIRTH }, { birthModule: true, seasonModel: "tuwang18" }))],
  ["dev, the days before a season change under the other model", () => assess(dev, input(at(2026, 8, 1), {}, {}, { seasonModel: "tuwang18" }))],
  ["release, autumn, birth module on", () => assess(release, input(at(2026, 10, 3), {}, { birth: BIRTH }, { birthModule: true }))],
  ["release, summer, no birth data", () => assess(release, input(at(2026, 6, 21)))],
];

/** Recorded from the unmodified engine; `RECORD=1 node --test test/result-stability.test.ts` prints them again (never to be done after the southern basis exists, but to be read against). */
const PINNED: Readonly<Record<string, string>> = {
  "dev, spring, no birth data": "73a0fb6eb26fe0a7",
  "dev, long summer, no birth data": "544d5f962db9b054",
  "dev, autumn, birth data": "0eb560c892edaf24",
  // The two cases of the other season model were recorded again at PM-29, when that model began to end the stamp of the parameters ("+tuwang18"): with the ending removed they hash to the values first
  // recorded here (46d6b887e505bc42 and 853933c63a8260dc), so nothing else changed. The app has never offered a way to ask for that model, so no saved result of it exists to be replayed.
  "dev, winter, birth data, the other season model": "a2a321102220c366",
  "dev, the days before a season change under the other model": "76a0dee8da92d3c0",
  "release, autumn, birth module on": "18ecb824d0190064",
  "release, summer, no birth data": "78658bf0e53e6988",
  /** The stamp of the parameters of a result with birth data: the knowledge base's parameters, then the five-phase module's. */
  paramsFingerprint: "366e19e0+4c3e3303",
};

if (process.env["RECORD"] === "1") {
  test("record", () => { for (const [label, run] of CASES) console.log(`${JSON.stringify(label)}: ${JSON.stringify(sha(run()))},`); });
} else {
  for (const [label, run] of CASES) {
    test(`a northern result is exactly what it was: ${label}`, () => {
      assert.equal(sha(run()), PINNED[label], `the result of "${label}" changed`);
    });
  }
  test("the stamp of the parameters of a northern result is the one it always was", () => {
    const a = assess(dev, input(at(2026, 3, 20), {}, { birth: BIRTH }, { birthModule: true }));
    assert.equal(a.meta.paramsFingerprint, PINNED["paramsFingerprint"]);
    assert.equal(a.meta.seasonModel, "changxia");
    assert.deepEqual(Object.keys(a.meta).sort(), ["computedAt", "engineVersion", "kbVersion", "paramsFingerprint", "profile", "seasonModel"], "no new key in the stamp of a default result");
  });
}

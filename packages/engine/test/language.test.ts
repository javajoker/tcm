// The language never reaches the engine (docs/post-mvp/design/simplified-chinese.md §6): the knowledge base is the same whichever script the page shows, the display function is not read by the
// engine or the safety rules, and every output — patterns, formulas, notices, levels, suppressed items — is identical. True by construction; kept as a test so that it stays true.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { alignedList, chineseStrings, indexKnowledgeBase, newDisplay, type KnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { assess, type Subject } from "../src/index.ts";
import { dev, release } from "./kbs.ts";
import { interviewOf, runVignette, vignetteFiles } from "./vignettes.ts";

const dictionary = (JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "scripts", "i18n", "zh-Hans.dictionary.json"), "utf8")) as { entries: Record<string, string> }).entries;

/** The same chunks with a Simplified display function built the way the loader builds it — or, with `forbid`, with one that fails when anything reads display text. */
function withDisplay(profile: "dev" | "release", forbid = false): KnowledgeBase {
  const raw = rawChunksFromDisk(profile);
  if (forbid) return indexKnowledgeBase(raw, { zh: () => { throw new Error("the engine read display text"); }, traditional: () => { throw new Error("the engine read display text"); } });
  const list = chineseStrings(raw.core, raw.formulas, raw.citations, raw.guidance, raw.herbs);
  const display = newDisplay();
  display.add(list, alignedList(list, dictionary));
  return indexKnowledgeBase(raw, display);
}
const NOW = Date.UTC(2026, 9, 4, 12);

function typical(kb: KnowledgeBase, id: string): ReturnType<typeof assess> {
  const { findings, sex } = interviewOf(dev, id);
  const subject: Subject = { ageYears: 35, sex, pregnancy: sex === "female" ? "no" : "not-applicable", lactating: false, medications: [], allergies: [], seriousChronicDisease: false };
  return assess(kb, { subject, redFlags: new Set(), findings, context: { course: "chronic" }, options: { now: NOW, birthModule: false } });
}

for (const profile of ["dev", "release"] as const) {
  const plain = profile === "dev" ? dev : release;
  const hans = withDisplay(profile);

  test(`${profile}: the same chunks load whichever script is shown`, () => {
    assert.equal(hans.script, "Hans");
    assert.equal(plain.script, "Hant");
    assert.equal(hans.version, plain.version);
    assert.deepEqual(hans.patterns, plain.patterns);
    assert.deepEqual([...hans.formulas.values()], [...plain.formulas.values()]);
    assert.deepEqual(hans.safety, plain.safety);
    assert.deepEqual(hans.treatment, plain.treatment);
  });

  test(`${profile}: every pattern's typical patient gets the same assessment`, () => {
    for (const p of plain.patterns) assert.deepEqual(typical(hans, p.id), typical(plain, p.id), p.id);
  });

  test(`${profile}: every safety vignette gives the same view`, () => {
    let n = 0;
    for (const { vignettes } of vignetteFiles()) for (const v of vignettes) { assert.deepEqual(runVignette(hans, v), runVignette(plain, v), v.id); n++; }
    assert.ok(n > 90);
  });

  test(`${profile}: the engine and the safety rules never read display text`, () => {
    const trap = withDisplay(profile, true);
    for (const p of trap.patterns) typical(trap, p.id);
    for (const { vignettes } of vignetteFiles()) for (const v of vignettes) runVignette(trap, v);
  });
}

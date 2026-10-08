// Micro-benchmark of the engine (task E-19): `assess` for the typical patients of all 23 patterns in both profiles, and `nextQuestions` for the inquiry.
//   node bench/assess.bench.ts [--check] [--write-baseline] [--json <file>]
// --check compares with bench/baseline.json (exit 1 on a violation: over 50 ms p95, or more than 20 % slower relative to the reference workload); --write-baseline records this run.
// Timing is noisy: each measurement is the median of three rounds, and the baseline is a ratio to a fixed reference workload, not milliseconds.
// `nextQuestions` takes about 0.1 ms — close to the noise of a single timing — so it is timed in batches of `BATCH` calls and reported per call.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { indexKnowledgeBase, type KnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { assess, nextQuestions } from "../src/index.ts";
import type { AssessInput, Findings } from "../src/index.ts";
import { interviewOf } from "../test/vignettes.ts";
import { LIMITS, measureOf, median, violations, type Measure, type Report } from "./stats.ts";

const baselinePath = join(import.meta.dirname, "baseline.json");
/** Calls of `nextQuestions` per timed sample. */
const BATCH = 10;
const NOW = Date.UTC(2026, 9, 4, 12);

/** A fixed, allocation-free workload: the machine's speed in one number. */
function referenceMs(): number {
  const once = (): number => { const t = performance.now(); let x = 0; for (let i = 1; i < 3_000_000; i++) x += Math.sqrt(i) * Math.sin(i); if (x === 42) console.log(x); return performance.now() - t; };
  once();
  return median([once(), once(), once(), once(), once()]);
}

function time(n: number, fn: (i: number) => void): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) { const t = performance.now(); fn(i); out.push(performance.now() - t); }
  return out;
}
const rounds = (n: number, fn: (i: number) => void): Measure => {
  for (let i = 0; i < 20; i++) fn(i);                                       // warm up the JIT
  const ms = [measureOf(time(n, fn)), measureOf(time(n, fn)), measureOf(time(n, fn))];
  return { p50: median(ms.map((m) => m.p50)), p95: median(ms.map((m) => m.p95)), max: Math.max(...ms.map((m) => m.max)), runs: n * 3 };
};

export function runBench(): Report {
  const dev = indexKnowledgeBase(rawChunksFromDisk("dev")), release = indexKnowledgeBase(rawChunksFromDisk("release"));
  const kbs: KnowledgeBase[] = [release, dev];
  const people = dev.patterns.map((p) => { const iv = interviewOf(dev, p.id); return { findings: iv.findings, sex: iv.sex }; });
  const input = (p: { findings: Findings; sex: "female" | "male" }): AssessInput => ({
    subject: { ageYears: 35, sex: p.sex, pregnancy: p.sex === "female" ? "no" : "not-applicable", lactating: false, medications: [], allergies: [], seriousChronicDisease: false },
    redFlags: new Set(), findings: p.findings, context: { course: "chronic" }, options: { now: NOW, birthModule: true },
  });
  const ref = referenceMs();
  const a = rounds(200, (i) => { assess(kbs[i % 2]!, input(people[i % people.length]!)); });
  const batch = rounds(200, (i) => {
    const p = people[i % people.length]!;
    for (let k = 0; k < BATCH; k++) nextQuestions(dev, { sex: p.sex, pregnancy: p.sex === "female" ? "no" : "not-applicable", findings: p.findings, modules: [], context: { course: "chronic" } }, 1);
  });
  const q: Measure = { p50: batch.p50 / BATCH, p95: batch.p95 / BATCH, max: batch.max / BATCH, runs: batch.runs * BATCH };
  return { referenceMs: ref, assess: { ...a, ratio: a.p95 / ref }, nextQuestions: { ...q, ratio: q.p95 / ref } };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const report = runBench();
  const row = (name: string, m: Measure & { ratio: number }): string => `${name.padEnd(14)} p50 ${m.p50.toFixed(2).padStart(7)} ms   p95 ${m.p95.toFixed(2).padStart(7)} ms   max ${m.max.toFixed(1).padStart(6)} ms   ratio ${m.ratio.toFixed(3)}   (${m.runs} runs)`;
  console.log(`reference workload ${report.referenceMs.toFixed(1)} ms\n${row("assess", report.assess)}\n${row("nextQuestions", report.nextQuestions)}`);
  if (args.includes("--json")) writeFileSync(args[args.indexOf("--json") + 1]!, `${JSON.stringify(report, null, 2)}\n`);
  if (args.includes("--write-baseline")) { writeFileSync(baselinePath, `${JSON.stringify(report, null, 2)}\n`); console.log("baseline written"); }
  if (args.includes("--check")) {
    let baseline: Report | null = null;
    try { baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Report; } catch { console.log("no baseline: only the absolute budget is checked"); }
    const v = violations(report, baseline, LIMITS);
    for (const m of v) console.error(`✗ ${m}`);
    console.log(v.length === 0 ? "bench: within the budget and the baseline" : `bench: ${v.length} violation(s)`);
    process.exit(v.length === 0 ? 0 : 1);
  }
}

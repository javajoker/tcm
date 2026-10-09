// Where the golden cases miss, and why (task PM-59; docs/test-plan.md §3.5, content review §4.4): every miss placed at the step of the engine where it happens. The tuning half is
// shown case by case with what would have changed the outcome; the held-out half only as counts, so that nobody tunes to it. Writes docs/golden-misses.md for the clinical
// reviewers; changes no weight, no parameter and no case.
//   node scripts/golden-misses.ts                    print the report
//   node scripts/golden-misses.ts --write            write docs/golden-misses.md
//   node scripts/golden-misses.ts --check            exit 1 when the committed report is not what the cases and the knowledge base give (`pnpm test:scripts`)
//   node scripts/golden-misses.ts --held-out-detail  print the held-out misses case by case, to the terminal only — after a calibration session has closed, never while tuning
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { indexKnowledgeBase } from "../packages/kb/src/indexer.ts";
import { rawChunksFromDisk } from "../packages/kb/node/fromDisk.ts";
import type { KnowledgeBase } from "../packages/kb/src/types.ts";
import { candidateFormulaIds, fitFormulas, MAX_RECOMMENDED_FORMULAS, normalize, passesSymptomFit, type Findings } from "../packages/engine/src/index.ts";
import { assessGolden, evaluateCase, missedTargets, pct, summarize, topFormulas, topPatterns, type CaseResult, type GoldenCase, type GoldenInput, type Split } from "../packages/engine/src/golden.ts";
import { loadGoldenCases, loadGoldenConfig } from "../packages/engine/test/golden-files.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const REPORT = join(root, "docs", "golden-misses.md");

/** Where a pattern expectation fails: no pattern reaches the threshold of presentation; others are presented instead; or the expected one is presented but not first. */
export type PatternMissKind = "no-verdict" | "not-presented" | "not-first";
/**
 * Where a formula expectation fails, in the order of the engine's steps (SOP §12.4): no pattern is presented; the expected formulas belong to no presented pattern; they fail the
 * symptom fit; the safety rules or the output level remove them; or they are kept and ranked after the third.
 */
export type FormulaMissKind = "no-verdict" | "pattern-missed" | "symptom-fit" | "removed" | "ranked-lower";

export const PATTERN_KINDS: Readonly<Record<PatternMissKind, string>> = {
  "no-verdict": "no pattern reaches the threshold of presentation: the engine says there is not enough information",
  "not-presented": "other patterns are presented, the expected one is not",
  "not-first": "the expected pattern is presented, but not first",
};
export const FORMULA_KINDS: Readonly<Record<FormulaMissKind, string>> = {
  "no-verdict": "no pattern is presented, so no formula is",
  "pattern-missed": "the expected formulas belong to none of the patterns presented",
  "symptom-fit": "the expected formulas fail the symptom fit",
  "removed": "the expected formulas are removed by a safety rule or the output level",
  "ranked-lower": "the expected formulas are kept but ranked after the third",
};

export interface ScoreOf { readonly id: string; readonly pct: number; readonly band: string; readonly positive: number; readonly maxScore: number; readonly requiredPresent: boolean }
export interface Miss {
  readonly id: string;
  readonly split: Split;
  readonly pattern: { readonly kind: PatternMissKind; readonly wanted: readonly string[]; readonly presented: readonly string[]; readonly scores: readonly ScoreOf[] } | null;
  readonly formula: { readonly kind: FormulaMissKind; readonly wanted: readonly string[]; readonly got: readonly string[] } | null;
}

export interface Kbs { readonly dev: KnowledgeBase; readonly release: KnowledgeBase }
export const loadKbs = (): Kbs => ({ dev: indexKnowledgeBase(rawChunksFromDisk("dev")), release: indexKnowledgeBase(rawChunksFromDisk("release")) });

const presentOf = (kb: KnowledgeBase, input: GoldenInput): ReadonlySet<string> =>
  normalize(kb, { findings: input.findings, sex: input.subject.sex, pregnancy: input.subject.pregnancy, ...(input.context ? { context: input.context } : {}) }).present;

/** The step at which a case's pattern and formula expectations fail (on the development profile, as the golden check judges them); null when nothing fails. */
export function classify(kb: KnowledgeBase, c: GoldenCase, r: CaseResult): Miss | null {
  const patternMissed = r.patternFirst === false || r.patternTop3 === false;
  const formulaMissed = r.formulaTop3 === false;
  if (!patternMissed && !formulaMissed) return null;
  const a = assessGolden(kb, c.input);
  const presented = a.verdict.patterns.map((p) => p.id);
  const wanted = c.expect.patterns?.first !== undefined ? [c.expect.patterns.first] : [...(c.expect.patterns?.top3 ?? [])];
  const pattern = !patternMissed ? null : {
    kind: (a.verdict.status === "insufficient" ? "no-verdict" : wanted.some((p) => presented.includes(p)) ? "not-first" : "not-presented") as PatternMissKind,
    wanted, presented,
    scores: wanted.map((id) => a.patterns.find((p) => p.id === id)!).map((p) => ({ id: p.id, pct: p.pct, band: p.band, positive: p.positive, maxScore: p.maxScore, requiredPresent: p.requiredPresent })),
  };
  let formula: Miss["formula"] = null;
  if (formulaMissed) {
    const expected = c.expect.formulas!.top3!;
    let kind: FormulaMissKind;
    if (a.verdict.status === "insufficient") kind = "no-verdict";
    else {
      const candidates = new Set(candidateFormulaIds(kb, presented));
      const linked = expected.filter((f) => candidates.has(f));
      const passing = new Set(fitFormulas(kb, a.panel.observed, { present: presentOf(kb, c.input) }, candidates).filter((f) => passesSymptomFit(kb, f)).map((f) => f.id));
      const fitting = linked.filter((f) => passing.has(f));
      kind = linked.length === 0 ? "pattern-missed" : fitting.length === 0 ? "symptom-fit"
        : fitting.every((f) => a.suppressed.some((s) => s.kind === "formula" && s.id === f)) ? "removed" : "ranked-lower";
    }
    formula = { kind, wanted: expected, got: topFormulas(a) };
  }
  return { id: c.id, split: c.split, pattern, formula };
}

// ── the tuning half, case by case ───────────────────────────────────────────

const OBSERVED = /^(T|P)_/;
const fmt = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);

/** A pattern's evidence weight, split by where it can come from: the questions, the tongue (T_) and the pulse (P_) — the last two are optional observations in the app. */
export function weightBySource(kb: KnowledgeBase, patternId: string): { readonly inquiry: number; readonly tongue: number; readonly pulse: number; readonly total: number } {
  const w = Object.entries(kb.patternById.get(patternId)!.weights);
  const sum = (pred: (id: string) => boolean): number => w.filter(([id]) => pred(id)).reduce((n, [, v]) => n + v, 0);
  return { inquiry: sum((id) => !OBSERVED.test(id)), tongue: sum((id) => id.startsWith("T_")), pulse: sum((id) => id.startsWith("P_")), total: sum(() => true) };
}

/** The same case with one thing changed, to show what would have changed the outcome — for the reviewers' understanding; no case and no weight is changed. */
export function whatIfs(kb: KnowledgeBase, c: GoldenCase, patternId: string): { readonly label: string; readonly pct: number; readonly verdict: string; readonly formulas: readonly string[] }[] {
  const p = kb.patternById.get(patternId)!;
  const variants: [string, Findings][] = [
    ["the same answers, each graded severe instead of moderate", Object.fromEntries(Object.entries(c.input.findings).map(([id, f]) => [id, f.state === "present" && f.severity === "moderate" ? { ...f, severity: "severe" } : f]))],
    [`also the inquiry signs of ${patternId} the case answers as absent (moderate)`, { ...c.input.findings, ...Object.fromEntries(Object.keys(p.weights).filter((id) => !OBSERVED.test(id) && c.input.findings[id]?.state === "absent").map((id) => [id, { state: "present", severity: "moderate" }])) }],
    [`also the tongue of ${patternId} (its tongue signs of weight ≥ 2, moderate)`, { ...c.input.findings, ...Object.fromEntries(Object.entries(p.weights).filter(([id, w]) => id.startsWith("T_") && w >= 2).map(([id]) => [id, { state: "present", severity: "moderate" }])) }],
    [`also the tongue and the pulse of ${patternId} (weight ≥ 2, moderate)`, { ...c.input.findings, ...Object.fromEntries(Object.entries(p.weights).filter(([id, w]) => OBSERVED.test(id) && w >= 2).map(([id]) => [id, { state: "present", severity: "moderate" }])) }],
  ];
  return variants.map(([label, findings]) => {
    const a = assessGolden(kb, { ...c.input, findings } as GoldenInput);
    const own = a.patterns.find((x) => x.id === patternId)!;
    return { label, pct: own.pct, verdict: a.verdict.status === "insufficient" ? "not enough information" : `presented: ${topPatterns(a).join(", ")}`, formulas: topFormulas(a) };
  });
}

function caseDetail(kb: KnowledgeBase, c: GoldenCase, m: Miss): string {
  const sym = (id: string): string => `${kb.symptoms.get(id)?.["zh-Hant"] ?? id} (\`${id}\`)`;
  const findings = Object.entries(c.input.findings);
  const present = findings.filter(([, f]) => f.state === "present");
  const a = assessGolden(kb, c.input);
  const out = [`### ${c.id} — ${c.title}`, "", `*${c.notes ?? ""}* (${c.authoredBy})`, "",
    `- **The case:** ${c.input.subject.ageYears} years, ${c.input.subject.sex}; ${c.input.redFlags.length} red flags; course ${c.input.context?.course ?? "not given"}; ${findings.length} findings, ${present.length} present — ${present.map(([id, f]) => `${sym(id)} ${f.severity ?? ""}`.trim()).join("、")}; ${present.filter(([id]) => OBSERVED.test(id)).length} of them from the tongue or the pulse.`,
    `- **Expected:** ${c.expect.patterns?.first ? `${c.expect.patterns.first} first` : `one of ${(c.expect.patterns?.top3 ?? []).join(", ")}`}${c.expect.formulas?.top3 ? `; formulas ${c.expect.formulas.top3.join(" or ")} in the top three` : ""}.`,
    `- **The engine:** ${a.verdict.status === "insufficient" ? "not enough information" : `presents ${topPatterns(a).join(", ")}`} (confidence ${a.verdict.confidence}); formulas ${topFormulas(a).join(", ") || "none"}. The strongest scores: ${a.patterns.slice(0, 4).map((p) => `${p.id} ${fmt(p.pct)} %`).join(", ")}.`];
  if (m.pattern) {
    out.push(`- **Pattern miss — ${PATTERN_KINDS[m.pattern.kind]}.**`);
    for (const s of m.pattern.scores) {
      const w = weightBySource(kb, s.id);
      const p = a.patterns.find((x) => x.id === s.id)!;
      const reachable = (w.inquiry / w.total) * 100;
      out.push(`  - ${s.id} scores **${fmt(s.pct)} %** (${s.band}; ${fmt(s.positive)} of ${s.maxScore} weight points${s.requiredPresent ? "" : `, halved: none of its required-any signs is present`}); a pattern is presented from **${kb.params.reconcile.merge_threshold} %**. `
        + `Its ${w.total} weight points come ${w.inquiry} from the questions, ${w.tongue} from the tongue and ${w.pulse} from the pulse, so the questions alone can give it at most ${fmt(reachable)} % (every sign present and severe) and ${fmt(reachable * kb.params.severity.moderate)} % at moderate severity. `
        + `The evidence present: ${p.evidence.map((e) => `${e.symptomId} ${e.weight}×${e.sev}×${e.q} = ${fmt(e.contribution)}`).join(", ") || "none"}.`);
      out.push(`  - What would have changed it (computed on copies of the case):`);
      const expected = c.expect.formulas?.top3 ?? [];
      for (const v of whatIfs(kb, c, s.id)) {
        const met = expected.length === 0 ? "" : expected.some((f) => v.formulas.includes(f)) ? " (the formula expectation met)" : " (the formula expectation still missed)";
        out.push(`    - ${v.label}: ${s.id} ${fmt(v.pct)} % → ${v.verdict}; formulas ${v.formulas.join(", ") || "none"}${met}`);
      }
    }
  }
  if (m.formula) out.push(`- **Formula miss — ${FORMULA_KINDS[m.formula.kind]}.** Expected ${m.formula.wanted.join(" or ")}; the engine's first three: ${m.formula.got.join(", ") || "none"}.`);
  out.push(`- **Likely cause:** ${likelyCause(kb, c, m)}`, "");
  return out.join("\n");
}

/** The cause in a sentence, from the step of the miss and the numbers of the case. */
export function likelyCause(kb: KnowledgeBase, c: GoldenCase, m: Miss): string {
  const parts: string[] = [];
  if (m.pattern?.kind === "no-verdict") {
    const s = m.pattern.scores[0]!;
    const w = weightBySource(kb, s.id);
    const observed = Object.entries(c.input.findings).some(([id, f]) => OBSERVED.test(id) && f.state === "present");
    parts.push(`the case gives only answers to questions${observed ? "" : " — no tongue and no pulse"} — while ${fmt(((w.tongue + w.pulse) / w.total) * 100)} % of ${s.id}'s evidence weight is in the tongue and the pulse; `
      + `its answers reach ${fmt(s.pct)} %, under the ${kb.params.reconcile.merge_threshold} % of presentation, so the engine reports not enough information rather than a weak pattern`);
  } else if (m.pattern?.kind === "not-presented") parts.push(`${m.pattern.presented.join(", ")} outscore ${m.pattern.wanted.join(" or ")}`);
  else if (m.pattern?.kind === "not-first") parts.push(`${m.pattern.presented[0]} outscores ${m.pattern.wanted.join(" or ")}`);
  if (m.formula?.kind === "no-verdict") parts.push(m.pattern?.kind === "no-verdict" ? "the formula miss follows from it: without a presented pattern there is no formula" : "no pattern is presented, so no formula is");
  else if (m.formula) parts.push(FORMULA_KINDS[m.formula.kind]);
  const text = parts.join("; ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

// ── the report ──────────────────────────────────────────────────────────────

const count = <K extends string>(kinds: readonly K[]): Map<K, number> => { const m = new Map<K, number>(); for (const k of kinds) m.set(k, (m.get(k) ?? 0) + 1); return m; };

export function report(kbs: Kbs, cases: readonly GoldenCase[] = loadGoldenCases()): string {
  const kb = kbs.dev;
  const results = cases.map((c) => evaluateCase(kbs, c));
  const s = summarize(results);
  const misses = cases.map((c, i) => classify(kb, c, results[i]!)).filter((m): m is Miss => m !== null);
  const tuning = misses.filter((m) => m.split === "tuning"), held = misses.filter((m) => m.split === "held-out");
  const p = kb.params;
  const paramsFingerprint = assessGolden(kb, cases[0]!.input).meta.paramsFingerprint;
  const formulas = [...kb.formulas.values()];
  const observedShare = (f: (typeof formulas)[number]): number => f.core_indications.filter((x) => OBSERVED.test(x)).length / Math.max(1, f.core_indications.length);
  const withObserved = formulas.filter((f) => observedShare(f) > 0).length, unreachable = formulas.filter((f) => 1 - observedShare(f) < p.formula.symptom_fit_min).length;
  const line = (name: string, x: typeof s.all): string => `| ${name} | ${x.cases} | ${pct(x.patternFirst)} | ${pct(x.patternTop3)} | ${pct(x.formulaTop3)} | ${pct(x.policy)} |`;
  const kindRows = <K extends string>(labels: Readonly<Record<K, string>>, kinds: readonly K[]): string[] => {
    const n = count(kinds);
    return (Object.keys(labels) as K[]).map((k) => `| ${labels[k]} | ${n.get(k) ?? 0} |`);
  };
  const out = [
    "# Golden cases: where the engine misses, and why", "",
    "> **Generated** by `node scripts/golden-misses.ts --write` from the golden cases (`packages/engine/test/golden`) and the knowledge base as the development profile bundles it "
    + `(engine ${s.engineVersion}, scoring parameters \`${paramsFingerprint}\`). For the clinical reviewers, before a calibration session ([content review §4.4](content-review.md)). **Nothing was tuned to write it:** `
    + "no weight, no parameter and no case was changed. The held-out half is reported as numbers only ([test plan §3.5](test-plan.md)): its misses are counted by the step at which they happen, "
    + "never shown case by case, so that a session cannot aim at them; `node scripts/golden-misses.ts --held-out-detail` prints them to the terminal after a session has closed.", "",
    "## 1. Where the set stands", "",
    `${s.all.cases} cases, ${s.all.agreed} agreed by a practitioner — **every case is synthetic**: the 23 seeds are each pattern's typical patient as the adaptive inquiry would record them `
    + "(their notes say so) and the rest test the scope policy. Concordance on them measures whether the engine reproduces its own construction, not whether it agrees with practitioners; the targets are for 100 or more agreed cases.", "",
    "| Split | Cases | Pattern first | Pattern top 3 | Formula top 3 | Policy |", "|---|---:|---:|---:|---:|---:|",
    line("tuning", s.tuning), line("held-out", s.heldOut), line("all", s.all), "",
    "Targets missed: " + (missedTargets(s, loadGoldenConfig()).join("; ") || "none") + ".", "",
    "## 2. The tuning half, case by case", "",
    tuning.length === 0 ? "No case misses.\n" : tuning.length === 1 ? "One case misses.\n" : `${tuning.length} cases miss.\n`,
    ...tuning.map((m) => caseDetail(kb, cases.find((c) => c.id === m.id)!, m)),
    "## 3. The held-out half, in numbers", "",
    `${held.length} of ${s.heldOut.cases} cases miss something: ${held.filter((m) => m.pattern).length} a pattern expectation, ${held.filter((m) => m.formula).length} a formula expectation. `
    + "Where they fail, by the step of the engine:", "",
    "| Pattern misses | Cases |", "|---|---:|", ...kindRows(PATTERN_KINDS, held.flatMap((m) => (m.pattern ? [m.pattern.kind] : []))), "",
    "| Formula misses | Cases |", "|---|---:|", ...kindRows(FORMULA_KINDS, held.flatMap((m) => (m.formula ? [m.formula.kind] : []))), "",
    `Of the formula misses, ${held.filter((m) => m.formula && m.pattern).length} come with a pattern miss in the same case.`, "",
    "## 4. The steps where cases fail, as the engine takes them", "",
    "What a reviewer needs to read the counts above — the engine's rules and the parameters in force, none of them derived from a case:", "",
    `1. **A pattern's score** is Σ weight × severity × quality over its signs present, minus its *against* signs, over the sum of its weights (× ${p.pattern.required_any_missing_factor} when none of its required-any signs is present). `
    + `Severity: light ${p.severity.light}, moderate ${p.severity.moderate}, severe ${p.severity.severe}. Quality: an answer ${p.quality.by_source.inquiry}, the tongue (guided observation) ${p.quality.by_source.guided}, the pulse ${p.quality.by_source.pulse}. `
    + "The tongue and the pulse are optional in the app, so a pattern whose evidence lies largely in them scores low on answers alone — the case of §2.",
    `2. **Presentation:** a pattern is presented from **${p.reconcile.merge_threshold} %** (bands: weak ${p.pattern.bands.weak}, medium ${p.pattern.bands.medium}, high ${p.pattern.bands.high}); at most ${p.reconcile.max_patterns}. `
    + `When the first is under ${p.reconcile.confidence.low.pct1} % the engine says there is not enough information and recommends nothing — a weak pattern is never shown as a result.`,
    `3. **Formulas:** the candidates are the formulas of the presented patterns; each is fitted to the panel and kept if at least ${p.formula.symptom_fit_min * 100} % of its core indications are present; `
    + `the safety rules and the output level may remove it; at most ${MAX_RECOMMENDED_FORMULAS} of tier A or B are recommended, best fit first, and tier C follows for study only. `
    + "The golden check reads the first three of that list, so a tier-C formula counts only when fewer than three of tier A or B come before it, and a formula miss follows every pattern miss of the first kind. "
    + `The symptom fit counts the core indications present among all of them: ${withObserved} of the ${formulas.length} formulas name a tongue or pulse sign among their core indications, and for ${unreachable} of them answers alone can never reach the ${p.formula.symptom_fit_min * 100} %.`, "",
    "## 5. For the calibration session", "",
    "Questions this raises — to be decided by the reviewers in a session (content review §4.4), with the held-out half read only as numbers until it closes:", "",
    "1. **The seeds describe the inquiry only.** Should the typical patient of a pattern include its tongue and pulse, or should the expectation of an inquiry-only seed be *not enough information* when its pattern rests largely on observation?",
    "2. **Presentation on answers alone.** Should the threshold of presentation, or a pattern's weights, take into account how much of its evidence can come from questions — or should the inquiry ask for the tongue when such a pattern leads?",
    "3. **Formula expectations.** Should a case expect any formula of its pattern's table, and should a study-only (tier C) formula count among the first three?",
    "4. **The set itself.** The targets are for practitioner-agreed cases: the synthetic seeds are to be replaced by cases agreed in sessions, written with the inspector's *Case* tab and split when written (test plan §3.5).", "",
  ];
  return out.join("\n");
}

/** The held-out misses case by case, for the terminal only: run after a calibration session has closed (test plan §3.5). */
export function heldOutDetail(kbs: Kbs, cases: readonly GoldenCase[] = loadGoldenCases()): string {
  const results = cases.map((c) => evaluateCase(kbs, c));
  const misses = cases.map((c, i) => classify(kbs.dev, c, results[i]!)).filter((m): m is Miss => m !== null && m.split === "held-out");
  return ["Held-out misses — after a calibration session only (test plan §3.5)", "", ...misses.map((m) => caseDetail(kbs.dev, cases.find((c) => c.id === m.id)!, m))].join("\n");
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const kbs = loadKbs();
  if (args.includes("--held-out-detail")) { console.log(heldOutDetail(kbs)); process.exit(0); }
  const text = report(kbs);
  if (args.includes("--check")) {
    const ok = readFileSync(REPORT, "utf8") === text;
    console.log(ok ? "golden-misses: the report is current" : "golden-misses: docs/golden-misses.md is not what the cases and the knowledge base give — run `node scripts/golden-misses.ts --write`");
    process.exit(ok ? 0 : 1);
  }
  if (args.includes("--write")) { writeFileSync(REPORT, text); console.log(`golden-misses: wrote ${REPORT}`); } else console.log(text);
}

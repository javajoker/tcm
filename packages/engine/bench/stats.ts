// Statistics and the regression guard of the engine benchmark (task E-19, docs/test-plan.md §5.5). Pure, so the guard itself is unit-tested without timing anything.

export const percentile = (sorted: readonly number[], p: number): number => {
  if (sorted.length === 0) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
};
export const median = (xs: readonly number[]): number => percentile([...xs].sort((a, b) => a - b), 50);

export interface Measure { readonly p50: number; readonly p95: number; readonly max: number; readonly runs: number }
export const measureOf = (samples: readonly number[]): Measure => {
  const s = [...samples].sort((a, b) => a - b);
  return { p50: percentile(s, 50), p95: percentile(s, 95), max: s[s.length - 1] ?? NaN, runs: s.length };
};

/** What a benchmark run writes and the baseline stores. `ratio` = p95 / the time of the fixed reference workload on the same machine: it travels between machines, the milliseconds do not. */
export interface Report {
  readonly referenceMs: number;
  readonly assess: Measure & { readonly ratio: number };
  readonly nextQuestions: Measure & { readonly ratio: number };
}
export interface Limits {
  /** `assess` p95 budget in milliseconds on a mid-range device (test plan §5.5). */
  readonly assessP95Ms: number;
  /** A ratio more than this much above the baseline's fails (20 %). */
  readonly regression: number;
}
export const LIMITS: Limits = { assessP95Ms: 50, regression: 0.2 };

/** The reasons a report fails: over the absolute budget, or slower than the baseline by more than the allowed share. Empty = passes. */
export function violations(report: Report, baseline: Report | null, limits: Limits = LIMITS): string[] {
  const out: string[] = [];
  if (report.assess.p95 > limits.assessP95Ms) out.push(`assess p95 is ${report.assess.p95.toFixed(1)} ms, over the ${limits.assessP95Ms} ms budget`);
  if (baseline !== null) {
    for (const k of ["assess", "nextQuestions"] as const) {
      const grew = report[k].ratio / baseline[k].ratio - 1;
      if (grew > limits.regression) out.push(`${k} is ${(grew * 100).toFixed(0)} % slower than the baseline (ratio ${report[k].ratio.toFixed(3)} vs ${baseline[k].ratio.toFixed(3)}; the limit is ${(limits.regression * 100).toFixed(0)} %)`);
    }
  }
  return out;
}

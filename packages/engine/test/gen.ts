// Seeded randomness for property tests (E-20). No dependency; a failure prints its seed and the shrunk-by-hand case.
export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  /** mulberry32: uniform in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number): number { return min + Math.floor(this.next() * (max - min + 1)); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(xs: readonly T[]): T { const x = xs[this.int(0, xs.length - 1)]; if (x === undefined) throw new Error("pick from empty"); return x; }
  subset<T>(xs: readonly T[], p: number): T[] { return xs.filter(() => this.chance(p)); }
  shuffle<T>(xs: readonly T[]): T[] {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) { const j = this.int(0, i); [a[i], a[j]] = [a[j]!, a[i]!]; }
    return a;
  }
}

/**
 * The nightly job runs every property with more cases and a fresh seed: `PROPERTY_RUNS` multiplies every case count (default 1, nightly 10) and `PROPERTY_SEED`
 * replaces the base seed. Both are printed whenever they are set, and a failure prints the seed of the case, so any run can be replayed exactly.
 */
const intEnv = (name: string, fallback: number): number => { const v = Number(process.env[name]); return Number.isInteger(v) && v > 0 ? v : fallback; };
export const RUNS = intEnv("PROPERTY_RUNS", 1);
export const BASE_SEED = intEnv("PROPERTY_SEED", 20261004);
if (process.env.PROPERTY_RUNS !== undefined || process.env.PROPERTY_SEED !== undefined) console.log(`property tests: ×${RUNS} cases, base seed ${BASE_SEED}`);

/** Run `check` on `n` (× PROPERTY_RUNS) generated cases; on failure rethrow with the case index and seed so it can be replayed. */
export function forAll<T>(name: string, n: number, gen: (rng: Rng, i: number) => T, check: (value: T, i: number) => void, seed = BASE_SEED): void {
  for (let i = 0; i < n * RUNS; i++) {
    const rng = new Rng(seed + i * 7919);
    const value = gen(rng, i);
    try {
      check(value, i);
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(`property "${name}" failed at case ${i} (seed ${seed + i * 7919}): ${detail}\ncase: ${JSON.stringify(value, (_k, v) => (v instanceof Set ? [...v] : v))}`);
    }
  }
}

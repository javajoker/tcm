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

/** Run `check` on `n` generated cases; on failure rethrow with the case index and seed so it can be replayed. */
export function forAll<T>(name: string, n: number, gen: (rng: Rng, i: number) => T, check: (value: T, i: number) => void, seed = 20261004): void {
  for (let i = 0; i < n; i++) {
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

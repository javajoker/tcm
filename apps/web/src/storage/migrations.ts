// Versioned envelopes and forward migrations (tech spec §8.3). Every stored record is `{ v, data }`; reading runs the record up to the current
// version. Saved results keep their own version stamps and are shown as saved — they are never silently recomputed.
//
// To change a stored shape: bump the constant, add `from → from + 1` to the table, add a fixture for the old shape to test/storage.test.ts.

export const DRAFT_VERSION = 1;
export const ASSESSMENT_VERSION = 1;

export interface Envelope { readonly v: number; readonly data: unknown }
type Step = (data: unknown) => unknown;

/** `migrations[n]` upgrades version n to n + 1. */
export interface MigrationTable { readonly [from: number]: Step }

export const DRAFT_MIGRATIONS: MigrationTable = {};
export const ASSESSMENT_MIGRATIONS: MigrationTable = {};

export const wrap = (v: number, data: unknown): Envelope => ({ v, data });

const isEnvelope = (x: unknown): x is Envelope => typeof x === "object" && x !== null && typeof (x as Envelope).v === "number" && "data" in x;

/**
 * Bring a stored envelope to `current`. Returns `null` — "treat as absent" — for anything that is not an envelope, comes from a NEWER app version
 * (it cannot be understood; it is left in place rather than rewritten) or whose migration throws. Never throws.
 */
export function migrate(raw: unknown, current: number, table: MigrationTable): unknown | null {
  if (!isEnvelope(raw) || !Number.isInteger(raw.v) || raw.v < 1 || raw.v > current) return null;
  let data = raw.data;
  try {
    for (let v = raw.v; v < current; v++) {
      const step = table[v];
      if (!step) return null;
      data = step(data);
    }
  } catch { return null; }
  return data;
}

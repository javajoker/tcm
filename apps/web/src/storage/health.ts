// Storage health (docs/post-mvp/design/backup-and-data-lock.md §4; task PM-10): how much room the app is using, whether the browser has agreed to keep it, and a way to ask — on a click, never by
// itself. Every call is feature-detected and wrapped: a browser without the API, or one that refuses, gives "unknown" and the fixed explanation, never an exception. The manager is passed in
// (`navigator.storage` in the browser), so every path is tested with fakes.

/** The part of `StorageManager` this uses. */
export interface StorageManagerLike {
  estimate?(): Promise<{ usage?: number; quota?: number }>;
  persisted?(): Promise<boolean>;
  persist?(): Promise<boolean>;
}

export interface Health {
  /** Bytes the origin uses, if the browser says. */
  readonly usage: number | null;
  readonly quota: number | null;
  /** `true`: the browser has agreed to keep the data. `false`: it may discard it under pressure. `null`: the browser cannot say. */
  readonly persisted: boolean | null;
  /** The browser can be asked (and has not agreed yet). */
  readonly canAsk: boolean;
}

export const UNKNOWN: Health = { usage: null, quota: null, persisted: null, canAsk: false };

const guarded = async <T>(f: () => Promise<T> | undefined, otherwise: T): Promise<T> => { try { return (await f()) ?? otherwise; } catch { return otherwise; } };

export async function readHealth(manager: StorageManagerLike | null | undefined): Promise<Health> {
  if (!manager) return UNKNOWN;
  const estimate = await guarded(() => manager.estimate?.(), null);
  const persisted = await guarded<boolean | null>(() => manager.persisted?.(), null);
  const number = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
  return { usage: number(estimate?.usage), quota: number(estimate?.quota), persisted, canAsk: persisted === false && typeof manager.persist === "function" };
}

export type AskOutcome = "granted" | "denied" | "unavailable";

/** Ask the browser to keep the data. Only ever called from a click. */
export async function askToKeep(manager: StorageManagerLike | null | undefined): Promise<AskOutcome> {
  if (!manager || typeof manager.persist !== "function") return "unavailable";
  try { return (await manager.persist()) ? "granted" : "denied"; } catch { return "unavailable"; }
}

/** "3 MB", "812 KB", "1.2 GB": the unit that reads best, one decimal below ten. */
export function sizeParts(bytes: number): { value: number; unit: "byte" | "kilobyte" | "megabyte" | "gigabyte" } {
  if (bytes < 1000) return { value: Math.max(0, Math.round(bytes)), unit: "byte" };
  const [value, unit] = bytes < 1e6 ? [bytes / 1e3, "kilobyte" as const] : bytes < 1e9 ? [bytes / 1e6, "megabyte" as const] : [bytes / 1e9, "gigabyte" as const];
  return { value: value < 10 ? Math.round(value * 10) / 10 : Math.round(value), unit };
}

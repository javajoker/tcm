// Plain data from an untrusted source (docs/post-mvp/design/backup-and-data-lock.md §3.4, stage 5). `plainCopy` builds a FRESH value from JSON-parsed input: only null, booleans, finite numbers, bounded
// strings, arrays and objects with safe keys survive, within a depth and a node budget; the prototype-bearing names are refused; nothing of the original object is reused, so nothing it carried
// (a getter, a prototype, a shared reference) can reach the app. A violation throws `Unsafe`, which the validators turn into "this record is not valid".
import { LIMITS } from "./limits.ts";

export class Unsafe extends Error {}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
// control characters (and the unpaired surrogates that JSON can smuggle) are not text a person typed or a key the app writes
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export const isPlainRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);

export interface Budget { nodes: number }

export function plainCopy(value: unknown, budget: Budget = { nodes: 0 }, depth = 0): unknown {
  if (++budget.nodes > LIMITS.nodes) throw new Unsafe("too many values");
  if (depth > LIMITS.depth) throw new Unsafe("nested too deeply");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Unsafe("a number that is not finite"); return value; }
  if (typeof value === "string") { if (value.length > LIMITS.string) throw new Unsafe("a string that is too long"); if (CONTROL.test(value)) throw new Unsafe("a control character in a string"); return value; }
  if (Array.isArray(value)) {
    if (value.length > LIMITS.list) throw new Unsafe("a list that is too long");
    return value.map((v) => plainCopy(v, budget, depth + 1));
  }
  if (isPlainRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length > LIMITS.keys) throw new Unsafe("an object with too many keys");
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      if (FORBIDDEN_KEYS.has(key) || key.length === 0 || key.length > LIMITS.key || CONTROL.test(key)) throw new Unsafe(`a key that is not allowed (${key.slice(0, 20)})`);
      Object.defineProperty(out, key, { value: plainCopy(value[key], budget, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return out;
  }
  throw new Unsafe("a value that is not plain data");
}

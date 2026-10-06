// The local data lock's cryptography and records (docs/post-mvp/design/backup-and-data-lock.md §5.2, §5.3), kept apart from the persistence layer so that every rule of it can be tested on its own. WebCrypto
// only, through crypto.ts: a random 256-bit DATA KEY encrypts the records, and the passphrase only wraps that key — so changing the passphrase is one small write and cannot leave the records in two states.
//
//     passphrase ──PBKDF2-SHA-256, salt, ≥ 600 000 iterations──▶ key-encryption key (in memory while it is used)
//     random data key ──AES-256-GCM by that key──▶ the wrapped key in `meta/lock`
//     records ──AES-256-GCM by the data key, a fresh 12-byte IV for every write──▶ { v, enc: { iv, ct } }
//
// The data key is imported as NOT extractable and lives only in memory: a reload locks the app. Nothing here stores, hints at or derives anything recoverable from the passphrase except by guessing it.
import { LIMITS } from "./backup/limits.ts";
import { bytesText, decrypt, deriveKey, encrypt, fromBase64, IV_BYTES, KDF_ITERATIONS, KDF_NAME, randomBytes, SALT_BYTES, textBytes, toBase64 } from "./crypto.ts";

export const LOCK_VERSION = 1;
export const DATA_KEY_BYTES = 32;
const TAG_BYTES = 16;

/** `meta/lock`: everything needed to unlock, and nothing that is a secret (the key is wrapped; the counters are for the person at the keyboard). */
export interface LockRecord {
  readonly v: typeof LOCK_VERSION;
  /** Names the data key, so that a tab holding an old key, or a record sealed under another one, is recognised. Random; not derived from anything. */
  readonly keyId: string;
  readonly kdf: typeof KDF_NAME;
  readonly iterations: number;
  readonly salt: string;
  /** The data key's 32 bytes, encrypted by the key the passphrase makes. */
  readonly wrapped: { readonly iv: string; readonly ct: string };
  /** Consecutive wrong passphrases, and when the last one was (ms since the epoch). */
  readonly failures: number;
  readonly lastFailureAt: number | null;
}

/** The data key in memory with the id of the lock it belongs to. */
export interface DataKey { readonly keyId: string; readonly key: CryptoKey }

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isTime = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 4_102_444_800_000;
const bytesOf = (x: unknown, length: number): Uint8Array<ArrayBuffer> | null => { const b = typeof x === "string" ? fromBase64(x) : null; return b !== null && b.length === length ? b : null; };

/** A stored lock record, if it is one: every field checked and bounded (the iteration count on both sides), unknown fields ignored. `null` for anything else — which the app treats as a lock it cannot open. */
export function parseLockRecord(raw: unknown): LockRecord | null {
  if (!isRecord(raw) || raw["v"] !== LOCK_VERSION || raw["kdf"] !== KDF_NAME) return null;
  const { keyId, iterations, salt, wrapped, failures, lastFailureAt } = raw;
  if (typeof keyId !== "string" || keyId.length < 1 || keyId.length > 64) return null;
  if (typeof iterations !== "number" || !Number.isInteger(iterations) || iterations < LIMITS.minIterations || iterations > LIMITS.maxIterations) return null;
  if (bytesOf(salt, SALT_BYTES) === null || !isRecord(wrapped) || bytesOf(wrapped["iv"], IV_BYTES) === null || bytesOf(wrapped["ct"], DATA_KEY_BYTES + TAG_BYTES) === null) return null;
  if (typeof failures !== "number" || !Number.isInteger(failures) || failures < 0 || failures > 1_000_000) return null;
  if (lastFailureAt !== null && !isTime(lastFailureAt)) return null;
  return { v: LOCK_VERSION, keyId, kdf: KDF_NAME, iterations, salt: salt as string, wrapped: { iv: wrapped["iv"] as string, ct: wrapped["ct"] as string }, failures, lastFailureAt: lastFailureAt as number | null };
}

const wrapAad = (keyId: string): Uint8Array<ArrayBuffer> => textBytes(`tcm|lock|${keyId}|${LOCK_VERSION}`);
const importDataKey = (raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> => globalThis.crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

async function wrap(raw: Uint8Array<ArrayBuffer>, passphrase: string, keyId: string, iterations: number): Promise<Pick<LockRecord, "iterations" | "salt" | "wrapped">> {
  const salt = randomBytes(SALT_BYTES), iv = randomBytes(IV_BYTES);
  const ct = await encrypt(await deriveKey(passphrase, salt, iterations), iv, raw, wrapAad(keyId));
  return { iterations, salt: toBase64(salt), wrapped: { iv: toBase64(iv), ct: toBase64(ct) } };
}

/** The data key's raw bytes, or `null` for a wrong passphrase (or a record that was altered: the two cannot be told apart). The caller wipes the bytes. */
async function unwrapRaw(record: LockRecord, passphrase: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const salt = fromBase64(record.salt), iv = fromBase64(record.wrapped.iv), ct = fromBase64(record.wrapped.ct);
  if (salt === null || iv === null || ct === null) return null;
  try { return await decrypt(await deriveKey(passphrase, salt, record.iterations), iv, ct, wrapAad(record.keyId)); } catch { return null; }
}

/** A new lock for a passphrase: a fresh random data key, wrapped. The data key comes back ready to use (not extractable); the record is what is stored. */
export async function createLock(passphrase: string, iterations: number = KDF_ITERATIONS): Promise<{ record: LockRecord; dek: DataKey }> {
  const keyId = toBase64(randomBytes(12));
  const raw = randomBytes(DATA_KEY_BYTES);
  try {
    const record: LockRecord = { v: LOCK_VERSION, keyId, kdf: KDF_NAME, ...(await wrap(raw, passphrase, keyId, iterations)), failures: 0, lastFailureAt: null };
    return { record, dek: { keyId, key: await importDataKey(raw) } };
  } finally { raw.fill(0); }
}

/** The data key a passphrase opens, or `null` when it does not. */
export async function openLock(record: LockRecord, passphrase: string): Promise<DataKey | null> {
  const raw = await unwrapRaw(record, passphrase);
  if (raw === null) return null;
  try { return { keyId: record.keyId, key: await importDataKey(raw) }; } catch { return null; } finally { raw.fill(0); }
}

/** The same data key under another passphrase (a new salt and IV): the one small write that changing the passphrase is. `null` for a wrong current passphrase. The counters start again. */
export async function rewrapLock(record: LockRecord, current: string, next: string, iterations: number = KDF_ITERATIONS): Promise<LockRecord | null> {
  const raw = await unwrapRaw(record, current);
  if (raw === null) return null;
  try { return { v: LOCK_VERSION, keyId: record.keyId, kdf: KDF_NAME, ...(await wrap(raw, next, record.keyId, iterations)), failures: 0, lastFailureAt: null }; } finally { raw.fill(0); }
}

// ── the wrong-passphrase throttle (design §5.4) ─────────────────────────────

export const FREE_ATTEMPTS = 5;
export const MAX_WAIT_MS = 5 * 60_000;

/** How long the next attempt waits after this many consecutive failures: nothing for the first five, then 2, 4, 8 … seconds, up to five minutes. */
export const waitAfter = (failures: number): number => (failures < FREE_ATTEMPTS ? 0 : Math.min(MAX_WAIT_MS, 2 ** (failures - FREE_ATTEMPTS + 1) * 1000));

/** The moment the next attempt is allowed, or `null` when it is allowed now. */
export function allowedAt(record: LockRecord, now: number): number | null {
  const wait = waitAfter(record.failures);
  if (wait === 0 || record.lastFailureAt === null) return null;
  const at = record.lastFailureAt + wait;
  return at > now ? at : null;
}

export const failed = (record: LockRecord, now: number): LockRecord => ({ ...record, failures: record.failures + 1, lastFailureAt: now });
export const forgiven = (record: LockRecord): LockRecord => (record.failures === 0 && record.lastFailureAt === null ? record : { ...record, failures: 0, lastFailureAt: null });

// ── the records ─────────────────────────────────────────────────────────────

/** A stored record under the lock: the version stays visible (so that migration still works after unlocking), the content is `enc`. */
export interface Sealed { readonly v: number; readonly enc: { readonly iv: string; readonly ct: string }; /** The stored value was not an envelope at all: it comes back as it was. */ readonly raw?: true }

export type SealedStore = "drafts" | "assessments";

export const isSealed = (x: unknown): x is Sealed => isRecord(x) && typeof x["v"] === "number" && isRecord(x["enc"]) && typeof x["enc"]["iv"] === "string" && typeof x["enc"]["ct"] === "string";
const isEnvelope = (x: unknown): x is { v: number; data: unknown } => isRecord(x) && typeof x["v"] === "number" && Number.isInteger(x["v"]) && "data" in x;

/** The additional data of a record: its store, its key and its version, so a ciphertext copied to another id, store or version fails to open. */
const recordAad = (store: string, key: string, v: number): Uint8Array<ArrayBuffer> => textBytes(`tcm|${store}|${key}|${v}`);

/** The stored form of a record: `{ v, data }` becomes `{ v, enc }`. Anything that is not an envelope (a damaged record) is sealed whole and comes back whole — nothing stays in the clear. */
export async function sealRecord(dek: DataKey, store: SealedStore, key: string, value: unknown): Promise<Sealed> {
  const envelope = isEnvelope(value);
  const v = envelope ? value.v : 0;
  const iv = randomBytes(IV_BYTES);
  const ct = await encrypt(dek.key, iv, textBytes(JSON.stringify(envelope ? value.data : value) ?? "null"), recordAad(store, key, v));
  return { v, enc: { iv: toBase64(iv), ct: toBase64(ct) }, ...(envelope ? {} : { raw: true as const }) };
}

/** The stored value a sealed record held (`{ v, data }`, or what it was), or `undefined` when it does not open — a wrong key, a changed byte, a record moved to another place. */
export async function openRecord(dek: DataKey, store: SealedStore, key: string, sealed: Sealed): Promise<unknown | undefined> {
  const iv = fromBase64(sealed.enc.iv), ct = fromBase64(sealed.enc.ct);
  if (iv === null || ct === null || iv.length !== IV_BYTES) return undefined;
  try {
    const data: unknown = JSON.parse(bytesText(await decrypt(dek.key, iv, ct, recordAad(store, key, sealed.v))));
    return sealed.raw === true ? data : { v: sealed.v, data };
  } catch { return undefined; }
}

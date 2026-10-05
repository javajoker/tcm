// The cryptography of the app, in one small module (docs/post-mvp/design/backup-and-data-lock.md §6): WebCrypto only — PBKDF2-SHA-256, AES-256-GCM, SHA-256 and `getRandomValues` — so there is no dependency,
// the work is done by the browser's native code, and the audited surface is a page long. Nothing here stores anything and nothing is custom: no home-made key derivation, no hint, no recovery.
// Backups use it now (PM-09); the local data lock will (PM-20), which is why it is the storage layer's and not the backup's.

export const KDF_NAME = "PBKDF2-SHA-256";
export const CIPHER_NAME = "AES-256-GCM";
/** The current OWASP minimum for PBKDF2-HMAC-SHA-256. Written into every file, so it can be raised later without breaking old files. */
export const KDF_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;

const subtle = (): SubtleCrypto => globalThis.crypto.subtle;
const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text);

/** Fresh random bytes (a salt, an IV). A salt and an IV are never reused: each backup and each encryption draws its own. */
export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

/**
 * The key a passphrase makes: PBKDF2-SHA-256 over the passphrase, with the salt and the iteration count, into a 256-bit AES-GCM key that cannot be exported. The passphrase is normalised (NFKC) first, so
 * the same characters typed on another keyboard or platform are the same passphrase.
 */
export async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await subtle().importKey("raw", utf8(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** AES-256-GCM: the ciphertext with its 16-byte tag appended. `aad` is authenticated, not encrypted: change a byte of it and decryption fails. */
export async function encrypt(key: CryptoKey, iv: Uint8Array<ArrayBuffer>, plaintext: Uint8Array<ArrayBuffer>, aad: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key, plaintext));
}

/** Rejects (with an `OperationError`) when the tag does not verify: a wrong key, a changed byte anywhere in the ciphertext, or changed additional data — which cannot be told apart, on purpose. */
export async function decrypt(key: CryptoKey, iv: Uint8Array<ArrayBuffer>, ciphertext: Uint8Array<ArrayBuffer>, aad: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv, additionalData: aad, tagLength: 128 }, key, ciphertext));
}

// ── bytes ↔ text ────────────────────────────────────────────────────────────

export const textBytes = utf8;
export const bytesText = (bytes: Uint8Array): string => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

/** The bytes of a standard Base64 string, or `null` when it is not one (wrong characters, wrong length). */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text) || text.length % 4 !== 0) return null;
  try {
    const raw = atob(text);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// ── compression ─────────────────────────────────────────────────────────────

export type Compression = "gzip" | "none";
export const canCompress = (): boolean => typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

/** The bytes as a stream (not `Blob.stream()`, which not every environment has). */
const streamOf = (bytes: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array<ArrayBuffer>> => new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });

async function pump(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel().catch(() => undefined); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

export async function gzip(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const stream = streamOf(bytes).pipeThrough(new CompressionStream("gzip"));
  return (await pump(stream, Number.MAX_SAFE_INTEGER))!;
}

/** The decompressed bytes, or `null` when they would be more than `limit` (a file that is a bomb) or the data is not gzip. */
export async function gunzip(bytes: Uint8Array<ArrayBuffer>, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  try { return await pump(streamOf(bytes).pipeThrough(new DecompressionStream("gzip")), limit); } catch { return null; }
}

// The passphrase-protected backup (docs/post-mvp/design/backup-and-data-lock.md §3.2, §6): the whole plain document, compressed where the browser can, encrypted with AES-256-GCM under a key the passphrase makes
// with PBKDF2-SHA-256. The header — format, version, time, compression, key derivation and cipher parameters — is not encrypted but is authenticated as additional data, so changing the iteration count or any
// other header field makes decryption fail. The header says nothing about the contents, not even how many results there are. A wrong passphrase and a damaged file are one answer, on purpose.
import { canonicalJson } from "./canonical.ts";
import { BACKUP_ENCRYPTED_FORMAT, BACKUP_VERSION, LIMITS } from "./limits.ts";
import { canCompress, CIPHER_NAME, decrypt, deriveKey, encrypt, fromBase64, gunzip, gzip, IV_BYTES, KDF_ITERATIONS, KDF_NAME, randomBytes, SALT_BYTES, textBytes, toBase64, bytesText, type Compression } from "../crypto.ts";
import { checkDocument, type ReadResult } from "./format.ts";
import { isPlainRecord } from "./plain.ts";

export interface EncryptedHeader {
  readonly format: typeof BACKUP_ENCRYPTED_FORMAT;
  readonly version: typeof BACKUP_VERSION;
  readonly createdAt: string;
  readonly compression: Compression;
  readonly kdf: { readonly name: typeof KDF_NAME; readonly iterations: number; readonly salt: string };
  readonly cipher: { readonly name: typeof CIPHER_NAME; readonly iv: string };
}
export interface EncryptedBackup extends EncryptedHeader { readonly ciphertext: string }

/** Everything but the ciphertext, in canonical form: what the cipher authenticates. */
const headerBytes = (h: EncryptedHeader): Uint8Array<ArrayBuffer> => textBytes(canonicalJson(h));

/** Make the encrypted file for a plain document's text. `iterations` is the current minimum unless a test (or a later release) says otherwise. */
export async function encryptBackup(plainText: string, passphrase: string, createdAt: string, iterations: number = KDF_ITERATIONS): Promise<EncryptedBackup> {
  if (passphrase.length === 0) throw new RangeError("a backup needs a passphrase");
  const salt = randomBytes(SALT_BYTES), iv = randomBytes(IV_BYTES);
  const compression: Compression = canCompress() ? "gzip" : "none";
  const header: EncryptedHeader = { format: BACKUP_ENCRYPTED_FORMAT, version: BACKUP_VERSION, createdAt, compression, kdf: { name: KDF_NAME, iterations, salt: toBase64(salt) }, cipher: { name: CIPHER_NAME, iv: toBase64(iv) } };
  const plain = textBytes(plainText);
  const body = compression === "gzip" ? await gzip(plain) : plain;
  const sealed = await encrypt(await deriveKey(passphrase, salt, iterations), iv, body, headerBytes(header));
  return { ...header, ciphertext: toBase64(sealed) };
}

export const serializeEncrypted = (file: EncryptedBackup): string => `${JSON.stringify(file, null, 1)}\n`;

export type OpenError = "malformed" | "unsupported" | "bad-parameters" | "too-large" | "wrong-passphrase";
export type OpenResult = ReadResult | { readonly kind: "locked"; readonly error: OpenError };

/**
 * Open an encrypted file (already parsed, identified as encrypted and not newer than this app) with a passphrase. The parameters in the header are checked before any work is done — a hostile file cannot
 * ask for 10⁹ iterations — then the key is derived, the header and ciphertext are authenticated and decrypted, and the plain document goes through the same integrity checks as any other.
 */
export async function openEncrypted(raw: Readonly<Record<string, unknown>>, passphrase: string): Promise<OpenResult> {
  const kdf = raw["kdf"], cipher = raw["cipher"];
  if (!isPlainRecord(kdf) || !isPlainRecord(cipher) || typeof raw["ciphertext"] !== "string" || typeof raw["createdAt"] !== "string" || (raw["compression"] !== "gzip" && raw["compression"] !== "none")) return { kind: "locked", error: "malformed" };
  if (kdf["name"] !== KDF_NAME || cipher["name"] !== CIPHER_NAME || raw["version"] !== BACKUP_VERSION) return { kind: "locked", error: "unsupported" };
  const iterations = kdf["iterations"];
  if (typeof iterations !== "number" || !Number.isInteger(iterations) || iterations < LIMITS.minIterations || iterations > LIMITS.maxIterations) return { kind: "locked", error: "bad-parameters" };
  const salt = typeof kdf["salt"] === "string" ? fromBase64(kdf["salt"]) : null, iv = typeof cipher["iv"] === "string" ? fromBase64(cipher["iv"]) : null;
  if (salt === null || iv === null || salt.length !== SALT_BYTES || iv.length !== IV_BYTES) return { kind: "locked", error: "bad-parameters" };
  if (raw["ciphertext"].length > LIMITS.fileBytes * 1.4) return { kind: "locked", error: "too-large" };
  const sealed = fromBase64(raw["ciphertext"]);
  if (sealed === null || sealed.length < 16) return { kind: "locked", error: "malformed" };
  const header: EncryptedHeader = { format: BACKUP_ENCRYPTED_FORMAT, version: BACKUP_VERSION, createdAt: raw["createdAt"], compression: raw["compression"], kdf: { name: KDF_NAME, iterations, salt: kdf["salt"] as string }, cipher: { name: CIPHER_NAME, iv: cipher["iv"] as string } };
  let body: Uint8Array<ArrayBuffer>;
  try { body = await decrypt(await deriveKey(passphrase, salt, iterations), iv, sealed, headerBytes(header)); } catch { return { kind: "locked", error: "wrong-passphrase" }; }
  const plain = header.compression === "gzip" ? await gunzip(body, LIMITS.fileBytes) : body.length <= LIMITS.fileBytes ? body : null;
  if (plain === null) return { kind: "locked", error: "too-large" };
  let parsed: unknown;
  try { parsed = JSON.parse(bytesText(plain)); } catch { return { kind: "locked", error: "malformed" }; }
  if (!isPlainRecord(parsed) || parsed["format"] !== "tcm-backup") return { kind: "locked", error: "malformed" };
  return checkDocument(parsed);
}

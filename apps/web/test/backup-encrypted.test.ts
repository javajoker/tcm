// @vitest-environment node
// The passphrase-protected backup (docs/post-mvp/design/backup-and-data-lock.md §3.2, §7; task PM-09): round trip, a wrong passphrase changes nothing, every tampering fails, hostile parameters are refused
// before any work is done, and the header says nothing about the contents.
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import {
  buildBackup, DEFAULT_SELECTION, encryptBackup, LIMITS, openEncrypted, readBackup, serializeBackup, serializeEncrypted, type BackupDocument, type EncryptedBackup,
} from "../src/storage/backup/index.ts";
import { fromBase64, KDF_ITERATIONS, toBase64 } from "../src/storage/crypto.ts";
import { DEFAULT_PREFS, type SavedAssessment } from "../src/storage/types.ts";
import { interview } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const NOW = Date.UTC(2026, 9, 5, 12);
const saved = (p: string, id: string, at: number): SavedAssessment => { const d = interview(kb, p); return { ...toSaved(d, engine.assess(kb, assessInputOf(d, at)!), { id, lang: "en" }), userNote: "a private note about 咳嗽" }; };
const records = [saved("SP1", "e000000000000001", NOW - 3 * 86_400_000), saved("LG1", "e000000000000002", NOW - 86_400_000)];
const stamps = { appVersion: "t", kbVersion: kb.version, engineVersion: "0.1.0", profile: "dev" };
const doc = async (): Promise<BackupDocument> => buildBackup({ assessments: records, draft: null, prefs: DEFAULT_PREFS }, DEFAULT_SELECTION, stamps, NOW);
const FAST = 100_000;                              // the smallest count a reader accepts: the tests that make many files do not wait for the production count
const PASS = "correct horse 9 battery";

async function encrypted(over: Partial<{ pass: string; iterations: number }> = {}): Promise<{ plain: string; file: EncryptedBackup; text: string }> {
  const plain = serializeBackup(await doc());
  const file = await encryptBackup(plain, over.pass ?? PASS, "2026-10-05T12:00:00Z", over.iterations ?? FAST);
  return { plain, file, text: serializeEncrypted(file) };
}
const raw = (file: EncryptedBackup): Record<string, unknown> => JSON.parse(JSON.stringify(file));
/** A header the tests damage field by field. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary parts of the parsed file are changed or removed
type Loose = { [k: string]: any; kdf: { [k: string]: any }; cipher: { [k: string]: any } };

describe("the file", () => {
  it("has the format of the design: a header in the clear — version, time, compression, key derivation, cipher — and the ciphertext", async () => {
    const { file } = await encrypted();
    expect(Object.keys(file).sort()).toEqual(["cipher", "ciphertext", "compression", "createdAt", "format", "kdf", "version"]);
    expect(file).toMatchObject({ format: "tcm-backup-encrypted", version: 1, createdAt: "2026-10-05T12:00:00Z", compression: "gzip", kdf: { name: "PBKDF2-SHA-256", iterations: FAST }, cipher: { name: "AES-256-GCM" } });
    expect(fromBase64(file.kdf.salt)).toHaveLength(16);
    expect(fromBase64(file.cipher.iv)).toHaveLength(12);
    expect(fromBase64(file.ciphertext)!.length).toBeGreaterThan(16);
  });

  it("uses the production iteration count by default (at least 600 000), and a fresh salt and iv every time", async () => {
    expect(KDF_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    const a = await encryptBackup("{}", PASS, "2026-10-05T00:00:00Z"), b = await encryptBackup("{}", PASS, "2026-10-05T00:00:00Z");
    expect(a.kdf.iterations).toBe(KDF_ITERATIONS);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  }, 60_000);

  it("shows nothing of the contents: no word of the notes, no pattern, no id, not even the number of results", async () => {
    const { text, plain } = await encrypted();
    for (const word of ["咳嗽", "private note", "assessments", "e00000000000000", "tcm-backup\"", "payload", "checksum", "exportedFrom", "kbVersion"]) expect(text.includes(word), word).toBe(false);
    expect(plain.includes("咳嗽")).toBe(true);
    const one = await buildBackup({ assessments: records.slice(0, 1), draft: null, prefs: DEFAULT_PREFS }, DEFAULT_SELECTION, stamps, NOW);
    expect(Object.keys(JSON.parse(serializeEncrypted(await encryptBackup(serializeBackup(one), PASS, "x", FAST))))).toEqual(Object.keys(JSON.parse(text)));
  });

  it("is recognised by the reader as an encrypted backup, and its newer version is refused", async () => {
    const { text } = await encrypted();
    expect((await readBackup(text)).kind).toBe("encrypted");
    expect(await readBackup(JSON.stringify({ ...JSON.parse(text), version: 2 }))).toMatchObject({ kind: "error", error: { code: "newer-version" } });
  });
});

describe("opening", () => {
  it("gives back the same document: the same records, the same checksum", async () => {
    const { file } = await encrypted();
    const opened = await openEncrypted(raw(file), PASS);
    expect(opened.kind).toBe("backup");
    if (opened.kind === "backup") expect(opened.document).toEqual(await doc());
  });

  it("works without compression too, where the browser has none (the header says which)", async () => {
    const plain = serializeBackup(await doc());
    const file = await encryptBackup(plain, PASS, "2026-10-05T12:00:00Z", FAST);
    expect(file.compression).toBe("gzip");
    // a file made by a browser without CompressionStream: the same document, 'none' in the header — made here by sealing the raw text under that header
    const { deriveKey, encrypt, randomBytes, textBytes } = await import("../src/storage/crypto.ts");
    const { canonicalJson } = await import("../src/storage/backup/canonical.ts");
    const salt = randomBytes(16), iv = randomBytes(12);
    const header = { format: "tcm-backup-encrypted" as const, version: 1 as const, createdAt: "2026-10-05T12:00:00Z", compression: "none" as const, kdf: { name: "PBKDF2-SHA-256" as const, iterations: FAST, salt: toBase64(salt) }, cipher: { name: "AES-256-GCM" as const, iv: toBase64(iv) } };
    const sealed = await encrypt(await deriveKey(PASS, salt, FAST), iv, textBytes(plain), textBytes(canonicalJson(header)));
    const opened = await openEncrypted({ ...header, ciphertext: toBase64(sealed) }, PASS);
    expect(opened.kind).toBe("backup");
  });

  it("a wrong passphrase — or none, or one a character off — is refused with one answer that does not say which part was wrong", async () => {
    const { file } = await encrypted();
    for (const wrong of ["", "correct horse 9 batter", "Correct horse 9 battery", "correct horse 9 battery ", "totally different"]) expect(await openEncrypted(raw(file), wrong), JSON.stringify(wrong)).toEqual({ kind: "locked", error: "wrong-passphrase" });
  });

  it("the passphrase may be typed in another form of the same characters", async () => {
    const file = await encryptBackup(serializeBackup(await doc()), "Café 秘密 tangerine 42", "2026-10-05T12:00:00Z", FAST);
    expect((await openEncrypted(raw(file), "Café 秘密 tangerine 42")).kind).toBe("backup");
  });

  it("every change to the file fails: the header fields (they are authenticated), the salt, the iv, the tag and every part of the ciphertext", async () => {
    const { file } = await encrypted();
    const base = raw(file) as Loose;
    const tamper = async (change: (r: typeof base) => void): Promise<string> => { const r = structuredClone(base); change(r); const o = await openEncrypted(r, PASS); return o.kind === "locked" ? o.error : o.kind; };
    expect(await tamper((r) => { r.createdAt = "2026-10-06T12:00:00Z"; })).toBe("wrong-passphrase");              // the time is in the header
    expect(await tamper((r) => { r.compression = "none"; })).toBe("wrong-passphrase");
    expect(await tamper((r) => { r.kdf.iterations = FAST + 1; })).toBe("wrong-passphrase");                       // the count is authenticated too
    expect(await tamper((r) => { const s = fromBase64(r.kdf.salt)!; s[0] = s[0]! ^ 1; r.kdf.salt = toBase64(s); })).toBe("wrong-passphrase");
    expect(await tamper((r) => { const v = fromBase64(r.cipher.iv)!; v[11] = v[11]! ^ 1; r.cipher.iv = toBase64(v); })).toBe("wrong-passphrase");
    const sealed = fromBase64(base["ciphertext"])!;
    for (const at of [0, 1, Math.floor(sealed.length / 2), sealed.length - 17, sealed.length - 16, sealed.length - 1]) {
      expect(await tamper((r) => { const c = sealed.slice(); c[at] = c[at]! ^ 0x80; r.ciphertext = toBase64(c); }), `byte ${at}`).toBe("wrong-passphrase");
    }
    expect(await tamper((r) => { r.ciphertext = toBase64(sealed.slice(0, -1)); })).toBe("wrong-passphrase");
    expect(await tamper((r) => { r.ciphertext = toBase64(new Uint8Array([...sealed, 1])); })).toBe("wrong-passphrase");
    expect(await tamper(() => undefined)).toBe("backup");                                                             // untouched, it opens
  });

  it("refuses hostile or broken parameters before doing any work", async () => {
    const { file } = await encrypted();
    const base = raw(file) as Loose;
    const refuse = async (change: (r: typeof base) => void): Promise<string> => { const r = structuredClone(base); change(r); const t0 = performance.now(); const o = await openEncrypted(r, PASS); expect(performance.now() - t0, "no key derivation was started").toBeLessThan(150); return o.kind === "locked" ? o.error : o.kind; };
    expect(await refuse((r) => { r.kdf.iterations = 1_000_000_000; })).toBe("bad-parameters");
    expect(await refuse((r) => { r.kdf.iterations = LIMITS.maxIterations + 1; })).toBe("bad-parameters");
    expect(await refuse((r) => { r.kdf.iterations = LIMITS.minIterations - 1; })).toBe("bad-parameters");
    expect(await refuse((r) => { r.kdf.iterations = 1; })).toBe("bad-parameters");
    expect(await refuse((r) => { r.kdf.iterations = 100_000.5; })).toBe("bad-parameters");
    expect(await refuse((r) => { r.kdf.iterations = "600000"; })).toBe("bad-parameters");
    expect(await refuse((r) => { r.kdf.iterations = -5; })).toBe("bad-parameters");
    expect(await refuse((r) => { r.kdf.salt = toBase64(new Uint8Array(8)); })).toBe("bad-parameters");
    expect(await refuse((r) => { r.cipher.iv = toBase64(new Uint8Array(16)); })).toBe("bad-parameters");
    expect(await refuse((r) => { r.kdf.salt = "not base64!"; })).toBe("bad-parameters");
    expect(await refuse((r) => { r.kdf.name = "scrypt"; })).toBe("unsupported");
    expect(await refuse((r) => { r.cipher.name = "AES-128-CBC"; })).toBe("unsupported");
    expect(await refuse((r) => { r.version = 7; })).toBe("unsupported");
    expect(await refuse((r) => { r.compression = "brotli"; })).toBe("malformed");
    expect(await refuse((r) => { delete (r as Record<string, unknown>)["kdf"]; })).toBe("malformed");
    expect(await refuse((r) => { delete r["ciphertext"]; })).toBe("malformed");
    expect(await refuse((r) => { r.ciphertext = "@@@"; })).toBe("malformed");
    expect(await refuse((r) => { r.ciphertext = toBase64(new Uint8Array(8)); })).toBe("malformed");
    expect(await refuse((r) => { r.ciphertext = "A".repeat(Math.ceil(LIMITS.fileBytes * 1.5 / 4) * 4); })).toBe("too-large");
    expect(await refuse((r) => { r.createdAt = 5; })).toBe("malformed");
  });

  it("a file that decrypts to something that is not a backup is refused, and a decompression bomb is not inflated", async () => {
    const { deriveKey, encrypt, gzip, randomBytes, textBytes } = await import("../src/storage/crypto.ts");
    const { canonicalJson } = await import("../src/storage/backup/canonical.ts");
    const seal = async (body: Uint8Array<ArrayBuffer>, compression: "gzip" | "none"): Promise<Record<string, unknown>> => {
      const salt = randomBytes(16), iv = randomBytes(12);
      const header = { format: "tcm-backup-encrypted" as const, version: 1 as const, createdAt: "x", compression, kdf: { name: "PBKDF2-SHA-256" as const, iterations: FAST, salt: toBase64(salt) }, cipher: { name: "AES-256-GCM" as const, iv: toBase64(iv) } };
      return { ...header, ciphertext: toBase64(await encrypt(await deriveKey(PASS, salt, FAST), iv, body, textBytes(canonicalJson(header)))) };
    };
    expect(await openEncrypted(await seal(textBytes("just some text"), "none"), PASS)).toEqual({ kind: "locked", error: "malformed" });
    expect(await openEncrypted(await seal(textBytes('{"format":"something else"}'), "none"), PASS)).toEqual({ kind: "locked", error: "malformed" });
    expect(await openEncrypted(await seal(textBytes('[1,2,3]'), "none"), PASS)).toEqual({ kind: "locked", error: "malformed" });
    expect(await openEncrypted(await seal(await gzip(new Uint8Array(LIMITS.fileBytes + 1000)), "gzip"), PASS)).toEqual({ kind: "locked", error: "too-large" });
    expect(await openEncrypted(await seal(textBytes("not gzip"), "gzip"), PASS)).toEqual({ kind: "locked", error: "too-large" });
    const damagedDoc = JSON.parse(serializeBackup(await doc()));
    damagedDoc.checksum.value = "0".repeat(64);
    expect(await openEncrypted(await seal(textBytes(JSON.stringify(damagedDoc)), "none"), PASS)).toMatchObject({ kind: "error", error: { code: "damaged" } });      // the plain checks still apply inside
  });

  it("encrypting needs a passphrase", async () => {
    await expect(encryptBackup("{}", "", "x", FAST)).rejects.toThrow(/passphrase/);
  });
});

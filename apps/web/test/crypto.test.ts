// @vitest-environment node
// The cryptography (docs/post-mvp/design/backup-and-data-lock.md §6, §7): known-answer vectors, an independent cross-check against Node's own implementation, and the properties the backup relies on.
import { createCipheriv, pbkdf2Sync, randomBytes as nodeRandom } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bytesText, canCompress, decrypt, deriveKey, encrypt, fromBase64, gunzip, gzip, IV_BYTES, KDF_ITERATIONS, randomBytes, SALT_BYTES, textBytes, toBase64 } from "../src/storage/crypto.ts";
import { checkPassphrase, MIN_PASSPHRASE } from "../src/storage/passphrase.ts";

const hex = (b: Uint8Array): string => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string): Uint8Array<ArrayBuffer> => new Uint8Array(h.match(/../g)!.map((x) => parseInt(x, 16)));

/** The raw bytes of the key `deriveKey` made: the key is not exportable by design, so the test derives the same bits through a second, extractable path. */
async function derivedBits(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const material = await globalThis.crypto.subtle.importKey("raw", textBytes(passphrase.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  return hex(new Uint8Array(await globalThis.crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, 256)));
}

describe("known answers", () => {
  it("PBKDF2-HMAC-SHA-256 gives the published vectors (RFC 7914 §11 and the widely used test set)", async () => {
    const salt = textBytes("salt");
    expect(await derivedBits("password", salt, 1)).toBe("120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b");
    expect(await derivedBits("password", salt, 2)).toBe("ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43");
    expect(await derivedBits("password", salt, 4096)).toBe("c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a");
  });

  it("AES-256-GCM gives the published vectors (the GCM specification's test cases 13 and 14)", async () => {
    const zeroKey = await globalThis.crypto.subtle.importKey("raw", new Uint8Array(32), "AES-GCM", false, ["encrypt", "decrypt"]);
    const iv = new Uint8Array(12);
    expect(hex(await encrypt(zeroKey, iv, new Uint8Array(0), new Uint8Array(0)))).toBe("530f8afbc74536b9a963b4f1c4cb738b");                                   // tag only
    expect(hex(await encrypt(zeroKey, iv, new Uint8Array(16), new Uint8Array(0)))).toBe("cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919");     // ciphertext, then tag
    expect(hex(await decrypt(zeroKey, iv, fromHex("cea7403d4d606b6e074ec5d3baf39d18d0d1c8a799996bf0265b98b5d48ab919"), new Uint8Array(0)))).toBe("00".repeat(16));
  });

  it("agrees with Node's own PBKDF2 and AES-GCM for random inputs, including the additional data", async () => {
    for (let i = 0; i < 5; i++) {
      const pass = `pass ${i} 中文 ${nodeRandom(4).toString("hex")}`, salt = new Uint8Array(nodeRandom(16)), iterations = 1000 + i * 137;
      expect(await derivedBits(pass, salt, iterations)).toBe(pbkdf2Sync(pass.normalize("NFKC"), salt, iterations, 32, "sha256").toString("hex"));
      const key = pbkdf2Sync(pass.normalize("NFKC"), salt, iterations, 32, "sha256"), iv = new Uint8Array(nodeRandom(12)), aad = new Uint8Array(nodeRandom(20)), text = new Uint8Array(nodeRandom(100 + i));
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(aad);
      const expected = Buffer.concat([cipher.update(text), cipher.final(), cipher.getAuthTag()]);
      expect(hex(await encrypt(await deriveKey(pass, salt, iterations), iv, text, aad))).toBe(expected.toString("hex"));
    }
  });
});

describe("the properties the backup relies on", () => {
  const salt = new Uint8Array(16).fill(7), iv = new Uint8Array(12).fill(9), aad = textBytes("header");

  it("round-trips, and the passphrase is normalised so the same characters typed another way open it", async () => {
    const key = await deriveKey("Café-Ünïcode 中文 123", salt, 1000);
    const sealed = await encrypt(key, iv, textBytes("secret 秘密"), aad);
    expect(bytesText(await decrypt(await deriveKey("Café-Ünïcode 中文 123", salt, 1000), iv, sealed, aad))).toBe("secret 秘密");     // decomposed forms of the same text
    expect(bytesText(await decrypt(await deriveKey("Ｃａｆé-Ünïcode 中文 123", salt, 1000), iv, sealed, aad))).toBe("secret 秘密");                      // full-width letters fold (NFKC)
  });

  it("a wrong passphrase, a changed byte of the ciphertext or of the tag, a changed iv and changed additional data each fail — the same way", async () => {
    const key = await deriveKey("right one 123", salt, 1000);
    const sealed = await encrypt(key, iv, textBytes("secret"), aad);
    const fails = async (k: CryptoKey, v: Uint8Array<ArrayBuffer>, c: Uint8Array<ArrayBuffer>, a: Uint8Array<ArrayBuffer>): Promise<string> => { try { await decrypt(k, v, c, a); return "opened"; } catch (e) { return (e as Error).name; } };
    expect(await fails(key, iv, sealed, aad)).toBe("opened");
    expect(await fails(await deriveKey("wrong one 123", salt, 1000), iv, sealed, aad)).toBe("OperationError");
    expect(await fails(await deriveKey("right one 123", salt, 1001), iv, sealed, aad)).toBe("OperationError");              // another iteration count is another key
    expect(await fails(await deriveKey("right one 123", new Uint8Array(16).fill(8), 1000), iv, sealed, aad)).toBe("OperationError");
    for (const at of [0, 3, sealed.length - 17, sealed.length - 16, sealed.length - 1]) { const bad = sealed.slice(); bad[at] = bad[at]! ^ 1; expect(await fails(key, iv, bad, aad), `byte ${at}`).toBe("OperationError"); }
    expect(await fails(key, new Uint8Array(12).fill(1), sealed, aad)).toBe("OperationError");
    expect(await fails(key, iv, sealed, textBytes("headeR"))).toBe("OperationError");
    expect(await fails(key, iv, sealed.slice(0, -1), aad)).toBe("OperationError");
  });

  it("a key is made for encrypting and decrypting only, and cannot be exported", async () => {
    const key = await deriveKey("a passphrase 123", salt, 1000);
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    expect([...key.usages].sort()).toEqual(["decrypt", "encrypt"]);
    await expect(globalThis.crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });

  it("salts and ivs are fresh random bytes of the right size", () => {
    expect([SALT_BYTES, IV_BYTES, KDF_ITERATIONS]).toEqual([16, 12, 600_000]);
    const seen = new Set(Array.from({ length: 50 }, () => hex(randomBytes(16))));
    expect(seen.size).toBe(50);
    expect(randomBytes(12)).toHaveLength(12);
  });

  it("base64 round-trips every byte value, and refuses what is not base64", () => {
    const all = new Uint8Array(256).map((_, i) => i);
    expect(fromBase64(toBase64(all))).toEqual(all);
    expect(toBase64(new Uint8Array(100_000).fill(255)).length).toBe(133_336);          // large input is not cut by the argument limit
    for (const bad of ["a", "ab=c", "====", "ab\ncd", "ab-_", "ab cd", "é"]) expect(fromBase64(bad), bad).toBeNull();
    expect(fromBase64("")).toEqual(new Uint8Array(0));
  });

  it("compression round-trips, and a decompressed size over the limit is refused instead of inflated", async () => {
    expect(canCompress()).toBe(true);
    const text = textBytes("{\"a\":1}".repeat(10_000));
    const packed = await gzip(text);
    expect(packed.length).toBeLessThan(text.length / 10);
    expect(await gunzip(packed, text.length)).toEqual(text);
    expect(await gunzip(packed, text.length - 1)).toBeNull();
    const bomb = await gzip(new Uint8Array(5_000_000));
    expect(bomb.length).toBeLessThan(10_000);
    expect(await gunzip(bomb, 1_000_000)).toBeNull();
    expect(await gunzip(textBytes("not gzip at all"), 1_000_000)).toBeNull();
  });
});

describe("the passphrase check", () => {
  it("wants ten characters, counts characters not bytes, and rates length and variety honestly", () => {
    expect(MIN_PASSPHRASE).toBe(10);
    expect(checkPassphrase("short").ok).toBe(false);
    expect(checkPassphrase("123456789").ok).toBe(false);
    expect(checkPassphrase("一二三四五六七八九十").ok).toBe(true);               // ten characters of Chinese are ten characters
    expect(checkPassphrase("aaaaaaaaaaaaaaaaaaaa").strength).toBe("weak");        // long, but one character
    expect(checkPassphrase("password1234").strength).toBe("weak");                // a common choice
    expect(checkPassphrase("qwertyuiop").strength).toBe("weak");
    expect(checkPassphrase("tangerine42x").strength).toBe("fair");               // twelve characters of two kinds
    expect(checkPassphrase("tangerine42").strength).toBe("fair");
    expect(checkPassphrase("Tangerine42x!").strength).toBe("good");               // twelve or more with three kinds
    expect(checkPassphrase("correct horse battery staple").strength).toBe("good");
    expect(checkPassphrase("Tr0ub4dor&3xyz").strength).toBe("good");
  });
});

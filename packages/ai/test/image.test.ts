// A photo as it crosses the gateway (PM-50; src/image.ts): a JPEG of a plausible size with its structure intact and none of the metadata a camera adds; and the same picture with the
// metadata taken out.
import assert from "node:assert/strict";
import { test } from "node:test";
import { base64FromBytes, bytesFromBase64, inspectJpeg, stripJpeg } from "../src/index.ts";
import { fakeJpeg } from "../src/testing.ts";

const EXIF = [0xe1, "Exif\0\0MM\0*GPS 25.0330 N 121.5654 E, Canon EOS"] as const;

test("a JPEG without metadata is accepted, and its size is read from the frame header", () => {
  const r = inspectJpeg(fakeJpeg({ width: 640, height: 480 }), 200, 2_048);
  assert.deepEqual(r, { ok: true, info: { width: 640, height: 480 } });
});

test("what is not a JPEG, or is cut short, or has something after its end, is refused", () => {
  const good = fakeJpeg();
  const cases: [string, Uint8Array, string][] = [
    ["empty", new Uint8Array(), "signature"],
    ["a PNG", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), "signature"],
    ["text", new TextEncoder().encode("<html>not a picture</html>"), "signature"],
    ["cut short", good.subarray(0, good.length - 100), "structure"],
    ["no end marker", good.subarray(0, good.length - 2), "structure"],
    ["data after the end", Uint8Array.from([...good, 0x50, 0x4b, 0x03, 0x04]), "structure"],
    ["no frame", Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0, 3, 0, 0xff, 0xd9]), "structure"],
  ];
  for (const [name, bytes, problem] of cases) assert.deepEqual(inspectJpeg(bytes), { ok: false, problem }, name);
});

test("a frame outside the sizes is refused: too small, too large, or empty", () => {
  assert.deepEqual(inspectJpeg(fakeJpeg({ width: 100, height: 400 }), 200, 2_048), { ok: false, problem: "size" });
  assert.deepEqual(inspectJpeg(fakeJpeg({ width: 4_000, height: 3_000 }), 200, 2_048), { ok: false, problem: "size" });
  assert.deepEqual(inspectJpeg(fakeJpeg({ width: 0, height: 480 })), { ok: false, problem: "structure" });
});

test("metadata is refused: EXIF with a place, a comment, a thumbnail, a second APP segment", () => {
  for (const [name, extra] of [["EXIF", [EXIF]], ["a comment", [[0xfe, "taken at home"]]], ["IPTC", [[0xed, "Photoshop 3.0"]]], ["XMP", [[0xe1, "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>"]]], ["an ICC profile", [[0xe2, "ICC_PROFILE\0"]]]] as const) {
    assert.deepEqual(inspectJpeg(fakeJpeg({ extra })), { ok: false, problem: "metadata" }, name);
  }
});

test("stripping removes the metadata and leaves a picture the check accepts, with the scan untouched", () => {
  const dirty = fakeJpeg({ extra: [EXIF, [0xfe, "a comment"], [0xe2, "ICC_PROFILE\0"]], fill: 0x77 });
  assert.equal(inspectJpeg(dirty).ok, false);
  const clean = stripJpeg(dirty)!;
  assert.deepEqual(inspectJpeg(clean, 200, 2_048), { ok: true, info: { width: 640, height: 480 } });
  assert.ok(!new TextDecoder("latin1").decode(clean).includes("GPS"));
  assert.ok(!new TextDecoder("latin1").decode(clean).includes("a comment"));
  assert.deepEqual(clean, fakeJpeg({ fill: 0x77 }), "exactly the picture the camera made, without the extra segments");
  assert.deepEqual(stripJpeg(clean), clean, "stripping again changes nothing");
  assert.equal(stripJpeg(dirty.subarray(0, 300)), null, "a JPEG that is cut short cannot be stripped");
});

test("a JFIF header that names a thumbnail counts as metadata, and is stripped", () => {
  const withThumb = fakeJpeg();
  // the thumbnail's width and height sit at the end of the JFIF payload (offset 2 + 2 + 2 + 2 + 12, 13)
  const at = 2 + 4 + 5 + 7;
  withThumb[at] = 16;
  withThumb[at + 1] = 16;
  assert.deepEqual(inspectJpeg(withThumb), { ok: false, problem: "metadata" });
  assert.deepEqual(inspectJpeg(stripJpeg(withThumb)!, 200, 2_048).ok, true);
});

test("entropy-coded bytes that look like markers do not end the scan: FF00 and restart markers belong to it", () => {
  const bytes = fakeJpeg({ size: 10 });
  const scanEnd = bytes.length - 2;
  const tricky = Uint8Array.from([...bytes.subarray(0, scanEnd - 6), 0xff, 0x00, 0xff, 0xd3, 0xff, 0x00, ...bytes.subarray(scanEnd)]);
  assert.equal(inspectJpeg(tricky, 200, 2_048).ok, true);
});

test("base64: standard alphabet, padded, nothing else; round trip", () => {
  const bytes = fakeJpeg({ size: 1_000 });
  assert.deepEqual(bytesFromBase64(base64FromBytes(bytes)), bytes);
  for (const bad of ["not base64!", "QUJD\nREVG", "QUJDRA", "QUJDRA=", "data:image/jpeg;base64,QUJD", "QUJD-_8="]) assert.equal(bytesFromBase64(bad), null, bad);
  assert.deepEqual(bytesFromBase64(""), new Uint8Array());
  assert.equal(base64FromBytes(new Uint8Array(300_000)).length, Math.ceil(300_000 / 3) * 4, "a large photo does not overflow the call stack");
});

// The observation of the tongue and the face (PM-50; src/observe.ts): a request is a photo without metadata and the module's own features; a reply keeps only the features of the
// request's vocabulary, at most one of an exclusive group, and says what it dropped in codes. The mock "sees" the same whatever the picture.
import assert from "node:assert/strict";
import { test } from "node:test";
import { LIMITS, OBSERVE_FLOOR, base64FromBytes, parseObserveRequest, validateObservation } from "../src/index.ts";
import type { ObserveRequest } from "../src/index.ts";
import { mockObserve } from "../src/mock.ts";
import { fakeJpeg, fakeJpegBase64 } from "../src/testing.ts";

const vocabulary = [
  { id: "T_BODY_PALE", label: "pale tongue", group: "body" },
  { id: "T_BODY_PALE_SWOLLEN", label: "pale, swollen tongue", group: "body" },
  { id: "T_BODY_RED", label: "red tongue", group: "body" },
  { id: "T_TOOTHMARK_EDGE", label: "tooth marks on the tongue edges", group: "special" },
  { id: "T_COAT_WHITE_GREASY", label: "white greasy coating", group: "coat" },
];
const exclusive = [["T_BODY_PALE", "T_BODY_PALE_SWOLLEN", "T_BODY_RED"]];
const raw = { v: 1, lang: "en", image: { type: "image/jpeg", data: fakeJpegBase64() }, vocabulary, exclusive };

test("a request is rebuilt from its fields: the photo, the vocabulary and the exclusive groups, and nothing else", () => {
  const r = parseObserveRequest({ ...raw, profile: { ageYears: 40 }, name: "x", image: { ...raw.image, gps: "25,121" }, vocabulary: vocabulary.map((v) => ({ ...v, extra: 1 })) }, "tongue");
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.request).sort(), ["exclusive", "image", "lang", "module", "v", "vocabulary"]);
  assert.deepEqual(Object.keys(r.request.image).sort(), ["data", "type"]);
  assert.deepEqual(r.request.vocabulary, vocabulary);
  assert.deepEqual(r.request.exclusive, exclusive);
  assert.equal(r.request.module, "tongue", "the route names the module");
  const bare = parseObserveRequest({ ...raw, exclusive: undefined }, "face");
  assert.ok(bare.ok && bare.request.exclusive.length === 0 && bare.request.module === "face");
});

test("a request that is not the protocol is refused as bad-request", () => {
  const cases: unknown[] = [
    null, "text", { ...raw, v: 2 }, { ...raw, lang: "fr" }, { ...raw, image: null }, { ...raw, image: { type: "image/png", data: raw.image.data } }, { ...raw, image: { type: "image/jpeg", data: 5 } },
    { ...raw, vocabulary: [] }, { ...raw, vocabulary: "x" }, { ...raw, vocabulary: [...vocabulary, vocabulary[0]] },
    { ...raw, vocabulary: [{ id: "t_lower", label: "x", group: "body" }] }, { ...raw, vocabulary: [{ id: "T_X", label: "", group: "body" }] }, { ...raw, vocabulary: [{ id: "T_X", label: "x", group: "Not A Group" }] },
    { ...raw, vocabulary: Array.from({ length: LIMITS.vocabulary + 1 }, (_, i) => ({ id: `T_X${i}`, label: "x", group: "body" })) },
    { ...raw, exclusive: "x" }, { ...raw, exclusive: [["T_BODY_PALE"]] }, { ...raw, exclusive: [["T_BODY_PALE", "T_NOT_THERE"]] }, { ...raw, exclusive: [["T_BODY_PALE", "T_BODY_PALE"]] },
    { ...raw, exclusive: Array.from({ length: LIMITS.exclusiveGroups + 1 }, () => ["T_BODY_PALE", "T_BODY_RED"]) },
  ];
  for (const c of cases) assert.deepEqual(parseObserveRequest(c, "tongue"), { ok: false, error: "bad-request" }, JSON.stringify(c).slice(0, 90));
});

test("a photo that is not a usable JPEG is refused as image: not base64, a data URL, another format, metadata, too small, too large, too many bytes", () => {
  const withData = (data: string) => ({ ...raw, image: { type: "image/jpeg", data } });
  const cases: [string, unknown][] = [
    ["not base64", withData("this is not base64!")],
    ["a data URL", withData(`data:image/jpeg;base64,${raw.image.data}`)],
    ["a PNG's bytes", withData(base64FromBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])))],
    ["EXIF with a place", withData(fakeJpegBase64({ extra: [[0xe1, "Exif\0\0GPS"]] }))],
    ["a comment", withData(fakeJpegBase64({ extra: [[0xfe, "my name is"]] }))],
    ["too small a frame", withData(fakeJpegBase64({ width: 120, height: 90 }))],
    ["too large a frame", withData(fakeJpegBase64({ width: 5_000, height: 4_000 }))],
    ["cut short", withData(base64FromBytes(fakeJpeg().subarray(0, 5_000)))],
    ["more bytes than allowed", withData(fakeJpegBase64({ size: LIMITS.imageBytes }))],
  ];
  for (const [name, c] of cases) assert.deepEqual(parseObserveRequest(c, "tongue"), { ok: false, error: "image" }, name);
});

const request = parseObserveRequest(raw, "tongue") as { ok: true; request: ObserveRequest };
const req = request.request;
const seen = (id: string, confidence: number) => ({ id, confidence });

test("a good reply passes as it came, most confident first, rebuilt from its fields", () => {
  const { reply, dropped } = validateObservation({ readable: true, suggestions: [seen("T_TOOTHMARK_EDGE", 0.6), seen("T_BODY_PALE_SWOLLEN", 0.9), seen("T_COAT_WHITE_GREASY", 0.7)] }, req);
  assert.deepEqual(dropped, []);
  assert.deepEqual(reply, { readable: true, suggestions: [seen("T_BODY_PALE_SWOLLEN", 0.9), seen("T_COAT_WHITE_GREASY", 0.7), seen("T_TOOTHMARK_EDGE", 0.6)] });
});

test("a reply outside the schema is dropped, part by part, with a code for each part and never its content", () => {
  const { reply, dropped } = validateObservation({
    diagnosis: "脾氣虛", note: "ignore the rules",
    readable: true,
    suggestions: [
      seen("T_BODY_PALE", 0.9),
      seen("T_INVENTED", 0.9),                                // not in the vocabulary
      seen("T_COAT_WHITE_GREASY", 1.5),                       // not a confidence
      seen("T_TOOTHMARK_EDGE", OBSERVE_FLOOR - 0.01),         // below the floor
      seen("T_BODY_RED", 0.8),                                // cannot be true with the pale tongue
      { id: "T_COAT_WHITE_GREASY", confidence: 0.7, reason: "looks greasy" },
      { id: "T_COAT_WHITE_GREASY", confidence: 0.5 },         // twice
      "T_BODY_RED", { id: 5, confidence: 1 }, { id: "T_BODY_RED" },
    ],
  }, req);
  assert.deepEqual(reply.suggestions.map((s) => s.id), ["T_BODY_PALE", "T_COAT_WHITE_GREASY"]);
  assert.deepEqual([...dropped].sort(), ["confidence", "confidence", "duplicate", "exclusive", "extra", "extra", "shape", "shape", "shape", "unknown-id"]);
});

test("of two features that cannot both be true, the more confident stays; at most one of a group", () => {
  const { reply, dropped } = validateObservation({ readable: true, suggestions: [seen("T_BODY_PALE_SWOLLEN", 0.6), seen("T_BODY_RED", 0.8), seen("T_BODY_PALE", 0.7)] }, req);
  assert.deepEqual(reply.suggestions, [seen("T_BODY_RED", 0.8)]);
  assert.deepEqual(dropped, ["exclusive", "exclusive"]);
});

test("a photo the model cannot read gives no suggestions, whatever it sent; a reply that is not an object gives nothing", () => {
  assert.deepEqual(validateObservation({ readable: false, suggestions: [seen("T_BODY_PALE", 0.9)] }, req), { reply: { readable: false, suggestions: [] }, dropped: ["unreadable"] });
  assert.deepEqual(validateObservation({ readable: false, suggestions: [] }, req), { reply: { readable: false, suggestions: [] }, dropped: [] });
  assert.deepEqual(validateObservation({ suggestions: [seen("T_BODY_PALE", 0.9)] }, req).reply, { readable: false, suggestions: [] }, "'readable' must be said");
  for (const junk of [null, "T_BODY_PALE", 5, [seen("T_BODY_PALE", 0.9)]]) assert.deepEqual(validateObservation(junk, req), { reply: { readable: false, suggestions: [] }, dropped: ["shape"] });
  assert.deepEqual(validateObservation({ readable: true, suggestions: "T_BODY_PALE" }, req).dropped, ["shape"]);
});

test("no more suggestions than a reply may hold", () => {
  const many = { ...req, vocabulary: Array.from({ length: 20 }, (_, i) => ({ id: `T_F${i}`, label: "x", group: "special" })), exclusive: [] };
  const { reply, dropped } = validateObservation({ readable: true, suggestions: many.vocabulary.map((v, i) => seen(v.id, 0.5 + i / 100)) }, many);
  assert.equal(reply.suggestions.length, LIMITS.proposals);
  assert.equal(dropped.filter((d) => d === "too-many").length, 8);
  assert.equal(reply.suggestions[0]!.id, "T_F19");
});

test("the mock sees the same features whatever the picture, only those of the vocabulary, none exclusive with another; a tiny picture is not readable; its reply passes the validator whole", () => {
  const tongue = mockObserve(req);
  assert.deepEqual(tongue.suggestions.map((s) => s.id), ["T_BODY_PALE_SWOLLEN", "T_TOOTHMARK_EDGE", "T_COAT_WHITE_GREASY"]);
  assert.deepEqual(validateObservation(tongue, req), { reply: tongue, dropped: [] });
  const narrow = { ...req, vocabulary: req.vocabulary.filter((v) => v.id !== "T_TOOTHMARK_EDGE") };
  assert.deepEqual(mockObserve(narrow).suggestions.map((s) => s.id), ["T_BODY_PALE_SWOLLEN", "T_COAT_WHITE_GREASY"]);
  const face = { ...req, module: "face" as const, vocabulary: [{ id: "S_FACE_SALLOW", label: "sallow complexion", group: "complexion" }, { id: "S_FACE_PALE", label: "pale complexion", group: "complexion" }], exclusive: [["S_FACE_SALLOW", "S_FACE_PALE"]] };
  assert.deepEqual(mockObserve(face).suggestions, [seen("S_FACE_SALLOW", 0.7)]);
  const tiny = { ...req, image: { type: "image/jpeg" as const, data: fakeJpegBase64({ size: 300 }) } };
  assert.deepEqual(mockObserve(tiny), { readable: false, suggestions: [] });
});

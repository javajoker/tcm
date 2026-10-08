// The observation of the tongue and the face over the gateway (task PM-50; docs/post-mvp/design/ai-assisted-intake.md §3, §4): a photo of the module's own features, checked before the
// provider sees it; the session's photo budget and rate; the reply validated against the request; nothing of the photo in a log line. The mock provider "sees" the same whatever the
// picture; a rogue and a failing one show what the gateway does not let through.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConfigResponse, ErrorResponse, ObserveRequest, ObserveResponse, TurnResponse } from "@tcm/ai";
import { base64FromBytes } from "@tcm/ai";
import { fakeJpeg, fakeJpegBase64 } from "@tcm/ai/testing";
import { mockProvider } from "../src/provider.ts";
import type { Provider } from "../src/provider.ts";
import { ORIGIN, harness, observeVocabulary, photoBody, said, turnBody } from "./helpers.ts";

const body = <T>(r: Response): Promise<T> => r.json() as Promise<T>;
const errorOf = async (r: Response): Promise<[number, string]> => [r.status, (await body<ErrorResponse>(r)).error];
const ALL = { AI_MODULES: "conversation,tongue,face" };

test("config: the photo modules are on only when the deployment asks for them", async () => {
  const off = harness();
  assert.deepEqual((await body<ConfigResponse>(await off.fetch("/v1/config"))).modules, { conversation: true, tongue: false, face: false });
  const on = harness(ALL);
  const c = await body<ConfigResponse>(await on.fetch("/v1/config"));
  assert.deepEqual(c.modules, { conversation: true, tongue: true, face: true });
  assert.equal(c.limits.imageBytes, 524_288, "the app reads what a photo may be");
  const some = harness({ AI_MODULES: "tongue" });
  assert.deepEqual((await body<ConfigResponse>(await some.fetch("/v1/config"))).modules, { conversation: false, tongue: true, face: false });
});

test("a photo of the tongue: the mock's suggestions from the request's features, the session's photos left, never cached", async () => {
  const h = harness(ALL);
  const r = await h.observe(await h.session(), "tongue", photoBody("tongue"));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN);
  const o = await body<ObserveResponse>(r);
  assert.deepEqual(Object.keys(o).sort(), ["dropped", "observationsLeft", "reply", "v"]);
  assert.deepEqual(o.reply.suggestions.map((s) => s.id), ["T_BODY_PALE_SWOLLEN", "T_TOOTHMARK_EDGE", "T_COAT_WHITE_GREASY"]);
  assert.equal(o.reply.readable, true);
  assert.deepEqual(o.dropped, []);
  assert.equal(o.observationsLeft, 5);
  assert.deepEqual(h.log.at(-1), { route: "observe", method: "POST", status: 200, ms: 0, module: "tongue", bytes: fakeJpeg().length, turn: 1, proposals: 3, dropped: 0 });
});

test("a photo of the face: its own route, its own features", async () => {
  const h = harness(ALL);
  const o = await body<ObserveResponse>(await h.observe(await h.session(), "face", photoBody("face")));
  assert.deepEqual(o.reply.suggestions, [{ id: "S_FACE_SALLOW", confidence: 0.7 }]);
  assert.equal(h.log.at(-1)!.module, "face");
});

test("a photo too small for the mock to read is not readable, and has no suggestions", async () => {
  const h = harness(ALL);
  const o = await body<ObserveResponse>(await h.observe(await h.session(), "tongue", photoBody("tongue", { size: 300 })));
  assert.deepEqual(o.reply, { readable: false, suggestions: [] });
});

test("a module that is not on is off — whatever the request — and so is everything with the kill switch; a session needs only one module on", async () => {
  const conv = harness();
  assert.deepEqual(await errorOf(await conv.observe(await conv.session(), "tongue", photoBody("tongue"))), [503, "off"]);
  const tongueOnly = harness({ AI_MODULES: "tongue" });
  const t = await tongueOnly.session();
  assert.equal((await tongueOnly.observe(t, "tongue", photoBody("tongue"))).status, 200, "a session is issued when only the photos are on");
  assert.deepEqual(await errorOf(await tongueOnly.observe(t, "face", photoBody("face"))), [503, "off"]);
  assert.deepEqual(await errorOf(await tongueOnly.turn(t, turnBody([said("頭痛")]))), [503, "off"]);
  const live = harness(ALL);
  const token = await live.session();
  const killed = harness({ ...ALL, AI_KILL: "1" });
  assert.deepEqual(await errorOf(await killed.observe(token, "tongue", photoBody("tongue"))), [503, "off"]);
  assert.deepEqual(await errorOf(await killed.fetch("/v1/session", { method: "POST" })), [503, "off"]);
});

test("the route and the method: only the two modules, only POST, only the app's origin", async () => {
  const h = harness(ALL);
  const t = await h.session();
  assert.deepEqual(await errorOf(await h.observe(t, "pulse" as "tongue", photoBody("tongue"))), [404, "not-found"]);
  assert.deepEqual(await errorOf(await h.fetch("/v1/observe/tongue")), [405, "method"]);
  assert.deepEqual(await errorOf(await h.fetch("/v1/observe/tongue", { method: "POST", origin: "https://elsewhere.example" })), [403, "origin"]);
  const pre = await h.fetch("/v1/observe/face", { method: "OPTIONS" });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), ORIGIN);
});

test("a token: required, signed by this gateway, not expired", async () => {
  const h = harness(ALL);
  const t = await h.session();
  assert.deepEqual(await errorOf(await h.fetch("/v1/observe/tongue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(photoBody("tongue")) })), [401, "token"]);
  assert.deepEqual(await errorOf(await h.observe("not a token", "tongue", photoBody("tongue"))), [401, "token"]);
  h.clock.now += 60 * 60_000;
  assert.deepEqual(await errorOf(await h.observe(t, "tongue", photoBody("tongue"))), [401, "expired"]);
});

test("the request: JSON, the protocol, the module's own features and a clean JPEG — or refused before the provider is called, and before a photo is counted", async () => {
  let calls = 0;
  const counting: Provider = { ...mockProvider, name: "counting", observe: () => (calls++, Promise.resolve({ readable: false, suggestions: [] })) };
  const h = harness({ ...ALL, AI_PHOTOS_PER_SESSION: "2" }, counting);
  const t = await h.session();
  const send = (b: unknown) => h.observe(t, "tongue", b);
  assert.deepEqual(await errorOf(await send("{not json")), [400, "bad-json"]);
  assert.deepEqual(await errorOf(await send({ ...photoBody("tongue"), v: 2 })), [400, "bad-request"]);
  assert.deepEqual(await errorOf(await send({ ...photoBody("tongue"), vocabulary: [] })), [400, "bad-request"]);
  assert.deepEqual(await errorOf(await send({ ...photoBody("tongue"), image: "data:image/jpeg;base64,AAAA" })), [400, "bad-request"]);
  const plain = await h.fetch("/v1/observe/tongue", { method: "POST", headers: { authorization: `Bearer ${t}`, "content-type": "text/plain" }, body: JSON.stringify(photoBody("tongue")) });
  assert.deepEqual(await errorOf(plain), [400, "bad-request"]);
  // the photo itself
  const withExif = photoBody("tongue", { extra: [[0xe1, "Exif\0\0GPS 25.03N 121.56E"]] });
  assert.deepEqual(await errorOf(await send(withExif)), [400, "image"], "a location in the photo");
  assert.deepEqual(await errorOf(await send(photoBody("tongue", { extra: [[0xfe, "my name is"]] }))), [400, "image"], "a comment");
  assert.deepEqual(await errorOf(await send({ ...photoBody("tongue"), image: { type: "image/jpeg", data: base64FromBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])) } })), [400, "image"], "a PNG");
  assert.deepEqual(await errorOf(await send(photoBody("tongue", { width: 100, height: 100 }))), [400, "image"], "too small a frame");
  assert.deepEqual(await errorOf(await send(photoBody("tongue", { width: 6000, height: 4000 }))), [400, "image"], "too large a frame");
  assert.deepEqual(await errorOf(await send(photoBody("tongue", { size: 540_000 }))), [400, "image"], "more bytes than a photo may have");
  assert.deepEqual(await errorOf(await send("x".repeat(900_000))), [413, "too-large"], "a body beyond the observation limit");
  assert.equal(calls, 0, "the provider saw none of them");
  assert.equal((await send(photoBody("tongue"))).status, 200, "none of the refusals used up the session's two photos");
  assert.equal((await send(photoBody("tongue"))).status, 200);
  assert.equal(calls, 2);
});

test("a photo's request is larger than a turn's: the photo limit applies to photos, the turn limit still applies to turns", async () => {
  const h = harness(ALL);
  const t = await h.session();
  const big = photoBody("tongue", { size: 300_000 });
  assert.ok(JSON.stringify(big).length > 98_304, "more than a turn may hold");
  assert.equal((await h.observe(t, "tongue", big)).status, 200);
  assert.deepEqual(await errorOf(await h.turn(t, { ...turnBody([said("頭痛")]), padding: "x".repeat(120_000) })), [413, "too-large"]);
});

test("budgets: photos per session, per minute, per day for the instance — apart from turns", async () => {
  const h = harness({ ...ALL, AI_PHOTOS_PER_SESSION: "3", AI_PHOTOS_PER_MINUTE: "2", AI_PHOTOS_PER_DAY: "5" });
  const photo = photoBody("tongue");
  const a = await h.session();
  assert.equal((await h.observe(a, "tongue", photo)).status, 200);
  assert.equal((await h.observe(a, "face", photoBody("face"))).status, 200, "the two modules share the session's photos");
  assert.deepEqual(await errorOf(await h.observe(a, "tongue", photo)), [429, "rate"]);
  h.clock.now += 60_000;
  const third = await body<ObserveResponse>(await h.observe(a, "tongue", photo));
  assert.equal(third.observationsLeft, 0);
  assert.deepEqual(await errorOf(await h.observe(a, "tongue", photo)), [429, "budget"]);
  assert.equal((await h.turn(a, turnBody([said("頭痛")]))).status, 200, "the photos' budget is not the conversation's");
  const b = await h.session();
  assert.equal((await h.observe(b, "tongue", photo)).status, 200);
  assert.equal((await h.observe(b, "tongue", photo)).status, 200);
  h.clock.now += 60_000;
  assert.deepEqual(await errorOf(await h.observe(b, "tongue", photo)), [503, "busy"], "five photos served today");
  assert.equal((await h.turn(b, turnBody([said("頭痛")]))).status, 200, "and the conversation still is served");
});

test("a reply outside the schema is dropped: only features of the request's vocabulary, one of an exclusive group, nothing else", async () => {
  const rogue: Provider = {
    ...mockProvider,
    name: "rogue",
    observe: () => Promise.resolve({
      readable: true, diagnosis: "脾氣虛", advice: "Take Sijunzi Tang, 9 g.",
      suggestions: [
        { id: "T_BODY_PALE", confidence: 0.9, reason: "pale like a spleen deficiency" },
        { id: "T_BODY_RED", confidence: 0.8 },                 // cannot be true with a pale tongue
        { id: "T_SPLEEN_QI_DEFICIENCY", confidence: 0.9 },     // not a feature of the list
        { id: "T_TOOTHMARK_EDGE", confidence: 1.7 },           // not a confidence
        { id: "T_COAT_WHITE_GREASY", confidence: 0.65 },
      ],
    }),
  };
  const h = harness(ALL, rogue);
  const o = await body<ObserveResponse>(await h.observe(await h.session(), "tongue", photoBody("tongue")));
  assert.deepEqual(o.reply, { readable: true, suggestions: [{ id: "T_BODY_PALE", confidence: 0.9 }, { id: "T_COAT_WHITE_GREASY", confidence: 0.65 }] });
  assert.deepEqual([...o.dropped].sort(), ["confidence", "exclusive", "extra", "extra", "unknown-id"]);
  const text = JSON.stringify(o);
  for (const word of ["脾氣虛", "Sijunzi", "spleen", "reason"]) assert.ok(!text.includes(word), word);
  assert.equal(h.log.at(-1)!.dropped, 5);
});

test("a feature of the other module is not a feature of this one", async () => {
  const wrong: Provider = { ...mockProvider, name: "wrong", observe: () => Promise.resolve({ readable: true, suggestions: [{ id: "S_FACE_SALLOW", confidence: 0.9 }, { id: "T_BODY_PALE", confidence: 0.8 }] }) };
  const h = harness(ALL, wrong);
  const o = await body<ObserveResponse>(await h.observe(await h.session(), "tongue", photoBody("tongue")));
  assert.deepEqual(o.reply.suggestions.map((s) => s.id), ["T_BODY_PALE"]);
  assert.deepEqual(o.dropped, ["unknown-id"]);
});

test("the provider gets the request as parsed — the photo, the features, the groups, the language, the module — and nothing else the app may have sent", async () => {
  let seen: ObserveRequest | undefined;
  const spy: Provider = { ...mockProvider, name: "spy", observe: (req) => ((seen = req), Promise.resolve({ readable: false, suggestions: [] })) };
  const h = harness(ALL, spy);
  const photo = photoBody("tongue", {}, { profile: { ageYears: 41, sex: "male" }, name: "Wang", birth: { year: 1980 }, image: { type: "image/jpeg", data: fakeJpegBase64(), gps: "25,121" } });
  assert.equal((await h.observe(await h.session(), "tongue", photo)).status, 200);
  assert.deepEqual(Object.keys(seen!).sort(), ["exclusive", "image", "lang", "module", "v", "vocabulary"]);
  assert.deepEqual(Object.keys(seen!.image).sort(), ["data", "type"]);
  assert.equal(seen!.module, "tongue");
  assert.equal(seen!.vocabulary.length, observeVocabulary("tongue").length);
  for (const word of ["Wang", "1980", "ageYears", "gps"]) assert.ok(!JSON.stringify(seen).includes(word), word);
});

test("the provider fails or is slow: an error code, a photo counted, nothing of the failure passed on", async () => {
  const failing: Provider = { ...mockProvider, name: "failing", observe: () => Promise.reject(new TypeError("upstream said: MARKER-9e2c")) };
  const h = harness(ALL, failing);
  const r = await h.observe(await h.session(), "tongue", photoBody("tongue"));
  assert.deepEqual(await errorOf(r), [502, "provider"]);
  assert.equal(h.log.at(-1)!.exception, "TypeError");
  let aborted = false;
  const slow: Provider = { ...mockProvider, name: "slow", observe: (_req, signal) => new Promise(() => signal.addEventListener("abort", () => (aborted = true))) };
  const s = harness({ ...ALL, AI_TIMEOUT_MS: "20" }, slow);
  assert.deepEqual(await errorOf(await s.observe(await s.session(), "face", photoBody("face"))), [504, "timeout"]);
  assert.ok(aborted, "the provider is told to stop");
});

test("no log line holds a photo or a word of a request: a run with a marked picture and labels, a rogue reply and a failure leaves only counts and codes", async () => {
  const MARK = "MARKER-9e2c";
  let n = 0;
  const provider: Provider = {
    ...mockProvider,
    name: "mixed",
    observe: (req) => {
      n++;
      if (n === 2) return Promise.reject(new Error(`echo ${req.image.data.slice(200, 260)} ${req.vocabulary[0]!.label}`));
      return Promise.resolve({ readable: true, suggestions: [{ id: "T_BODY_PALE", confidence: 0.9 }], [MARK]: req.image.data.slice(200, 260) });
    },
  };
  const h = harness(ALL, provider);
  const token = await h.session();
  const marked = photoBody("tongue", { fill: 0x4d }, { vocabulary: observeVocabulary("tongue").map((v, i) => (i === 0 ? { ...v, label: `${v.label} ${MARK}` } : v)) });
  const pixels = (marked["image"] as { data: string }).data.slice(200, 260);
  await h.observe(token, "tongue", marked);                              // served, with an extra field in the reply
  await h.observe(token, "tongue", marked);                              // the provider fails and echoes the request
  await h.observe(token, "tongue", photoBody("tongue", { extra: [[0xe1, `Exif\0\0${MARK}`]] }));   // refused: metadata
  await h.fetch("/v1/observe/tongue", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: `{"${MARK}": 1` });
  assert.deepEqual(h.log.map((l) => l.status), [200, 200, 502, 400, 400], "the session, a photo served, a provider that failed, metadata refused, a body that is not JSON");
  const text = JSON.stringify(h.log);
  assert.ok(!text.includes(MARK), "no marked word");
  assert.ok(!text.includes(pixels), "no part of the picture");
  assert.ok(!text.includes("data"), "no field called data");
  for (const line of h.log) for (const [key, value] of Object.entries(line)) assert.ok(typeof value === "number" || ["route", "method", "error", "exception", "module"].includes(key), `${key} holds only a count or a code`);
});

test("the turn route still refuses a photo's body, and the observe route a turn's", async () => {
  const h = harness(ALL);
  const t = await h.session();
  assert.deepEqual(await errorOf(await h.turn(t, photoBody("tongue"))), [400, "bad-request"]);
  assert.deepEqual(await errorOf(await h.observe(t, "tongue", turnBody([said("頭痛")]))), [400, "bad-request"]);
  const r = await body<TurnResponse>(await h.turn(t, turnBody([said("頭很痛")])));
  assert.equal(r.reply.proposals[0]!.id, "S_HEADACHE");
});

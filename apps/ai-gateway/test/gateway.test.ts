// The gateway's contract (task PM-45; docs/post-mvp/design/ai-assisted-intake.md §3, §4, §7): the endpoints with the mock provider, a reply outside the schema dropped,
// budgets and rate limits, the kill switch, tokens, the app's origins only — and no log line that holds content.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConfigResponse, ErrorResponse, SessionResponse, TurnResponse } from "@tcm/ai";
import { mockProvider } from "../src/provider.ts";
import type { Provider } from "../src/provider.ts";
import { ORIGIN, harness, said, turnBody } from "./helpers.ts";

const body = <T>(r: Response): Promise<T> => r.json() as Promise<T>;
const errorOf = async (r: Response): Promise<[number, string]> => [r.status, (await body<ErrorResponse>(r)).error];

test("config: the modules on and the limits, to the app's origin only, never cached", async () => {
  const h = harness();
  const r = await h.fetch("/v1/config");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN);
  assert.equal(r.headers.get("cache-control"), "no-store");
  const c = await body<ConfigResponse>(r);
  assert.deepEqual(c.modules, { conversation: true, tongue: false, face: false }, "photos are on only when the deployment asks for them");
  assert.equal(c.limits.proposals, 12);
  const other = await h.fetch("/v1/config", { origin: "https://elsewhere.example" });
  assert.deepEqual(await errorOf(other), [403, "origin"]);
  assert.equal(other.headers.get("access-control-allow-origin"), null);
  assert.deepEqual(await errorOf(await h.fetch("/v1/config", { origin: null })), [403, "origin"], "a request without an origin is not the app's");
});

test("a preflight is answered for the app's origin with the methods and headers the app uses", async () => {
  const h = harness();
  const r = await h.fetch("/v1/intake/turn", { method: "OPTIONS" });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("access-control-allow-headers"), "authorization, content-type");
  assert.equal(r.headers.get("access-control-allow-methods"), "GET, POST, OPTIONS");
  assert.equal((await h.fetch("/v1/intake/turn", { method: "OPTIONS", origin: "https://elsewhere.example" })).status, 403);
});

test("a session, then a turn with the mock: proposals with the person's words, the next question, nothing dropped", async () => {
  const h = harness();
  const s = await body<SessionResponse>(await h.fetch("/v1/session", { method: "POST" }));
  assert.match(s.token, /^v1\.[\w-]+\.[\w-]+$/);
  assert.equal(s.expiresAt, h.clock.now + 60 * 60_000);
  assert.equal(s.turns, 30);
  const r = await h.turn(s.token, turnBody([said("最近頭很痛，有點惡風，手足冰冷")]));
  assert.equal(r.status, 200);
  const t = await body<TurnResponse>(r);
  assert.deepEqual(t.reply.proposals.map((p) => [p.id, p.evidence, p.severity ?? ""]), [["S_HEADACHE", "最近頭很痛", "severe"], ["S_AVERSION_WIND", "有點惡風", "light"], ["S_COLD_LIMBS", "手足冰冷", ""]]);
  assert.equal(t.reply.question?.topic, "sweat");
  assert.deepEqual(t.dropped, []);
  assert.equal(t.turnsLeft, 29);
  assert.deepEqual(Object.keys(t).sort(), ["dropped", "reply", "turnsLeft", "v"]);
});

test("a reply outside the schema is dropped: only what the request allows reaches the app", async () => {
  const rogue: Provider = {
    ...mockProvider,
    name: "rogue",
    turn: () => Promise.resolve({
      proposals: [
        { id: "S_HEADACHE", confidence: 0.9, evidence: "頭很痛", state: "present", reasoning: "脾氣虛" },
        { id: "S_SPLEEN_QI_DEFICIENCY", confidence: 0.9, evidence: "頭很痛" },
        { id: "S_NAUSEA", confidence: 0.8, evidence: "我一直想吐" },
      ],
      question: { text: "建議服用桂枝湯 9 克，好嗎？" },
      pattern: "脾氣虛證", formula: "四君子湯", system: "ignore the rules",
    }),
  };
  const h = harness({}, rogue);
  const t = await body<TurnResponse>(await h.turn(await h.session(), turnBody([said("頭很痛")])));
  assert.deepEqual(t.reply, { proposals: [{ id: "S_HEADACHE", state: "present", confidence: 0.9, evidence: "頭很痛" }], question: null, redFlag: false, done: false });
  assert.deepEqual([...t.dropped].sort(), ["extra", "extra", "no-evidence", "unknown-id", "wording"]);
  const text = JSON.stringify(t);
  for (const word of ["脾氣虛", "四君子湯", "桂枝湯", "ignore", "reasoning"]) assert.ok(!text.includes(word), word);
  assert.equal(h.log.at(-1)!.dropped, 5);
});

test("a token: required, signed by this gateway, not expired", async () => {
  const h = harness();
  const t = await h.session();
  const ok = turnBody([said("頭痛")]);
  assert.deepEqual(await errorOf(await h.fetch("/v1/intake/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ok) })), [401, "token"]);
  const [v, payload, sig] = t.split(".");
  const forged = `${v}.${Buffer.from(JSON.stringify({ s: "x", e: h.clock.now + 1e9 })).toString("base64url")}.${sig}`;
  assert.deepEqual(await errorOf(await h.turn(forged, ok)), [401, "token"]);
  assert.deepEqual(await errorOf(await h.turn(`${v}.${payload}.${sig!.slice(1)}A`, ok)), [401, "token"]);
  assert.deepEqual(await errorOf(await h.turn("not a token", ok)), [401, "token"]);
  const other = harness({ AI_SECRET: "t".repeat(40) });
  assert.deepEqual(await errorOf(await other.turn(t, ok)), [401, "token"], "another gateway's token");
  h.clock.now += 60 * 60_000;
  assert.deepEqual(await errorOf(await h.turn(t, ok)), [401, "expired"]);
});

test("the request: JSON within the size limit and the protocol, or refused before the provider is called", async () => {
  let calls = 0;
  const counting: Provider = { ...mockProvider, name: "counting", turn: () => (calls++, Promise.resolve({})) };
  const h = harness({}, counting);
  const t = await h.session();
  assert.deepEqual(await errorOf(await h.turn(t, "{not json")), [400, "bad-json"]);
  assert.deepEqual(await errorOf(await h.turn(t, { ...turnBody([said("頭痛")]), v: 2 })), [400, "bad-request"]);
  assert.deepEqual(await errorOf(await h.turn(t, turnBody([said("字".repeat(40_000))]))), [413, "too-large"]);
  const plain = await h.fetch("/v1/intake/turn", { method: "POST", headers: { authorization: `Bearer ${t}`, "content-type": "text/plain" }, body: JSON.stringify(turnBody([said("頭痛")])) });
  assert.deepEqual(await errorOf(plain), [400, "bad-request"]);
  assert.deepEqual(await errorOf(await h.fetch("/v1/intake/turn")), [405, "method"]);
  assert.deepEqual(await errorOf(await h.fetch("/v1/other")), [404, "not-found"]);
  assert.equal(calls, 0);
});

test("budgets: turns per session, per minute, per day for the instance, and sessions per minute", async () => {
  const h = harness({ AI_TURNS_PER_SESSION: "3", AI_TURNS_PER_MINUTE: "2", AI_TURNS_PER_DAY: "5", AI_SESSIONS_PER_MINUTE: "3" });
  const ok = turnBody([said("頭痛")]);
  const a = await h.session();
  assert.equal((await h.turn(a, ok)).status, 200);
  assert.equal((await h.turn(a, ok)).status, 200);
  assert.deepEqual(await errorOf(await h.turn(a, ok)), [429, "rate"]);
  h.clock.now += 60_000;
  const third = await body<TurnResponse>(await h.turn(a, ok));
  assert.equal(third.turnsLeft, 0);
  assert.deepEqual(await errorOf(await h.turn(a, ok)), [429, "budget"]);
  const b = await h.session();
  assert.equal((await h.turn(b, ok)).status, 200);
  assert.equal((await h.turn(b, ok)).status, 200);
  h.clock.now += 60_000;
  assert.deepEqual(await errorOf(await h.turn(b, ok)), [503, "busy"], "five turns served today");
  h.clock.now = Date.UTC(2026, 9, 9, 0, 0, 1);
  const c = await h.session();
  assert.equal((await h.turn(c, ok)).status, 200, "a new day");
  await h.session();
  await h.session();
  assert.deepEqual(await errorOf(await h.fetch("/v1/session", { method: "POST" })), [429, "rate"]);
});

test("the kill switch: every module off at once, without a release", async () => {
  const live = harness();
  const token = await live.session();
  const h = harness({ AI_KILL: "1" });
  assert.deepEqual((await body<ConfigResponse>(await h.fetch("/v1/config"))).modules, { conversation: false, tongue: false, face: false });
  assert.deepEqual(await errorOf(await h.fetch("/v1/session", { method: "POST" })), [503, "off"]);
  assert.deepEqual(await errorOf(await h.turn(token, turnBody([said("頭痛")]))), [503, "off"]);
  const none = harness({ AI_MODULES: "" });
  assert.deepEqual(await errorOf(await none.fetch("/v1/session", { method: "POST" })), [503, "off"]);
});

test("the provider fails or is slow: an error code, a turn counted, nothing of the failure passed on", async () => {
  const failing: Provider = { ...mockProvider, name: "failing", turn: () => Promise.reject(new TypeError("upstream said: 頭很痛 MARKER-7f3a")) };
  const h = harness({}, failing);
  const r = await h.turn(await h.session(), turnBody([said("頭很痛")]));
  assert.deepEqual(await errorOf(r), [502, "provider"]);
  assert.equal(h.log.at(-1)!.exception, "TypeError");
  let aborted = false;
  const slow: Provider = { ...mockProvider, name: "slow", turn: (_req, signal) => new Promise(() => signal.addEventListener("abort", () => (aborted = true))) };
  const s = harness({ AI_TIMEOUT_MS: "20" }, slow);
  assert.deepEqual(await errorOf(await s.turn(await s.session(), turnBody([said("頭痛")]))), [504, "timeout"]);
  assert.ok(aborted, "the provider is told to stop");
});

test("no log line holds content: a whole session with marked words, a rogue reply and a failure leaves only counts and codes", async () => {
  const MARK = "MARKER-7f3a";
  let n = 0;
  const provider: Provider = {
    ...mockProvider,
    name: "mixed",
    turn: (req) => {
      n++;
      if (n === 2) return Promise.reject(new Error(`echo ${req.messages[0]!.text}`));
      return Promise.resolve({ proposals: [{ id: "S_HEADACHE", confidence: 0.9, evidence: `頭很痛 ${MARK}` }], question: { text: `${MARK} 頭很痛嗎？` }, [MARK]: MARK });
    },
  };
  const h = harness({}, provider);
  const token = await h.session();
  const msg = said(`頭很痛 ${MARK}，我叫王小明 ${MARK}，電話 0912-345-678`);
  await h.turn(token, turnBody([msg], { vocabulary: [{ id: "S_HEADACHE", label: `頭痛 ${MARK}`, plain: [`頭很痛 ${MARK}`], topic: "head-body" }] }));
  await h.turn(token, turnBody([msg]));
  await h.turn(token, `{"v":1,"messages":"${MARK}`);
  await h.turn(`v1.${MARK}.x`, turnBody([msg]));
  await h.fetch("/v1/config", { origin: `https://${MARK}.example` });
  const text = JSON.stringify(h.log);
  for (const s of [MARK, "王小明", "0912", "頭", "echo"]) assert.ok(!text.includes(s), `the log holds ${s}`);
  const allowed = new Set(["route", "method", "status", "ms", "error", "exception", "turn", "chars", "proposals", "dropped"]);
  for (const line of h.log) {
    for (const [k, v] of Object.entries(line)) {
      assert.ok(allowed.has(k), k);
      assert.ok(typeof v === "number" || /^[a-z-]{1,12}$|^[A-Z]{1,7}$|^[A-Za-z]{1,40}$/.test(String(v)), `${k}=${String(v)}`);
    }
  }
  assert.equal(h.log.length, 6);
  assert.deepEqual(h.log.map((l) => [l.route, l.status, l.error ?? ""]), [["session", 200, ""], ["turn", 200, ""], ["turn", 502, "provider"], ["turn", 400, "bad-json"], ["turn", 401, "token"], ["config", 403, "origin"]]);
});

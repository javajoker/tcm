// The gateway on Node, over real HTTP: the server the end-to-end tests start (`node src/node.ts --dev`).
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import type { ObserveResponse, SessionResponse, TurnResponse } from "@tcm/ai";
import { configFrom } from "../src/config.ts";
import { createGateway } from "../src/gateway.ts";
import type { LogLine } from "../src/gateway.ts";
import { devEnv, serve } from "../src/node.ts";
import { mockProvider } from "../src/provider.ts";
import { photoBody, said, turnBody } from "./helpers.ts";

const log: LogLine[] = [];
const config = configFrom(devEnv({}));
const server = await serve(createGateway({ config, provider: mockProvider, now: () => Date.now(), log: (l) => void log.push(l) }), 0, Math.max(config.limits.bodyBytes, config.limits.observeBodyBytes));
after(() => server.close());
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const origin = "http://localhost:5173";

test("config, a session and a turn over HTTP, from the dev server's origin", async () => {
  const pre = await fetch(`${base}/v1/intake/turn`, { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST" } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), origin);
  const s = (await (await fetch(`${base}/v1/session`, { method: "POST", headers: { origin } })).json()) as SessionResponse;
  const r = await fetch(`${base}/v1/intake/turn`, { method: "POST", headers: { origin, authorization: `Bearer ${s.token}`, "content-type": "application/json" }, body: JSON.stringify(turnBody([said("頭很痛")])) });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(((await r.json()) as TurnResponse).reply.proposals.map((p) => p.id), ["S_HEADACHE"]);
  assert.deepEqual(log.map((l) => [l.route, l.method, l.status]), [["turn", "OPTIONS", 204], ["session", "POST", 200], ["turn", "POST", 200]]);
});

test("a body larger than the limit is refused: by its declared length, or as it arrives when no length is declared", async () => {
  const s = (await (await fetch(`${base}/v1/session`, { method: "POST", headers: { origin } })).json()) as SessionResponse;
  const headers = { origin, authorization: `Bearer ${s.token}`, "content-type": "application/json" };
  assert.equal((await fetch(`${base}/v1/intake/turn`, { method: "POST", headers, body: "x".repeat(200_000) })).status, 413);
  const chunk = new TextEncoder().encode("x".repeat(16_384));
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(c) { if (sent++ < 12) c.enqueue(chunk); else c.close(); } });
  const r = await fetch(`${base}/v1/intake/turn`, { method: "POST", headers, body: stream, duplex: "half" } as RequestInit);
  assert.equal(r.status, 413);
  assert.equal(r.headers.get("access-control-allow-origin"), origin, "the browser can read the refusal");
});

test("a photo over HTTP: far more than a turn may hold, within the observation limit; beyond it, refused with the headers the browser needs", async () => {
  const s = (await (await fetch(`${base}/v1/session`, { method: "POST", headers: { origin } })).json()) as SessionResponse;
  const headers = { origin, authorization: `Bearer ${s.token}`, "content-type": "application/json" };
  const photo = photoBody("tongue", { size: 400_000 });
  assert.ok(JSON.stringify(photo).length > 500_000);
  const ok = await fetch(`${base}/v1/observe/tongue`, { method: "POST", headers, body: JSON.stringify(photo) });
  assert.equal(ok.status, 200);
  assert.deepEqual(((await ok.json()) as ObserveResponse).reply.suggestions.map((x) => x.id), ["T_BODY_PALE_SWOLLEN", "T_TOOTHMARK_EDGE", "T_COAT_WHITE_GREASY"]);
  const huge = await fetch(`${base}/v1/observe/face`, { method: "POST", headers, body: "x".repeat(900_000) });
  assert.equal(huge.status, 413);
  assert.equal(huge.headers.get("access-control-allow-origin"), origin);
});

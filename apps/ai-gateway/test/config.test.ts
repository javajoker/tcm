// A gateway configured wrongly refuses to start; the defaults are the design's.
import assert from "node:assert/strict";
import { test } from "node:test";
import { configFrom } from "../src/config.ts";
import { devEnv } from "../src/node.ts";
import { ENV } from "./helpers.ts";

test("the defaults: the conversation on, the mock provider, the budgets of the design", () => {
  const c = configFrom(ENV);
  assert.deepEqual(c.modules, { conversation: true, tongue: false, face: false });
  assert.equal(c.killed, false);
  assert.equal(c.provider, "mock");
  assert.deepEqual([c.sessionMinutes, c.turnsPerSession, c.turnsPerMinute, c.turnsPerDay, c.sessionsPerMinute, c.timeoutMs], [60, 30, 10, 2000, 60, 20_000]);
  assert.equal(configFrom({ ...ENV, AI_KILL: "true" }).killed, true);
});

test("refused: no secret or a short one, no origin or a malformed one, a module that is not built, another provider, a number out of range", () => {
  const bad: [Record<string, string | undefined>, RegExp][] = [
    [{ AI_SECRET: undefined }, /AI_SECRET/],
    [{ AI_SECRET: "short" }, /AI_SECRET/],
    [{ AI_ALLOWED_ORIGINS: "" }, /AI_ALLOWED_ORIGINS/],
    [{ AI_ALLOWED_ORIGINS: "https://app.example/path" }, /not an origin/],
    [{ AI_ALLOWED_ORIGINS: "app.example" }, /not an origin/],
    [{ AI_ALLOWED_ORIGINS: "ftp://app.example" }, /not an origin/],
    [{ AI_MODULES: "conversation,tongue" }, /not built/],
    [{ AI_MODULES: "voice" }, /not a module/],
    [{ AI_PROVIDER: "anthropic" }, /PM-49/],
    [{ AI_TURNS_PER_SESSION: "0" }, /AI_TURNS_PER_SESSION/],
    [{ AI_TIMEOUT_MS: "1.5" }, /AI_TIMEOUT_MS/],
  ];
  for (const [env, message] of bad) assert.throws(() => configFrom({ ...ENV, ...env }), message, JSON.stringify(env));
});

test("the development defaults: a random secret each run, the local origins, the mock — and the environment still wins", () => {
  const a = configFrom(devEnv({}));
  const b = configFrom(devEnv({}));
  assert.notEqual(a.secret, b.secret);
  assert.ok(a.origins.includes("http://localhost:5173") && a.origins.includes("http://127.0.0.1:4174"));
  assert.equal(configFrom(devEnv({ AI_KILL: "1" })).killed, true);
});

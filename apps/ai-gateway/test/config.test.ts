// A gateway configured wrongly refuses to start; the defaults are the design's.
import assert from "node:assert/strict";
import { test } from "node:test";
import { configFrom } from "../src/config.ts";
import { devEnv } from "../src/node.ts";
import { ENV } from "./helpers.ts";

const KEY = "sk-ant-test-0123456789abcdefghij";

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
    [{ AI_PROVIDER: "openai" }, /is not a provider/],
    [{ AI_PROVIDER: "anthropic" }, /ANTHROPIC_API_KEY/],
    [{ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "short" }, /ANTHROPIC_API_KEY/],
    [{ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: KEY, AI_MODEL: "not a model!" }, /AI_MODEL/],
    [{ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: "http://api.example" }, /https origin/],
    [{ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: "https://api.example/v1" }, /https origin/],
    [{ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: KEY, AI_MAX_TOKENS: "100000" }, /AI_MAX_TOKENS/],
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

test("the Anthropic provider: a key, the default model, a bounded answer, caching off; and the key stays out of what is printed of the configuration", () => {
  const c = configFrom({ ...ENV, AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: KEY });
  assert.equal(c.provider, "anthropic");
  assert.deepEqual(c.anthropic, { apiKey: KEY, model: "claude-sonnet-5-5", baseUrl: "https://api.anthropic.com", maxTokens: 1024, promptCache: false });
  const custom = configFrom({ ...ENV, AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: KEY, AI_MODEL: "claude-haiku-4-5-20251001", AI_MAX_TOKENS: "2048", AI_PROMPT_CACHE: "true", ANTHROPIC_BASE_URL: "http://127.0.0.1:9999" });
  assert.deepEqual(custom.anthropic, { apiKey: KEY, model: "claude-haiku-4-5-20251001", baseUrl: "http://127.0.0.1:9999", maxTokens: 2048, promptCache: true });
  assert.equal(configFrom(ENV).anthropic, undefined, "the mock has no key");
  assert.equal(configFrom({ ...ENV, ANTHROPIC_API_KEY: KEY }).anthropic, undefined, "a key alone does not switch the provider");
});

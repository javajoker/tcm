// The gateway's configuration, from its environment (a Worker's variables and secrets, or the process environment on Node). A gateway that is configured wrongly refuses to
// start: a missing or short secret, an origin that is not one, a module that is not built, a number out of range.
//   AI_SECRET               the key that signs session tokens (at least 32 characters; a secret of the host)
//   AI_ALLOWED_ORIGINS      the app's origins, comma-separated (https://app.example); a request from any other origin is refused
//   AI_MODULES              the modules on, comma-separated (default: conversation; tongue and face look at a photo — development builds only, decision PD-25)
//   AI_KILL                 "1" or "true" turns every module off at once — the kill switch, without a release
//   AI_PROVIDER             mock (the default; no key) or anthropic (the adapter of src/anthropic.ts; needs ANTHROPIC_API_KEY)
//   ANTHROPIC_API_KEY       the provider's key (a secret of the host; only with AI_PROVIDER=anthropic)
//   AI_MODEL                the model (claude-sonnet-5-5)
//   AI_MAX_TOKENS           the most the model may write in one turn (1024)
//   AI_PROMPT_CACHE         "1" or "true" lets the provider keep a copy of the unchanging prefix for a few minutes (off: check it against the zero-retention terms first)
//   ANTHROPIC_BASE_URL      the provider's origin (https://api.anthropic.com); a local one only for tests
//   AI_SESSION_MINUTES      how long a session token lives (60)
//   AI_TURNS_PER_SESSION    turns a session may take (30)
//   AI_TURNS_PER_MINUTE     turns a session may take in one minute (10)
//   AI_TURNS_PER_DAY        turns one instance serves in a day, all sessions together (2000)
//   AI_PHOTOS_PER_SESSION   photos a session may send (6)
//   AI_PHOTOS_PER_MINUTE    photos a session may send in one minute (3)
//   AI_PHOTOS_PER_DAY       photos one instance serves in a day, all sessions together (300)
//   AI_SESSIONS_PER_MINUTE  sessions one instance starts in a minute (60)
//   AI_TIMEOUT_MS           how long the provider has for a reply (20000)
import { BUILT_MODULES, LIMITS, MODULES } from "@tcm/ai";
import type { Limits, Module } from "@tcm/ai";

export type Env = Readonly<Record<string, string | undefined>>;
export type ProviderName = "mock" | "anthropic";

/** What the Anthropic adapter needs (src/anthropic.ts). The key is a secret: it is in no log line, no error and no response. */
export interface AnthropicConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly maxTokens: number;
  readonly promptCache: boolean;
}

export interface GatewayConfig {
  readonly secret: string;
  readonly origins: readonly string[];
  readonly modules: Readonly<Record<Module, boolean>>;
  readonly killed: boolean;
  readonly provider: ProviderName;
  /** Present exactly when `provider` is `anthropic`. */
  readonly anthropic?: AnthropicConfig;
  readonly sessionMinutes: number;
  readonly turnsPerSession: number;
  readonly turnsPerMinute: number;
  readonly turnsPerDay: number;
  readonly photosPerSession: number;
  readonly photosPerMinute: number;
  readonly photosPerDay: number;
  readonly sessionsPerMinute: number;
  readonly timeoutMs: number;
  readonly limits: Limits;
}

const list = (v: string | undefined): string[] => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function int(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be a whole number from ${min} to ${max}`);
  return n;
}

function anthropicFrom(env: Env): AnthropicConfig {
  const apiKey = env["ANTHROPIC_API_KEY"] ?? "";
  if (apiKey.length < 20 || /\s/.test(apiKey)) throw new Error("ANTHROPIC_API_KEY must be set (a secret of the host; AI_PROVIDER=anthropic)");
  const model = env["AI_MODEL"] ?? "claude-sonnet-5-5";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(model)) throw new Error("AI_MODEL is not a model name");
  const baseUrl = env["ANTHROPIC_BASE_URL"] ?? "https://api.anthropic.com";
  let url: URL | undefined;
  try { url = new URL(baseUrl); } catch { url = undefined; }
  const local = url !== undefined && url.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
  if (url === undefined || url.origin !== baseUrl || !(url.protocol === "https:" || local)) throw new Error("ANTHROPIC_BASE_URL must be an https origin (a local http one only for tests)");
  return { apiKey, model, baseUrl, maxTokens: int(env, "AI_MAX_TOKENS", 1024, 256, 4096), promptCache: /^(1|true)$/i.test(env["AI_PROMPT_CACHE"] ?? "") };
}

export function configFrom(env: Env): GatewayConfig {
  const secret = env["AI_SECRET"] ?? "";
  if (secret.length < 32) throw new Error("AI_SECRET must be set, at least 32 characters");
  const origins = list(env["AI_ALLOWED_ORIGINS"]);
  if (origins.length === 0) throw new Error("AI_ALLOWED_ORIGINS must name the app's origin");
  for (const o of origins) {
    let url: URL | undefined;
    try { url = new URL(o); } catch { url = undefined; }
    if (url === undefined || url.origin !== o || !/^https?:$/.test(url.protocol)) throw new Error(`AI_ALLOWED_ORIGINS: ${o} is not an origin (scheme://host[:port])`);
  }
  const wanted = env["AI_MODULES"] === undefined ? ["conversation"] : list(env["AI_MODULES"]);
  for (const m of wanted) {
    if (!MODULES.includes(m as Module)) throw new Error(`AI_MODULES: ${m} is not a module`);
    if (!BUILT_MODULES.includes(m as Module)) throw new Error(`AI_MODULES: ${m} is not built`);
  }
  const provider = env["AI_PROVIDER"] ?? "mock";
  if (provider !== "mock" && provider !== "anthropic") throw new Error(`AI_PROVIDER: ${provider} is not a provider (mock or anthropic)`);
  const anthropic = provider === "anthropic" ? anthropicFrom(env) : undefined;
  return {
    secret,
    origins,
    modules: { conversation: wanted.includes("conversation"), tongue: wanted.includes("tongue"), face: wanted.includes("face") },
    killed: /^(1|true)$/i.test(env["AI_KILL"] ?? ""),
    provider,
    ...(anthropic !== undefined ? { anthropic } : {}),
    sessionMinutes: int(env, "AI_SESSION_MINUTES", 60, 5, 24 * 60),
    turnsPerSession: int(env, "AI_TURNS_PER_SESSION", 30, 1, 200),
    turnsPerMinute: int(env, "AI_TURNS_PER_MINUTE", 10, 1, 120),
    turnsPerDay: int(env, "AI_TURNS_PER_DAY", 2000, 1, 1_000_000),
    photosPerSession: int(env, "AI_PHOTOS_PER_SESSION", 6, 1, 50),
    photosPerMinute: int(env, "AI_PHOTOS_PER_MINUTE", 3, 1, 30),
    photosPerDay: int(env, "AI_PHOTOS_PER_DAY", 300, 1, 100_000),
    sessionsPerMinute: int(env, "AI_SESSIONS_PER_MINUTE", 60, 1, 10_000),
    timeoutMs: int(env, "AI_TIMEOUT_MS", 20_000, 10, 120_000),
    limits: LIMITS,
  };
}

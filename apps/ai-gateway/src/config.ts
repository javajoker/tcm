// The gateway's configuration, from its environment (a Worker's variables and secrets, or the process environment on Node). A gateway that is configured wrongly refuses to
// start: a missing or short secret, an origin that is not one, a module that is not built, a number out of range.
//   AI_SECRET               the key that signs session tokens (at least 32 characters; a secret of the host)
//   AI_ALLOWED_ORIGINS      the app's origins, comma-separated (https://app.example); a request from any other origin is refused
//   AI_MODULES              the modules on, comma-separated (default: conversation)
//   AI_KILL                 "1" or "true" turns every module off at once — the kill switch, without a release
//   AI_PROVIDER             mock (the default; no key) — the provider adapter is task PM-49
//   AI_SESSION_MINUTES      how long a session token lives (60)
//   AI_TURNS_PER_SESSION    turns a session may take (30)
//   AI_TURNS_PER_MINUTE     turns a session may take in one minute (10)
//   AI_TURNS_PER_DAY        turns one instance serves in a day, all sessions together (2000)
//   AI_SESSIONS_PER_MINUTE  sessions one instance starts in a minute (60)
//   AI_TIMEOUT_MS           how long the provider has for a reply (20000)
import { BUILT_MODULES, LIMITS, MODULES } from "@tcm/ai";
import type { Limits, Module } from "@tcm/ai";

export type Env = Readonly<Record<string, string | undefined>>;
export type ProviderName = "mock";

export interface GatewayConfig {
  readonly secret: string;
  readonly origins: readonly string[];
  readonly modules: Readonly<Record<Module, boolean>>;
  readonly killed: boolean;
  readonly provider: ProviderName;
  readonly sessionMinutes: number;
  readonly turnsPerSession: number;
  readonly turnsPerMinute: number;
  readonly turnsPerDay: number;
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
    if (!BUILT_MODULES.includes(m as Module)) throw new Error(`AI_MODULES: ${m} is not built (decision PD-25, task PM-50)`);
  }
  const provider = env["AI_PROVIDER"] ?? "mock";
  if (provider !== "mock") throw new Error(`AI_PROVIDER: ${provider} is not available (the provider adapter is task PM-49)`);
  return {
    secret,
    origins,
    modules: { conversation: wanted.includes("conversation"), tongue: false, face: false },
    killed: /^(1|true)$/i.test(env["AI_KILL"] ?? ""),
    provider,
    sessionMinutes: int(env, "AI_SESSION_MINUTES", 60, 5, 24 * 60),
    turnsPerSession: int(env, "AI_TURNS_PER_SESSION", 30, 1, 200),
    turnsPerMinute: int(env, "AI_TURNS_PER_MINUTE", 10, 1, 120),
    turnsPerDay: int(env, "AI_TURNS_PER_DAY", 2000, 1, 1_000_000),
    sessionsPerMinute: int(env, "AI_SESSIONS_PER_MINUTE", 60, 1, 10_000),
    timeoutMs: int(env, "AI_TIMEOUT_MS", 20_000, 10, 120_000),
    limits: LIMITS,
  };
}

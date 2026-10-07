// A gateway under test: an injected clock, a captured log, the mock provider or a fake one, the app's own vocabulary from the knowledge base's data files.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Lang, Message, TurnRequest, VocabItem } from "@tcm/ai";
import { configFrom } from "../src/config.ts";
import type { Env, GatewayConfig } from "../src/config.ts";
import { createGateway } from "../src/gateway.ts";
import type { LogLine } from "../src/gateway.ts";
import { mockProvider } from "../src/provider.ts";
import type { Provider } from "../src/provider.ts";

export const ORIGIN = "https://app.example";
export const BASE = "https://gateway.example";
export const ENV: Env = { AI_SECRET: "s".repeat(40), AI_ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173` };

const root = join(import.meta.dirname, "..", "..", "..");
interface Symptom { readonly id: string; readonly kind: string; readonly dimension: string; readonly "zh-Hant": string; readonly en: string }
const symptoms = (JSON.parse(readFileSync(join(root, "data/diagnosis/symptoms.json"), "utf8")) as { items: Symptom[] }).items.filter((s) => s.kind === "symptom");

export const vocabulary = (lang: Lang = "zh-Hant"): VocabItem[] => symptoms.map((s) => ({ id: s.id, label: lang === "en" ? s.en : s["zh-Hant"], topic: s.dimension }));
export const said = (text: string): Message => ({ role: "person", text });
export const turnBody = (messages: readonly Message[], extra: Partial<TurnRequest> = {}): TurnRequest => ({ v: 1, lang: "zh-Hant", messages, vocabulary: vocabulary(), confirmed: [], ...extra });

export interface Harness {
  readonly fetch: (path: string, init?: RequestInit & { origin?: string | null }) => Promise<Response>;
  readonly log: LogLine[];
  readonly clock: { now: number };
  readonly config: GatewayConfig;
  session(): Promise<string>;
  turn(token: string, body: unknown): Promise<Response>;
}

export function harness(env: Env = {}, provider: Provider = mockProvider): Harness {
  const config = configFrom({ ...ENV, ...env });
  const log: LogLine[] = [];
  const clock = { now: Date.UTC(2026, 9, 8, 9, 0, 0) };
  const gateway = createGateway({ config, provider, now: () => clock.now, log: (l) => void log.push(l) });
  const fetch = (path: string, init: RequestInit & { origin?: string | null } = {}): Promise<Response> => {
    const { origin = ORIGIN, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (origin !== null) headers.set("origin", origin);
    return gateway(new Request(`${BASE}${path}`, { ...rest, headers }));
  };
  return {
    fetch,
    log,
    clock,
    config,
    async session() {
      const r = await fetch("/v1/session", { method: "POST" });
      return ((await r.json()) as { token: string }).token;
    },
    turn: (token, body) => fetch("/v1/intake/turn", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }),
  };
}

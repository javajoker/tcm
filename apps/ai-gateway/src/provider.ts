// The provider behind the gateway (docs/post-mvp/design/ai-assisted-intake.md §3): one interface, the mock and Anthropic's API (src/anthropic.ts, task PM-49). What a provider returns
// is not trusted — the gateway validates it against the request (validateReply) before anything reaches the app.
import type { TurnRequest } from "@tcm/ai";
import { mockTurn } from "@tcm/ai/mock";
import { anthropicProvider } from "./anthropic.ts";
import type { GatewayConfig } from "./config.ts";

export interface Provider {
  readonly name: string;
  /** The raw reply to one turn. It may throw; it should stop when `signal` aborts. */
  turn(request: TurnRequest, signal: AbortSignal): Promise<unknown>;
}

export const mockProvider: Provider = {
  name: "mock",
  turn: (request) => Promise.resolve(mockTurn(request)),
};

/** The provider the configuration names; `fetch` is injected for tests. */
export function providerFor(config: GatewayConfig, fetchImpl?: typeof fetch): Provider {
  switch (config.provider) {
    case "mock":
      return mockProvider;
    case "anthropic":
      return anthropicProvider({ ...config.anthropic!, ...(fetchImpl ? { fetch: fetchImpl } : {}) });
  }
}

// The provider behind the gateway (docs/post-mvp/design/ai-assisted-intake.md §3): one interface, the mock first. What a provider returns is not trusted — the gateway
// validates it against the request (validateReply) before anything reaches the app. The adapter for Anthropic's API is task PM-49.
import type { TurnRequest } from "@tcm/ai";
import { mockTurn } from "@tcm/ai/mock";
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

export function providerFor(config: GatewayConfig): Provider {
  switch (config.provider) {
    case "mock":
      return mockProvider;
  }
}

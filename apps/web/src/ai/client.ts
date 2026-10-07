// The app's side of the gateway (docs/post-mvp/design/ai-assisted-intake.md §3). Nothing here runs before the person has consented: the callers ask `consentOf` first, and a scenario
// checks that no request leaves before (e2e E38). No cookies, no referrer, no cache.
import { PROTOCOL } from "@tcm/ai";
import type { ConfigResponse, Module } from "@tcm/ai";

export type ServiceState = { readonly kind: "on"; readonly config: ConfigResponse } | { readonly kind: "off" } | { readonly kind: "unreachable" };

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export const requestInit = (init: RequestInit = {}): RequestInit => ({ ...init, mode: "cors", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });

/** Whether the gateway serves `module` now: its kill switch and module switches decide, without a release. */
export async function serviceState(endpoint: string, module: Module, signal?: AbortSignal): Promise<ServiceState> {
  let body: unknown;
  try {
    const r = await fetch(`${endpoint}/v1/config`, requestInit(signal ? { signal } : {}));
    if (!r.ok) return { kind: "unreachable" };
    body = await r.json();
  } catch {
    return { kind: "unreachable" };
  }
  if (!isRecord(body) || body["v"] !== PROTOCOL || !isRecord(body["modules"]) || !isRecord(body["limits"])) return { kind: "unreachable" };
  const config = body as unknown as ConfigResponse;
  return config.modules[module] === true ? { kind: "on", config } : { kind: "off" };
}

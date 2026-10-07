// The app's side of the gateway (docs/post-mvp/design/ai-assisted-intake.md §3). Nothing here runs before the person has consented: the callers ask `consentOf` first, and a scenario
// checks that no request leaves before (e2e E38). No cookies, no referrer, no cache.
import { PROTOCOL } from "@tcm/ai";
import type { ConfigResponse, ErrorCode, Module, SessionResponse, TurnRequest, TurnResponse } from "@tcm/ai";

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

export type Failure = ErrorCode | "unreachable";
export type Result<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: Failure };

async function call<T>(url: string, init: RequestInit, valid: (x: unknown) => x is T): Promise<Result<T>> {
  let r: Response;
  try { r = await fetch(url, requestInit(init)); } catch { return { ok: false, error: "unreachable" }; }
  let body: unknown;
  try { body = await r.json(); } catch { return { ok: false, error: "unreachable" }; }
  if (!r.ok) return { ok: false, error: isRecord(body) && typeof body["error"] === "string" ? (body["error"] as ErrorCode) : "unreachable" };
  return valid(body) ? { ok: true, value: body } : { ok: false, error: "unreachable" };
}

const isSession = (x: unknown): x is SessionResponse => isRecord(x) && x["v"] === PROTOCOL && typeof x["token"] === "string" && typeof x["expiresAt"] === "number";
const isTurn = (x: unknown): x is TurnResponse => isRecord(x) && x["v"] === PROTOCOL && isRecord(x["reply"]) && Array.isArray(x["dropped"]);

/** A session token for the conversation: no account, nothing about the person. */
export const startSession = (endpoint: string, signal?: AbortSignal): Promise<Result<SessionResponse>> =>
  call(`${endpoint}/v1/session`, { method: "POST", ...(signal ? { signal } : {}) }, isSession);

/** One turn. The request comes from `buildTurnRequest` only (request.ts). */
export const sendTurn = (endpoint: string, token: string, request: TurnRequest, signal?: AbortSignal): Promise<Result<TurnResponse>> =>
  call(`${endpoint}/v1/intake/turn`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(request), ...(signal ? { signal } : {}) }, isTurn);

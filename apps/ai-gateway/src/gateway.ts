// The AI help gateway (Release F; docs/post-mvp/design/ai-assisted-intake.md §3, §4, §7; docs/post-mvp/privacy/ai-help-dpia.md): one fetch-style handler, the same on Node
// and in a Worker.
//   GET  /v1/config        the modules on (all off when the kill switch is set) and the limits
//   POST /v1/session       a session token: a random id and an expiry, signed; no account
//   POST /v1/intake/turn   one turn of the conversation: the request checked, the session's budget and rate, the provider, the reply validated
// Only the app's origins are served. Nothing is stored. A log line holds the route, the status, the time taken and counts — never a request's or a reply's content
// (docs/privacy.md §6 rule 7): `LogLine` has no field that could hold text, and an exception is logged by its class name only.
import { PROTOCOL, parseTurnRequest, validateReply } from "@tcm/ai";
import type { ConfigResponse, ErrorCode, SessionResponse, TurnResponse } from "@tcm/ai";
import type { GatewayConfig } from "./config.ts";
import { Meter } from "./meter.ts";
import type { Provider } from "./provider.ts";
import { hmacKey, issueToken, newSessionId, readToken } from "./token.ts";

export type Route = "config" | "session" | "turn" | "unknown";

/** One line per request: counts and codes, nothing a person wrote. */
export interface LogLine {
  readonly route: Route;
  readonly method: "GET" | "POST" | "OPTIONS" | "other";
  readonly status: number;
  readonly ms: number;
  readonly error?: ErrorCode;
  /** The class of an unexpected exception (TypeError …), never its message. */
  readonly exception?: string;
  /** The turn's number in its session. */
  readonly turn?: number;
  /** Characters the person wrote in the conversation so far. */
  readonly chars?: number;
  readonly proposals?: number;
  readonly dropped?: number;
}

type Draft = { -readonly [K in keyof LogLine]?: LogLine[K] };

export interface GatewayDeps {
  readonly config: GatewayConfig;
  readonly provider: Provider;
  readonly now: () => number;
  readonly log: (line: LogLine) => void;
}

const ROUTES: Readonly<Record<string, { readonly route: Route; readonly method: "GET" | "POST" }>> = {
  "/v1/config": { route: "config", method: "GET" },
  "/v1/session": { route: "session", method: "POST" },
  "/v1/intake/turn": { route: "turn", method: "POST" },
};

const STATUS: Readonly<Record<ErrorCode, number>> = {
  off: 503, origin: 403, method: 405, "not-found": 404, "too-large": 413, "bad-json": 400, "bad-request": 400, token: 401, expired: 401, budget: 429, rate: 429, busy: 503, provider: 502, timeout: 504, internal: 500,
};

class Timeout extends Error {
  override readonly name = "Timeout";
}

const methodOf = (m: string): LogLine["method"] => (m === "GET" || m === "POST" || m === "OPTIONS" ? m : "other");
const exceptionName = (e: unknown): string => {
  const name = e instanceof Error ? e.name : "unknown";
  return /^[A-Za-z]{1,40}$/.test(name) ? name : "Error";
};

/** The body as text, or null when it is larger than `max` bytes (the declared length is checked first, the bytes as they arrive). */
async function readBody(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > max) return null;
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder("utf-8", { fatal: true }).decode(all);
}

export function createGateway(deps: GatewayDeps): (request: Request) => Promise<Response> {
  const { config, provider, now } = deps;
  const meter = new Meter(config);
  const key = hmacKey(config.secret);
  const conversationOn = (): boolean => !config.killed && config.modules.conversation;

  const headers = (origin: string | null): Headers => {
    const h = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" });
    if (origin !== null) {
      h.set("access-control-allow-origin", origin);
      h.set("vary", "origin");
    }
    return h;
  };
  const json = (status: number, body: unknown, origin: string | null): Response => new Response(JSON.stringify(body), { status, headers: headers(origin) });
  const fail = (error: ErrorCode, origin: string | null): Response => json(STATUS[error], { v: PROTOCOL, error }, origin);

  async function turn(request: Request, origin: string, line: Draft): Promise<Response> {
    if (!conversationOn()) return fail((line.error = "off"), origin);
    const auth = request.headers.get("authorization");
    const session = await readToken(await key, auth?.startsWith("Bearer ") === true ? auth.slice(7) : null, now());
    if (session === "token" || session === "expired") return fail((line.error = session), origin);
    if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? "")) return fail((line.error = "bad-request"), origin);
    let text: string | null;
    try { text = await readBody(request, config.limits.bodyBytes); } catch { return fail((line.error = "bad-json"), origin); }
    if (text === null) return fail((line.error = "too-large"), origin);
    let raw: unknown;
    try { raw = JSON.parse(text); } catch { return fail((line.error = "bad-json"), origin); }
    const req = parseTurnRequest(raw, config.limits);
    if (req === null) return fail((line.error = "bad-request"), origin);
    line.chars = req.messages.reduce((n, m) => n + (m.role === "person" ? m.text.length : 0), 0);
    const admitted = meter.admitTurn(session.sid, session.expiresAt, now());
    if (!admitted.ok) return fail((line.error = admitted.error), origin);
    line.turn = admitted.turn;

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Timeout()); }, config.timeoutMs);
    });
    let reply: unknown;
    try {
      reply = await Promise.race([provider.turn(req, controller.signal), timeout]);
    } catch (e) {
      if (e instanceof Timeout) return fail((line.error = "timeout"), origin);
      line.exception = exceptionName(e);
      return fail((line.error = "provider"), origin);
    } finally {
      clearTimeout(timer);
    }
    const checked = validateReply(reply, req, config.limits);
    line.proposals = checked.reply.proposals.length;
    line.dropped = checked.dropped.length;
    const body: TurnResponse = { v: PROTOCOL, reply: checked.reply, dropped: checked.dropped, turnsLeft: admitted.left };
    return json(200, body, origin);
  }

  async function handle(request: Request, line: Draft): Promise<Response> {
    const path = new URL(request.url).pathname;
    const target = ROUTES[path];
    if (target === undefined) return fail((line.error = "not-found"), null);
    line.route = target.route;
    const origin = request.headers.get("origin");
    if (origin === null || !config.origins.includes(origin)) return fail((line.error = "origin"), null);
    if (request.method === "OPTIONS") {
      const h = headers(origin);
      h.delete("content-type");
      h.set("access-control-allow-methods", "GET, POST, OPTIONS");
      h.set("access-control-allow-headers", "authorization, content-type");
      h.set("access-control-max-age", "600");
      return new Response(null, { status: 204, headers: h });
    }
    if (request.method !== target.method) return fail((line.error = "method"), origin);
    switch (target.route) {
      case "config": {
        const on = (m: boolean): boolean => !config.killed && m;
        const body: ConfigResponse = { v: PROTOCOL, modules: { conversation: on(config.modules.conversation), tongue: on(config.modules.tongue), face: on(config.modules.face) }, limits: config.limits };
        return json(200, body, origin);
      }
      case "session": {
        if (!conversationOn()) return fail((line.error = "off"), origin);
        if (!meter.admitSession(now())) return fail((line.error = "rate"), origin);
        const expiresAt = now() + config.sessionMinutes * 60_000;
        const body: SessionResponse = { v: PROTOCOL, token: await issueToken(await key, newSessionId(), expiresAt), expiresAt, turns: config.turnsPerSession };
        return json(200, body, origin);
      }
      default:
        return turn(request, origin, line);
    }
  }

  return async (request) => {
    const started = now();
    const line: Draft = { route: "unknown" };
    let response: Response;
    try {
      response = await handle(request, line);
    } catch (e) {
      line.exception = exceptionName(e);
      line.error = "internal";
      response = new Response(JSON.stringify({ v: PROTOCOL, error: "internal" }), { status: 500, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    }
    deps.log({ ...line, route: line.route ?? "unknown", method: methodOf(request.method), status: response.status, ms: now() - started });
    return response;
  };
}

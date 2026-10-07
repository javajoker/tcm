// Session tokens: a random session id and an expiry, signed with HMAC-SHA-256 by the gateway's secret. No account, nothing about the person: the token only lets the gateway
// count a session's turns. `v1.<payload>.<signature>`, both parts base64url; the signature is checked by the platform's constant-time verify.
const enc = new TextEncoder();
/** The platform's key type (Web Crypto), named without the DOM library: the gateway runs on Node and in a Worker. */
type CryptoKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

const b64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function unb64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export const hmacKey = (secret: string): Promise<CryptoKey> => crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export function newSessionId(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(16)));
}

export async function issueToken(key: CryptoKey, sid: string, expiresAt: number): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ s: sid, e: expiresAt })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`v1.${payload}`)));
  return `v1.${payload}.${b64url(sig)}`;
}

export interface Session { readonly sid: string; readonly expiresAt: number }

/** The session a token names, or why it does not: "token" (missing, malformed or not signed by this gateway) or "expired". */
export async function readToken(key: CryptoKey, token: string | null, now: number): Promise<Session | "token" | "expired"> {
  if (token === null || token.length > 512) return "token";
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return "token";
  const sig = unb64url(parts[2]!);
  const payload = unb64url(parts[1]!);
  if (sig === null || payload === null) return "token";
  if (!(await crypto.subtle.verify("HMAC", key, sig, enc.encode(`v1.${parts[1]}`)))) return "token";
  let data: unknown;
  try { data = JSON.parse(new TextDecoder().decode(payload)); } catch { return "token"; }
  if (typeof data !== "object" || data === null) return "token";
  const { s, e } = data as { s?: unknown; e?: unknown };
  if (typeof s !== "string" || typeof e !== "number") return "token";
  return e <= now ? "expired" : { sid: s, expiresAt: e };
}

// Smoke test of a running deployment (docs/release-process.md §6): the pages answer, unknown languages are a real 404, the headers are what the CSP and privacy rules need, the
// knowledge-base files match their manifest and cache the way the release process says. Run against staging after a deploy, against production after promotion, and — through
// scripts/serve-dist.ts — against every build in CI.
//   node scripts/smoke.ts <base-url> [--noindex]      exit 0 = pass, 1 = failures (listed), 2 = usage
import { createHash } from "node:crypto";
import { cspHeader, IMMUTABLE } from "./deploy-files.ts";

export interface SmokeOptions {
  /** The deployment is a dev build or a closed beta: it must say so with X-Robots-Tag. */
  readonly noindex?: boolean;
  /** HSTS is only sent over HTTPS; skipped for a local http address. */
  readonly fetch?: typeof fetch;
}

const SECURITY_HEADERS: [string, (v: string) => boolean, string][] = [
  ["x-content-type-options", (v) => v === "nosniff", "nosniff"],
  ["referrer-policy", (v) => v === "no-referrer", "no-referrer"],
  ["cross-origin-opener-policy", (v) => v === "same-origin", "same-origin"],
  ["permissions-policy", (v) => ["camera=()", "microphone=()", "geolocation=()"].every((d) => v.includes(d)), "camera, microphone and geolocation denied"],
];

export async function smoke(baseUrl: string, opts: SmokeOptions = {}): Promise<string[]> {
  const out: string[] = [];
  const doFetch = opts.fetch ?? fetch;
  const base = baseUrl.replace(/\/+$/, "");
  const get = (path: string): Promise<Response> => doFetch(`${base}${path}`, { redirect: "manual" });
  const need = (ok: boolean, msg: string): void => { if (!ok) out.push(msg); };

  // 1. the app answers under every language and route; the document is never cached as immutable
  for (const path of ["/", "/zh-Hant/", "/en/", "/en/start", "/zh-Hant/result/abc", "/en/history"]) {
    const r = await get(path);
    const text = await r.text();
    need(r.status === 200, `${path}: status ${r.status}, expected 200`);
    need(text.includes('<div id="root">'), `${path}: not the app shell`);
    need(!/immutable|max-age=[1-9]/.test(r.headers.get("cache-control") ?? ""), `${path}: the document must be revalidated, not cached (cache-control: ${r.headers.get("cache-control")})`);
    if (path === "/") {
      // 2. the headers
      const csp = r.headers.get("content-security-policy");
      need(csp === cspHeader(), `/: Content-Security-Policy is ${csp === null ? "missing" : "not the expected policy"}`);
      for (const [name, ok, want] of SECURITY_HEADERS) { const v = r.headers.get(name); need(v !== null && ok(v), `/: ${name} should be ${want} (is ${v ?? "missing"})`); }
      if (base.startsWith("https://")) need(/max-age=\d{7,}/.test(r.headers.get("strict-transport-security") ?? ""), "/: Strict-Transport-Security is missing or short");
      need(opts.noindex ? /noindex/.test(r.headers.get("x-robots-tag") ?? "") : !/noindex/.test(r.headers.get("x-robots-tag") ?? ""), opts.noindex ? "/: a dev build or closed beta must send X-Robots-Tag: noindex" : "/: a public release must not send X-Robots-Tag: noindex");
    }
  }

  // 3. an unknown language is a real 404 with the static page, and still carries the headers
  for (const path of ["/nothing/here", "/fr/", "/index.php"]) {
    const r = await get(path);
    need(r.status === 404, `${path}: status ${r.status}, expected 404 for an unknown language`);
    need((await r.text()).includes("找不到這個頁面"), `${path}: not the 404 page`);
    need(r.headers.get("x-content-type-options") === "nosniff", `${path}: the 404 page lacks the security headers`);
  }

  // 4. the knowledge base: manifest revalidated; every chunk matches its hash and is cached immutably
  const mres = await get("/kb/manifest.json");
  need(mres.status === 200 && /no-cache/.test(mres.headers.get("cache-control") ?? ""), `/kb/manifest.json: status ${mres.status}, cache-control ${mres.headers.get("cache-control")} (expected 200 and no-cache)`);
  type Manifest = { chunks: Record<string, { file: string; sha256: string } | undefined>; variants?: Record<string, Record<string, { file: string; sha256: string }>> };
  let manifest: Manifest = { chunks: {} };
  try { manifest = (await mres.json()) as Manifest; } catch { out.push("/kb/manifest.json is not JSON"); }
  const listed = [...Object.entries(manifest.chunks), ...Object.entries(manifest.variants?.["zh-Hans"] ?? {}).map(([n, ref]) => [`zh-Hans ${n}`, ref] as const)];
  for (const [name, ref] of listed) {
    if (!ref) continue;
    const r = await get(`/kb/${ref.file}`);
    need(r.status === 200, `/kb/${ref.file}: status ${r.status}`);
    need(createHash("sha256").update(Buffer.from(await r.arrayBuffer())).digest("hex") === ref.sha256, `/kb/${ref.file} (${name}): the content does not match the manifest hash`);
    need(r.headers.get("cache-control") === IMMUTABLE, `/kb/${ref.file}: cache-control ${r.headers.get("cache-control")}, expected ${IMMUTABLE}`);
  }

  // 5. the service worker is served as a script and never cached by the host or the browser's HTTP cache: a worker that is cached is a worker that cannot be replaced
  const worker = await get("/sw.js");
  need(worker.status === 200 && /javascript/.test(worker.headers.get("content-type") ?? ""), `/sw.js: status ${worker.status}, content-type ${worker.headers.get("content-type")} (expected 200 and a script)`);
  need(worker.headers.get("cache-control") === "no-cache", `/sw.js: cache-control ${worker.headers.get("cache-control")}, expected no-cache`);
  need(/worker-src 'self'/.test(worker.headers.get("content-security-policy") ?? ""), "/sw.js: the Content-Security-Policy does not name worker-src");
  const boot = await get("/boot.js");
  need(boot.status === 200 && /javascript/.test(boot.headers.get("content-type") ?? "") && boot.headers.get("cache-control") === "no-cache", `/boot.js: status ${boot.status}, content-type ${boot.headers.get("content-type")}, cache-control ${boot.headers.get("cache-control")} (expected a script that is never cached)`);

  // 6. hashed assets are immutable; the root files exist
  const html = await (await get("/en/")).text();
  const asset = /(?:src|href)="(\/assets\/[^"]+)"/.exec(html)?.[1];
  if (asset === undefined) out.push("/en/: no hashed asset is referenced");
  else { const r = await get(asset); need(r.status === 200 && r.headers.get("cache-control") === IMMUTABLE, `${asset}: status ${r.status}, cache-control ${r.headers.get("cache-control")}`); }
  for (const path of ["/robots.txt", "/manifest.webmanifest", "/icon.svg", "/NOTICE.txt", "/.well-known/security.txt"]) need((await get(path)).status === 200, `${path}: not served`);
  const sec = await (await get("/.well-known/security.txt")).text();
  const expires = /^Expires:\s*(\S+)$/m.exec(sec)?.[1];
  need(/^Contact:\s*\S+/m.test(sec), "/.well-known/security.txt has no Contact");
  need(expires !== undefined && Date.parse(expires) > Date.now(), "/.well-known/security.txt has expired or has no Expires");
  return out;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const url = args.find((a) => !a.startsWith("--"));
  if (!url) { console.error("usage: node scripts/smoke.ts <base-url> [--noindex]"); process.exit(2); }
  const failures = await smoke(url, { noindex: args.includes("--noindex") });
  for (const f of failures) console.error(`✗ ${f}`);
  console.log(failures.length === 0 ? `smoke: ${url} passes` : `smoke: ${failures.length} failure(s)`);
  process.exit(failures.length === 0 ? 0 : 1);
}

// A small static server that behaves like Cloudflare Pages for the files we ship: it applies `_headers` and `_redirects` and serves `404.html` with status 404 (tech spec TQ1).
// It exists so the headers, the SPA fallback and the 404 can be tested on every build without a deployment (scripts/smoke.test.ts), and to preview a build locally:
//   node scripts/serve-dist.ts [dist] [port]
// Subset of the Pages semantics, documented here because the tests depend on it: a request is answered in this order — (1) a 3xx redirect rule, (2) a file (or a directory's
// index.html), (3) a 200 rewrite rule, (4) 404.html with status 404. A `*` in a pattern matches any characters, including "/". Every `_headers` rule that matches adds its headers;
// when several rules set the same header the values are joined with ", " (which is why the cache rules must not overlap).
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve } from "node:path";

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json" };

export interface HeaderRule { readonly pattern: string; readonly headers: readonly [string, string][] }
export interface RedirectRule { readonly from: string; readonly to: string; readonly status: number }

export function parseHeaders(text: string): HeaderRule[] {
  const rules: { pattern: string; headers: [string, string][] }[] = [];
  for (const raw of text.split("\n")) {
    if (raw.trim() === "" || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) { rules.push({ pattern: raw.trim(), headers: [] }); continue; }
    const i = raw.indexOf(":");
    if (i < 0 || rules.length === 0) continue;
    rules[rules.length - 1]!.headers.push([raw.slice(0, i).trim(), raw.slice(i + 1).trim()]);
  }
  return rules;
}
export function parseRedirects(text: string): RedirectRule[] {
  return text.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("#")).map((l) => { const [from, to, status] = l.split(/\s+/); return { from: from!, to: to!, status: Number(status ?? 302) }; });
}
const matches = (pattern: string, path: string): boolean => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(path);

export interface Pages { readonly url: string; close(): Promise<void> }

export async function servePages(distDir: string, port = 0): Promise<Pages> {
  const dist = resolve(distDir);
  const read = (f: string): string => (existsSync(join(dist, f)) ? readFileSync(join(dist, f), "utf8") : "");
  const headerRules = parseHeaders(read("_headers")), redirects = parseRedirects(read("_redirects"));
  const fileFor = (path: string): string | null => {
    const p = normalize(join(dist, path));
    if (!p.startsWith(dist) || /(^|\/)_(headers|redirects)$/.test(path)) return null;
    if (existsSync(p) && statSync(p).isDirectory()) { const i = join(p, "index.html"); return existsSync(i) ? i : null; }
    return existsSync(p) ? p : null;
  };
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    let status = 200, file: string | null = null;
    const redirect = redirects.find((r) => r.status >= 300 && r.status < 400 && matches(r.from, path));
    if (redirect) { res.writeHead(redirect.status, { Location: redirect.to }); res.end(); return; }
    file = fileFor(path);
    if (file === null) { const rewrite = redirects.find((r) => r.status === 200 && matches(r.from, path)); if (rewrite) file = fileFor(rewrite.to); }
    if (file === null) { file = join(dist, "404.html"); status = 404; if (!existsSync(file)) { res.writeHead(404); res.end(); return; } }
    const headers = new Map<string, string>();
    for (const rule of headerRules) if (matches(rule.pattern, path)) for (const [k, v] of rule.headers) headers.set(k.toLowerCase(), headers.has(k.toLowerCase()) ? `${headers.get(k.toLowerCase())}, ${v}` : v);
    headers.set("content-type", TYPES[extname(file)] ?? "application/octet-stream");
    if (!headers.has("cache-control")) headers.set("cache-control", "public, max-age=0, must-revalidate");          // Pages' default for static assets
    res.writeHead(status, Object.fromEntries(headers));
    res.end(req.method === "HEAD" ? undefined : readFileSync(file));
  });
  await new Promise<void>((ok) => server.listen(port, "127.0.0.1", ok));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((ok) => { server.close(() => ok()); server.closeAllConnections(); }) };
}

if (import.meta.main) {
  const [dist = "apps/web/dist", port = "8788"] = process.argv.slice(2);
  const pages = await servePages(dist, Number(port));
  console.log(`serving ${resolve(dist)} like Cloudflare Pages at ${pages.url}`);
}

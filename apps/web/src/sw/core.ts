// The decisions and cache operations of the service worker (docs/post-mvp/design/offline-and-install.md §3). PURE: `caches`, `fetch` and the origin are passed in, so every row of the
// request table, the atomic install, the cleanup and the warming are tested with fakes; `sw.ts` only wires the events to these functions. No dependency, no clock, no randomness.
//
// The worker precaches the BUILD and nothing else. It never answers a request that carries a body, a request to another origin, `sw.js` itself, or a file that is not in the
// build's lists: for those it is as if there were no worker.

import type { Build, Script } from "./build.ts";

export type { Build, Script };

export const CACHE_PREFIX = "tcm-app-";
export const cacheName = (build: Pick<Build, "id">): string => `${CACHE_PREFIX}${build.id}`;
export const INDEX = "/index.html";
export const WORKER_PATH = "/sw.js";
export const SCRIPTS: readonly Script[] = ["Hant", "Hans"];
const MANIFEST = "/kb/manifest.json";

// ── what to do with a request ───────────────────────────────────────────────

export interface RequestFacts {
  readonly method: string;
  /** `request.mode`: only "navigate" is a page load. */
  readonly mode: string;
  readonly pathname: string;
  readonly sameOrigin: boolean;
  /** The request carries a body. */
  readonly hasBody: boolean;
}
export type Decision = { readonly kind: "shell" } | { readonly kind: "file"; readonly path: string };

/** The request table of the design (§3.2): `null` = not handled (the browser behaves as if there were no worker). */
export function decide(req: RequestFacts, build: Build): Decision | null {
  if (req.method !== "GET" || req.hasBody || !req.sameOrigin) return null;
  if (req.pathname === WORKER_PATH) return null;
  if (req.mode === "navigate") {
    const first = req.pathname.split("/")[1] ?? "";
    // `/` and a language segment are the app (the same rewrite the host does); any other path stays a real 404 from the network
    return req.pathname === "/" || req.pathname === INDEX || build.languages.includes(first) ? { kind: "shell" } : null;
  }
  const known = build.shell.includes(req.pathname) || build.knowledge.common.includes(req.pathname) || build.knowledge.hans.includes(req.pathname);
  return known ? { kind: "file", path: req.pathname } : null;
}

// ── the two things the worker touches ───────────────────────────────────────

export type CacheLike = Pick<Cache, "addAll" | "match" | "keys">;
export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
}
export interface Env {
  readonly caches: CacheStorageLike;
  readonly fetch: typeof fetch;
  /** The worker's own origin, so that a path becomes a URL. */
  readonly origin: string;
}

/**
 * A request for a path of the build. A hashed file (under /assets/ or a knowledge chunk, which carry their hash in their name) may come from the browser's HTTP cache; every
 * other file (the page, the manifest, the icons) is fetched from the network, because its name does not say whether it changed.
 */
export const requestFor = (path: string, origin: string): Request => new Request(new URL(path, origin), { cache: path.startsWith("/assets/") || /\/[^/]+\.[0-9a-f]{10}\.[a-z]+$/.test(path) ? "default" : "reload" });

const pathOf = (r: Request): string => new URL(r.url).pathname;

// ── install, warm, activate ─────────────────────────────────────────────────

/**
 * Cache the shell of the build in one step: if any file cannot be fetched the install fails, nothing half-built is left, and the browser tries again on a later visit. Then — best
 * effort — cache the knowledge of the scripts the previous build's cache held, so an update does not take away a person's offline readiness.
 */
export async function install(build: Build, env: Env): Promise<void> {
  const name = cacheName(build);
  const cache = await env.caches.open(name);
  try {
    await cache.addAll(build.shell.map((p) => requestFor(p, env.origin)));
  } catch (error) {
    await env.caches.delete(name);
    throw error;
  }
  await Promise.allSettled([...await scriptsCachedBefore(build, env)].map((s) => cacheKnowledge(build, env, s)));
}

/** The scripts whose knowledge files an earlier build's cache holds: Traditional (and English) if it has a manifest, Simplified if it has the display lists. */
export async function scriptsCachedBefore(build: Build, env: Env): Promise<Set<Script>> {
  const found = new Set<Script>();
  for (const name of (await env.caches.keys()).filter((k) => k.startsWith(CACHE_PREFIX) && k !== cacheName(build))) {
    const paths = (await (await env.caches.open(name)).keys()).map(pathOf);
    if (paths.includes(MANIFEST)) found.add("Hant");
    if (paths.some((p) => p.startsWith("/kb/hans-"))) found.add("Hans");
  }
  return found;
}

/**
 * Cache the knowledge files a script needs (what is missing; what is there stays). `true` when every file of the script is cached afterwards. The files are fetched together, so a
 * failure leaves the script uncached rather than partly cached: a knowledge base with a missing chunk is an error screen, not a degraded one.
 */
export async function cacheKnowledge(build: Build, env: Env, script: Script): Promise<boolean> {
  const cache = await env.caches.open(cacheName(build));
  const wanted = [...build.knowledge.common, ...(script === "Hans" ? build.knowledge.hans : [])];
  const missing: string[] = [];
  for (const p of wanted) if (await cache.match(new URL(p, env.origin).href) === undefined) missing.push(p);
  if (missing.length === 0) return true;
  try {
    await cache.addAll(missing.map((p) => requestFor(p, env.origin)));
    return true;
  } catch {
    return false;
  }
}

/** Remove every cache of an earlier build (everything named `tcm-app-*` but this build's). Returns the names it removed. */
export async function activate(build: Build, env: Env): Promise<string[]> {
  const old = (await env.caches.keys()).filter((k) => k.startsWith(CACHE_PREFIX) && k !== cacheName(build));
  for (const name of old) await env.caches.delete(name);
  return old;
}

// ── answering ───────────────────────────────────────────────────────────────

/** The cached copy of what `decide` chose; the network if the cache does not hold it (it was cleared, or never filled). Nothing is ever stored here. */
export async function answer(decision: Decision, request: Request, build: Build, env: Env): Promise<Response> {
  const cache = await env.caches.open(cacheName(build));
  const hit = await cache.match(new URL(decision.kind === "shell" ? INDEX : decision.path, env.origin).href);
  return hit ?? env.fetch(request);
}

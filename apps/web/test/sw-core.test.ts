// @vitest-environment node
// The service worker's decisions and cache operations (docs/post-mvp/design/offline-and-install.md §3, §6), with a fake cache and a fake network.
import { describe, expect, it } from "vitest";
import { activate, answer, cacheKnowledge, cacheName, decide, install, requestFor, scriptsCached, scriptsCachedBefore, type Build, type CacheLike, type CacheStorageLike, type Env, type RequestFacts } from "../src/sw/core.ts";

const ORIGIN = "https://app.example";
const build = (id = "b1"): Build => ({
  id,
  shell: ["/index.html", "/assets/index-AAA.js", "/assets/Result-BBB.js", "/assets/index-CCC.css", "/icon.svg", "/manifest.webmanifest", "/NOTICE.txt"],
  knowledge: { common: ["/kb/manifest.json", "/kb/core.0123456789.json", "/kb/cities.0123456789.json"], hans: ["/kb/hans-main.0123456789.txt", "/assets/hans-DDD.js"] },
  languages: ["zh-Hant", "zh-Hans", "en", "zh", "en-us"],
});
const facts = (over: Partial<RequestFacts> = {}): RequestFacts => ({ method: "GET", mode: "cors", pathname: "/", sameOrigin: true, hasBody: false, ...over });

class FakeCache {
  readonly entries = new Map<string, Response>();
  writes: string[] = [];
  private readonly network: Network;
  constructor(network: Network) { this.network = network; }
  async addAll(requests: Request[]): Promise<void> {
    const got: [string, Response][] = [];
    for (const r of requests) { const res = await this.network.fetch(r); if (!res.ok) throw new TypeError(`${r.url}: ${res.status}`); got.push([r.url, res]); }
    for (const [u, res] of got) { this.entries.set(u, res); this.writes.push(new URL(u).pathname); }          // all or nothing, as Cache.addAll is
  }
  async match(request: string | URL | Request): Promise<Response | undefined> { return this.entries.get(typeof request === "string" ? request : request instanceof URL ? request.href : request.url)?.clone(); }
  async keys(): Promise<Request[]> { return [...this.entries.keys()].map((u) => new Request(u)); }
}
class FakeCaches {
  readonly map = new Map<string, FakeCache>();
  private readonly network: Network;
  constructor(network: Network) { this.network = network; }
  async open(name: string): Promise<CacheLike> { if (!this.map.has(name)) this.map.set(name, new FakeCache(this.network)); return this.map.get(name) as unknown as CacheLike; }
  async has(name: string): Promise<boolean> { return this.map.has(name); }
  async keys(): Promise<string[]> { return [...this.map.keys()]; }
  async delete(name: string): Promise<boolean> { return this.map.delete(name); }
}
class Network {
  readonly requested: { url: string; cache: string }[] = [];
  /** Paths that answer with an error. */
  broken = new Set<string>();
  async fetch(input: RequestInfo | URL): Promise<Response> {
    const r = input instanceof Request ? input : new Request(input);
    this.requested.push({ url: new URL(r.url).pathname, cache: r.cache });
    return this.broken.has(new URL(r.url).pathname) ? new Response("no", { status: 503 }) : new Response(`body of ${new URL(r.url).pathname}`);
  }
}
function world(): { net: Network; caches: FakeCaches; env: Env } {
  const net = new Network(), caches = new FakeCaches(net);
  return { net, caches, env: { caches: caches as unknown as CacheStorageLike, fetch: ((i: RequestInfo | URL) => net.fetch(i)) as typeof fetch, origin: ORIGIN } };
}
const cacheOf = (w: ReturnType<typeof world>, b: Build): FakeCache => w.caches.map.get(cacheName(b))!;
const paths = (c: FakeCache): string[] => [...c.entries.keys()].map((u) => new URL(u).pathname).sort();

describe("decide: the request table", () => {
  const b = build();
  it("a navigation to / or to a language segment is the app shell", () => {
    for (const pathname of ["/", "/index.html", "/en/", "/en/start", "/zh-Hant/result/abc/print", "/zh-Hans/settings", "/zh", "/en-us/x"]) expect(decide(facts({ mode: "navigate", pathname }), b), pathname).toEqual({ kind: "shell" });
  });
  it("a navigation to any other path stays a real 404 from the network", () => {
    for (const pathname of ["/nothing", "/EN/start", "/zh-xx/", "/kb/manifest.json", "/assets/index-AAA.js", "/sw.js", "/_headers"]) expect(decide(facts({ mode: "navigate", pathname }), b), pathname).toBeNull();
  });
  it("a file of the build is answered from the cache: the shell, the knowledge files, the manifest of this build", () => {
    for (const pathname of [...b.shell, ...b.knowledge.common, ...b.knowledge.hans]) expect(decide(facts({ pathname }), b), pathname).toEqual({ kind: "file", path: pathname });
  });
  it("anything else is not handled, as if there were no worker", () => {
    for (const pathname of ["/assets/other.js", "/kb/core.ffffffffff.json", "/robots.txt", "/_headers", "/_redirects", "/404.html", "/.well-known/security.txt", "/api/anything", "/index.html/", "/assets/index-AAA.js?x"]) expect(decide(facts({ pathname }), b), pathname).toBeNull();
  });
  it("never a request that is not a GET, that has a body, or that goes to another origin; never the worker itself", () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]) expect(decide(facts({ method, pathname: "/icon.svg" }), b), method).toBeNull();
    expect(decide(facts({ pathname: "/icon.svg", hasBody: true }), b)).toBeNull();
    expect(decide(facts({ pathname: "/icon.svg", sameOrigin: false }), b)).toBeNull();
    expect(decide(facts({ mode: "navigate", pathname: "/en/", sameOrigin: false }), b)).toBeNull();
    expect(decide(facts({ pathname: "/sw.js" }), { ...b, shell: [...b.shell, "/sw.js"] })).toBeNull();
  });
});

describe("install", () => {
  it("caches the whole shell in one step, fetching the files whose names carry no hash afresh", async () => {
    const w = world(), b = build();
    await install(b, w.env);
    expect(paths(cacheOf(w, b))).toEqual([...b.shell].sort());
    const how = Object.fromEntries(w.net.requested.map((r) => [r.url, r.cache]));
    expect(how["/assets/index-AAA.js"]).toBe("default");
    expect(how["/index.html"]).toBe("reload");
    expect(how["/manifest.webmanifest"]).toBe("reload");
  });

  it("fails as a whole when one file cannot be fetched: no half-built cache, the old one is untouched, the error reaches the browser so it tries again later", async () => {
    const w = world();
    await install(build("old"), w.env);
    w.net.broken.add("/assets/Result-BBB.js");
    await expect(install(build("new"), w.env)).rejects.toThrow();
    expect(w.caches.map.has(cacheName(build("new")))).toBe(false);
    expect(paths(cacheOf(w, build("old")))).toEqual([...build("old").shell].sort());
  });

  it("an update warms the knowledge of the scripts the previous cache held, and a failure there does not fail the install", async () => {
    const w = world(), old = build("old"), b = build("new");
    await install(old, w.env);
    expect(await scriptsCachedBefore(b, w.env)).toEqual(new Set());                                     // nothing of the knowledge base was cached: nothing to warm
    await cacheKnowledge(old, w.env, "Hans");
    expect(await scriptsCachedBefore(b, w.env)).toEqual(new Set(["Hant", "Hans"]));
    await install(b, w.env);
    expect(paths(cacheOf(w, b))).toEqual([...b.shell, ...b.knowledge.common, ...b.knowledge.hans].sort());

    const w2 = world();
    await install(old, w2.env);
    await cacheKnowledge(old, w2.env, "Hant");
    w2.net.broken.add("/kb/core.0123456789.json");
    await expect(install(b, w2.env)).resolves.toBeUndefined();
    expect(paths(cacheOf(w2, b))).toEqual([...b.shell].sort());                                         // the shell is there; the knowledge is for the page to ask again
  });

  it("reads only the caches of this application", async () => {
    const w = world();
    await (await w.env.caches.open("some-other-app")).addAll([new Request(`${ORIGIN}/kb/manifest.json`)]);
    expect(await scriptsCachedBefore(build(), w.env)).toEqual(new Set());
  });
});

describe("cacheKnowledge", () => {
  it("caches what a script needs; Simplified adds its display lists and catalogue; what is there is not fetched again", async () => {
    const w = world(), b = build();
    await install(b, w.env);
    w.net.requested.length = 0;
    expect(await cacheKnowledge(b, w.env, "Hant")).toBe(true);
    expect(w.net.requested.map((r) => r.url).sort()).toEqual([...b.knowledge.common].sort());
    expect(paths(cacheOf(w, b))).not.toContain("/kb/hans-main.0123456789.txt");
    w.net.requested.length = 0;
    expect(await cacheKnowledge(b, w.env, "Hant")).toBe(true);
    expect(w.net.requested).toEqual([]);
    expect(await cacheKnowledge(b, w.env, "Hans")).toBe(true);
    expect(w.net.requested.map((r) => r.url).sort()).toEqual([...b.knowledge.hans].sort());
  });

  it("is all or nothing for the files it adds: a failure caches none of them and says so", async () => {
    const w = world(), b = build();
    await install(b, w.env);
    w.net.broken.add("/kb/cities.0123456789.json");
    expect(await cacheKnowledge(b, w.env, "Hant")).toBe(false);
    expect(paths(cacheOf(w, b)).filter((p) => p.startsWith("/kb/"))).toEqual([]);
    w.net.broken.clear();
    expect(await cacheKnowledge(b, w.env, "Hant")).toBe(true);
  });
});

describe("a removed cache stays removed", () => {
  it("neither caching knowledge nor asking what is cached makes it again", async () => {
    const w = world(), b = build();
    await install(b, w.env);
    await w.env.caches.delete(cacheName(b));
    expect(await cacheKnowledge(b, w.env, "Hant")).toBe(false);
    expect(await scriptsCached(b, w.env)).toEqual([]);
    expect(await w.env.caches.keys()).toEqual([]);
  });
});

describe("scriptsCached", () => {
  it("names the scripts whose knowledge files are all there — Simplified only on top of the common ones", async () => {
    const w = world(), b = build();
    await install(b, w.env);
    expect(await scriptsCached(b, w.env)).toEqual([]);
    await cacheKnowledge(b, w.env, "Hant");
    expect(await scriptsCached(b, w.env)).toEqual(["Hant"]);
    await cacheKnowledge(b, w.env, "Hans");
    expect(await scriptsCached(b, w.env)).toEqual(["Hant", "Hans"]);
    // one file gone (the browser trimmed the cache): the script is no longer complete
    cacheOf(w, b).entries.delete(new URL("/kb/cities.0123456789.json", ORIGIN).href);
    expect(await scriptsCached(b, w.env)).toEqual([]);
  });
});

describe("activate", () => {
  it("removes the caches of earlier builds and nothing else", async () => {
    const w = world();
    for (const id of ["a", "b", "c"]) await install(build(id), w.env);
    await w.env.caches.open("unrelated");
    expect((await activate(build("c"), w.env)).sort()).toEqual([cacheName(build("a")), cacheName(build("b"))]);
    expect((await w.env.caches.keys()).sort()).toEqual(["unrelated", cacheName(build("c"))].sort());
    expect(await activate(build("c"), w.env)).toEqual([]);
  });
});

describe("answer", () => {
  it("serves the page for the shell and a file from the cache, without touching the network", async () => {
    const w = world(), b = build();
    await install(b, w.env);
    w.net.requested.length = 0;
    const page = await answer({ kind: "shell" }, new Request(`${ORIGIN}/en/start`), b, w.env);
    expect(await page.text()).toBe("body of /index.html");
    const file = await answer({ kind: "file", path: "/assets/Result-BBB.js" }, new Request(`${ORIGIN}/assets/Result-BBB.js`), b, w.env);
    expect(await file.text()).toBe("body of /assets/Result-BBB.js");
    expect(w.net.requested).toEqual([]);
  });

  it("a cache that was removed is not made again by a request: the network answers, and no empty cache is left behind", async () => {
    const w = world(), b = build();
    await install(b, w.env);
    await w.env.caches.delete(cacheName(b));
    const res = await answer({ kind: "file", path: "/icon.svg" }, new Request(`${ORIGIN}/icon.svg`), b, w.env);
    expect(await res.text()).toBe("body of /icon.svg");
    expect(await w.env.caches.keys()).toEqual([]);
  });

  it("falls back to the network for what the cache does not hold (it was cleared, or never filled) and stores nothing", async () => {
    const w = world(), b = build();
    const res = await answer({ kind: "file", path: "/kb/manifest.json" }, new Request(`${ORIGIN}/kb/manifest.json`), b, w.env);
    expect(await res.text()).toBe("body of /kb/manifest.json");
    expect(w.net.requested.map((r) => r.url)).toEqual(["/kb/manifest.json"]);
    expect(await w.env.caches.keys()).toEqual([]);                                                       // nothing was stored, not even an empty cache
  });
});

describe("requestFor", () => {
  it("lets the browser's own cache serve files whose names carry their hash, and asks the network for the rest", () => {
    expect(requestFor("/assets/index-AAA.js", ORIGIN).cache).toBe("default");
    expect(requestFor("/kb/core.0123456789.json", ORIGIN).cache).toBe("default");
    for (const p of ["/index.html", "/kb/manifest.json", "/icon.svg", "/NOTICE.txt", "/manifest.webmanifest"]) expect(requestFor(p, ORIGIN).cache, p).toBe("reload");
    expect(requestFor("/en/start", ORIGIN).url).toBe(`${ORIGIN}/en/start`);
  });
});

// A small deterministic generator, so a failure can be reproduced.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe("property: nothing outside the build's lists is ever answered or stored", () => {
  it("random methods, modes, origins, bodies and paths", async () => {
    const r = rng(20261005), w = world(), b = build();
    await install(b, w.env);
    await cacheKnowledge(b, w.env, "Hans");
    const known = new Set([...b.shell, ...b.knowledge.common, ...b.knowledge.hans]);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
    const pool = [...known, "/", "/en/", "/en/start", "/zh-Hant/x/y", "/sw.js", "/_headers", "/nothing", "/EN/", "/assets/x.js", "/kb/x.json", "/index.html/", "//", "", "/%2e%2e/index.html", "/en/../sw.js", "/api/save"];
    let handled = 0;
    const before = new Set(paths(cacheOf(w, b)));
    for (let i = 0; i < 5000; i++) {
      const req = facts({ method: pick(["GET", "GET", "GET", "POST", "PUT", "HEAD", "DELETE"]), mode: pick(["navigate", "cors", "no-cors", "same-origin"]), pathname: pick(pool) + (r() < 0.2 ? "?q=1" : ""), sameOrigin: r() < 0.9, hasBody: r() < 0.1 });
      const d = decide(req, b);
      if (d === null) continue;
      handled++;
      expect(req.method).toBe("GET");
      expect(req.hasBody || !req.sameOrigin || req.pathname === "/sw.js").toBe(false);
      expect(d.kind === "shell" ? true : known.has(d.path)).toBe(true);
      await answer(d, new Request(new URL(req.pathname, ORIGIN)), b, w.env);
    }
    expect(handled).toBeGreaterThan(500);
    expect(new Set(paths(cacheOf(w, b)))).toEqual(before);                                              // answering never writes
    expect(paths(cacheOf(w, b)).every((p) => known.has(p))).toBe(true);
  });
});

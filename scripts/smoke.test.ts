// The deploy files and the smoke test: a real build is served by the Pages emulator (scripts/serve-dist.ts) and must pass; seeded damage to the generated files must fail the
// smoke test with the right message; the generators are checked directly. Like check-release.test.ts it runs `vite build`, which writes apps/web/.kb/<profile>: the two files must not run at
// the same time (`pnpm test:scripts` runs the test files one after the other).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { cspHeader, cspMeta, headersFile, LANGUAGE_SEGMENTS, notFoundPage, redirectsFile, securityTxt } from "./deploy-files.ts";
import { parseHeaders, parseRedirects, servePages } from "./serve-dist.ts";
import { smoke } from "./smoke.ts";

const root = join(import.meta.dirname, "..");
let beta = "", pub = "";
const temp: string[] = [];
const build = (draft: "on" | "off"): string => {
  const dir = mkdtempSync(join(tmpdir(), "tcm-smoke-"));
  temp.push(dir);
  execFileSync("pnpm", ["--filter", "@tcm/web", "exec", "vite", "build", "--outDir", dir, "--emptyOutDir"], { cwd: root, env: { ...process.env, APP_PROFILE: "release", APP_DRAFT_LABEL: draft }, stdio: "pipe" });
  return dir;
};
before(() => { beta = build("on"); pub = build("off"); });
after(() => { for (const d of temp) rmSync(d, { recursive: true, force: true }); });

/** Serve a (possibly damaged) copy of a build and smoke-test it. */
async function run(dist: string, opts: { noindex?: boolean } = {}): Promise<string[]> {
  const pages = await servePages(dist);
  try { return await smoke(pages.url, opts); } finally { await pages.close(); }
}
function damaged(from: string, fn: (dir: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "tcm-smoke-copy-"));
  temp.push(dir);
  cpSync(from, dir, { recursive: true });
  fn(dir);
  return dir;
}
const edit = (dir: string, f: string, fn: (s: string) => string): void => writeFileSync(join(dir, f), fn(readFileSync(join(dir, f), "utf8")));

describe("a real build behind a Pages-like host", () => {
  test("a closed-beta build passes, is noindex, and the public build passes without it", async () => {
    assert.deepEqual(await run(beta, { noindex: true }), []);
    assert.deepEqual(await run(pub, { noindex: false }), []);
    assert.match(await run(beta, { noindex: false }).then((f) => f.join("\n")), /a public release must not send X-Robots-Tag: noindex/);
    assert.match(await run(pub, { noindex: true }).then((f) => f.join("\n")), /a dev build or closed beta must send X-Robots-Tag: noindex/);
  });

  test("unknown languages are a real 404; the app's own languages and routes are served the app", async () => {
    const pages = await servePages(beta);
    try {
      assert.equal((await fetch(`${pages.url}/fr/start`)).status, 404);
      assert.equal((await fetch(`${pages.url}/en/anything/at/all`)).status, 200);
      assert.equal((await fetch(`${pages.url}/en`)).status, 200);
      for (const l of LANGUAGE_SEGMENTS) assert.equal((await fetch(`${pages.url}/${l}/start`)).status, 200, l);
      assert.equal((await fetch(`${pages.url}/_headers`)).status, 404, "the control files are not served");
      assert.equal((await fetch(`${pages.url}/_redirects`)).status, 404);
    } finally { await pages.close(); }
  });
});

describe("the smoke test fails on damage, with the reason", () => {
  test("a missing CSP, a weakened header, a missing 404 page, a missing redirect", async () => {
    const noCsp = damaged(beta, (d) => edit(d, "_headers", (s) => s.replace(/ {2}Content-Security-Policy:.*\n/, "")));
    assert.match((await run(noCsp, { noindex: true })).join("\n"), /Content-Security-Policy is missing/);
    const weak = damaged(beta, (d) => edit(d, "_headers", (s) => s.replace("Referrer-Policy: no-referrer", "Referrer-Policy: origin")));
    assert.match((await run(weak, { noindex: true })).join("\n"), /referrer-policy should be no-referrer \(is origin\)/);
    const no404 = damaged(beta, (d) => rmSync(join(d, "404.html")));
    assert.match((await run(no404, { noindex: true })).join("\n"), /\/nothing\/here: status 404, expected 404|not the 404 page/);
    const noRedirects = damaged(beta, (d) => writeFileSync(join(d, "_redirects"), ""));
    assert.match((await run(noRedirects, { noindex: true })).join("\n"), /\/en\/start: status 404, expected 200/);
  });

  test("a cached document, a mutable chunk, a chunk that differs from the manifest, an expired security.txt", async () => {
    const cachedHtml = damaged(beta, (d) => edit(d, "_headers", (s) => `/en/*\n  Cache-Control: public, max-age=31536000, immutable\n\n${s}`));
    assert.match((await run(cachedHtml, { noindex: true })).join("\n"), /\/en\/: the document must be revalidated/);
    const mutable = damaged(beta, (d) => edit(d, "_headers", (s) => s.replace(/(\/kb\/core\.[0-9a-f]+\.json\n {2}Cache-Control: )[^\n]*/, "$1no-cache")));
    assert.match((await run(mutable, { noindex: true })).join("\n"), /\/kb\/core\.[0-9a-f]+\.json: cache-control no-cache/);
    const tampered = damaged(beta, (d) => { const f = readdirSync(join(d, "kb")).find((x) => x.startsWith("citations."))!; writeFileSync(join(d, "kb", f), "{}"); });
    assert.match((await run(tampered, { noindex: true })).join("\n"), /\(citations\): the content does not match the manifest hash/);
    const stale = damaged(beta, (d) => edit(d, ".well-known/security.txt", (s) => s.replace(/Expires:.*/, "Expires: 2020-01-01T00:00:00Z")));
    assert.match((await run(stale, { noindex: true })).join("\n"), /security\.txt has expired/);
  });
});

describe("the generators", () => {
  test("the header CSP is the page's CSP plus frame-ancestors", () => {
    assert.equal(cspHeader(), `${cspMeta()}; frame-ancestors 'none'`);
    assert.ok(!cspMeta().includes("frame-ancestors"), "a <meta> cannot carry frame-ancestors");
    assert.ok(!/unsafe|\*/.test(cspHeader()));
  });

  test("cache rules never overlap: each exact path sits under at most one Cache-Control rule, and /* sets none", () => {
    const rules = parseHeaders(headersFile({ noindex: false, kbChunks: ["core.aaaa.json", "formulas.bbbb.json"] }));
    const star = rules.find((r) => r.pattern === "/*")!;
    assert.ok(!star.headers.some(([k]) => k.toLowerCase() === "cache-control"));
    assert.ok(!star.headers.some(([k]) => k === "X-Robots-Tag"));
    const cached = rules.filter((r) => r.headers.some(([k]) => k === "Cache-Control")).map((r) => r.pattern);
    assert.deepEqual(cached, ["/assets/*", "/kb/core.aaaa.json", "/kb/formulas.bbbb.json", "/kb/manifest.json"]);
    assert.ok(parseHeaders(headersFile({ noindex: true, kbChunks: [] })).find((r) => r.pattern === "/*")!.headers.some(([k]) => k === "X-Robots-Tag"));
  });

  test("every language segment has a bare and a splat rewrite; the 404 page is static and bilingual", () => {
    const rules = parseRedirects(redirectsFile());
    for (const l of LANGUAGE_SEGMENTS) assert.ok(rules.some((r) => r.from === `/${l}` && r.status === 200) && rules.some((r) => r.from === `/${l}/*` && r.status === 200), l);
    const page = notFoundPage();
    assert.ok(!/<script|style=|<style/.test(page), "the CSP allows neither inline script nor style");
    assert.match(page, /找不到這個頁面/);
    assert.match(page, /We couldn't find that page/);
  });

  test("security.txt follows RFC 9116: a contact, an expiry at most a year ahead", () => {
    const t = securityTxt("https://example.org/advisory", new Date("2026-10-04T00:00:00Z"), "https://example.org/policy");
    assert.match(t, /^Contact: https:\/\/example\.org\/advisory$/m);
    assert.match(t, /^Expires: 2027-04-02T00:00:00Z$/m);
    assert.match(t, /^Policy: https:\/\/example\.org\/policy$/m);
  });

  test("the header and redirect parsers read the Pages format", () => {
    assert.deepEqual(parseHeaders("# c\n/a/*\n  X-One: 1\n  X-Two: 2: 3\n\n/b\n  X-Three: 3\n"), [{ pattern: "/a/*", headers: [["X-One", "1"], ["X-Two", "2: 3"]] }, { pattern: "/b", headers: [["X-Three", "3"]] }]);
    assert.deepEqual(parseRedirects("# c\n/old  /new  301\n/app/*  /index.html  200\n/x /y\n"), [{ from: "/old", to: "/new", status: 301 }, { from: "/app/*", to: "/index.html", status: 200 }, { from: "/x", to: "/y", status: 302 }]);
  });
});

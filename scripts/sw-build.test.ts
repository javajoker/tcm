// What the service worker is told about its build (scripts/sw-build.ts): which list a file belongs to, an id that changes with any file, the facts a built worker carries, and the kill worker.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, test } from "node:test";
import { buildFacts, buildId, classify, filesUnder, killWorkerSource, NEVER_CACHED, parseWorker, workerSource } from "./sw-build.ts";

const dirs: string[] = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
function site(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "tcm-sw-"));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, name)), { recursive: true }); writeFileSync(join(dir, name), text); }
  return dir;
}
const SITE = {
  "index.html": "<html>", "NOTICE.txt": "n", "icon.svg": "<svg/>", "manifest.webmanifest": "{}", "assets/index-AAAAAA.js": "a", "assets/Result-BBBBBB.js": "b", "assets/index-CCCCCC.css": "c", "assets/hans-DDDDDD.js": "d",
  "kb/manifest.json": "{}", "kb/core.0123456789.json": "{}", "kb/cities.0123456789.json": "{}", "kb/hans-main.0123456789.txt": "x", "kb/hans-cities.0123456789.txt": "y",
  "sw.js": "old", "_headers": "h", "_redirects": "r", "404.html": "4", "robots.txt": "User-agent: *", ".well-known/security.txt": "Contact: x",
};

describe("classify", () => {
  test("the page, its scripts and styles, the icons and the notice are the shell", () => {
    for (const p of ["index.html", "assets/index-AAAAAA.js", "assets/Result-BBBBBB.js", "assets/x-ABCDEF.css", "icon.svg", "icon-192.png", "apple-touch-icon.png", "manifest.webmanifest", "NOTICE.txt"]) assert.equal(classify(p), "shell", p);
  });
  test("the knowledge base is fetched on request; the Simplified display lists and catalogue only for Simplified", () => {
    for (const p of ["kb/manifest.json", "kb/core.0123456789.json", "kb/cities.0123456789.json", "kb/book.0123456789.json"]) assert.equal(classify(p), "common", p);          // the book too: read offline in every script that shows it
    for (const p of ["kb/hans-main.0123456789.txt", "kb/hans-cities.0123456789.txt", "assets/hans-B-z8IZ3g.js"]) assert.equal(classify(p), "hans", p);
    assert.equal(classify("assets/hans.module-AAAAAA.css"), "shell", "only the script chunk is the catalogue");
    for (const p of ["kb/reference.0123456789.json", "kb/hans-reference.0123456789.txt"]) assert.equal(classify(p), "never", `${p}: asked for by those who declared a role only, never in a general reader's offline copy`);
    assert.equal(classify("kb/reference.0123456789.json", true), "common", "a build that serves the study reference to everyone caches it for every language");
    assert.equal(classify("kb/hans-reference.0123456789.txt", true), "hans", "…and its Simplified list for Simplified");
    assert.equal(classify("assets/Inquiry-AAAAAA.js"), "shell");
  });
  test("the worker itself and the host's own files are never cached", () => {
    for (const p of [...NEVER_CACHED, ".well-known/security.txt", ".well-known/other"]) assert.equal(classify(p), "never", p);
  });
});

describe("buildFacts", () => {
  test("lists every file of the build in exactly one place, sorted, with a leading slash", () => {
    const f = buildFacts(site(SITE), ["en", "zh-Hant"]);
    assert.deepEqual(f.shell, ["/NOTICE.txt", "/assets/Result-BBBBBB.js", "/assets/index-AAAAAA.js", "/assets/index-CCCCCC.css", "/icon.svg", "/index.html", "/manifest.webmanifest"]);
    assert.deepEqual(f.knowledge.common, ["/kb/cities.0123456789.json", "/kb/core.0123456789.json", "/kb/manifest.json"]);
    assert.deepEqual(f.knowledge.hans, ["/assets/hans-DDDDDD.js", "/kb/hans-cities.0123456789.txt", "/kb/hans-main.0123456789.txt"]);
    assert.deepEqual(f.languages, ["en", "zh-Hant"]);
    assert.equal(filesUnder(site(SITE)).length, Object.keys(SITE).length);
    assert.ok(![...f.shell, ...f.knowledge.common, ...f.knowledge.hans].some((p) => /sw\.js|_headers|_redirects|404|robots|security/.test(p)));
  });

  test("the id is the same for the same files whatever the worker holds, and different when any cached file changes — or is added, removed or renamed", () => {
    const id = (files: Record<string, string>): string => buildFacts(site(files), []).id;
    const base = id(SITE);
    assert.match(base, /^[0-9a-f]{16}$/);
    assert.equal(id(SITE), base);
    assert.equal(id({ ...SITE, "sw.js": "something else entirely", "_headers": "other", "robots.txt": "Allow" }), base, "files that are not cached do not change it");
    assert.notEqual(id({ ...SITE, "index.html": "<html> changed" }), base, "the page is not content-hashed, so its content must count");
    assert.notEqual(id({ ...SITE, "kb/manifest.json": '{"a":1}' }), base);
    assert.notEqual(id({ ...SITE, "assets/index-AAAAAA.js": "a2" }), base);
    const { "assets/Result-BBBBBB.js": _gone, ...fewer } = SITE;
    assert.notEqual(id(fewer), base);
    assert.notEqual(id({ ...SITE, "assets/Result-ZZZZZZ.js": "b" }), base);
    assert.notEqual(buildId(site(SITE), ["index.html"]), buildId(site(SITE), ["index.html", "icon.svg"]));
  });
});

describe("the worker file", () => {
  test("carries the facts on its first line and the code after; they read back, and anything else is refused", () => {
    const facts = buildFacts(site(SITE), ["en"]);
    const source = workerSource(facts, "(function(){})();");
    assert.ok(source.startsWith("self.__TCM_BUILD__={"));
    assert.equal(source.split("\n")[1], "(function(){})();");
    assert.deepEqual(parseWorker(source), facts);
    assert.equal(parseWorker("(function(){})();"), null);
    assert.equal(parseWorker("self.__TCM_BUILD__={not json};\ncode"), null);
    assert.equal(parseWorker("self.__TCM_BUILD__={}"), null);
  });
});

describe("the kill worker", () => {
  const source = killWorkerSource();
  test("takes over at once, removes the caches of this application and only those, takes its clients, reloads them and unregisters", () => {
    assert.match(source, /addEventListener\("install", \(\) => \{ self\.skipWaiting\(\); \}\)/);
    assert.match(source, /name\.startsWith\("tcm-app-"\)\) await caches\.delete\(name\)/);
    assert.match(source, /clients\.claim\(\)/);
    assert.match(source, /clients\.matchAll\(\{ type: "window" \}\)/);
    assert.match(source, /registration\.unregister\(\)/);
    assert.match(source, /client\.navigate\(client\.url\)/);
  });
  test("is self-contained: no import, no address, no fetch, no storage of its own", () => {
    assert.ok(!/\bimport\b|https?:\/\/|\bfetch\(|cache\.(put|add)|localStorage|indexedDB/.test(source));
  });
  test("is valid JavaScript and registers exactly the two handlers", () => {
    const handlers: string[] = [];
    const scope = { addEventListener: (type: string) => handlers.push(type), skipWaiting: () => {} };
    new Function("self", "caches", source)(scope, {});
    assert.deepEqual(handlers, ["install", "activate"]);
  });
});

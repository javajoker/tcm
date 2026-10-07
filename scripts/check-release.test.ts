// check-release.ts must pass on a real release build and fail — with the right rule — on every seeded violation (R-03).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { checkRelease, type Failure } from "./check-release.ts";
import { LANGUAGE_SEGMENTS } from "./deploy-files.ts";
import { buildFacts, workerSource } from "./sw-build.ts";

const root = join(import.meta.dirname, "..");
let base = "";          // a closed-beta build: draft label on, so noindex
let publicBase = "";    // the same build as a public release (indexable)
const copies: string[] = [];

before(() => {
  base = mkdtempSync(join(tmpdir(), "tcm-release-"));
  execFileSync("pnpm", ["--filter", "@tcm/web", "exec", "vite", "build", "--outDir", base, "--emptyOutDir"], { cwd: root, env: { ...process.env, APP_PROFILE: "release", APP_DRAFT_LABEL: "on" }, stdio: "pipe" });
  publicBase = mkdtempSync(join(tmpdir(), "tcm-release-public-"));
  execFileSync("pnpm", ["--filter", "@tcm/web", "exec", "vite", "build", "--outDir", publicBase, "--emptyOutDir"], { cwd: root, env: { ...process.env, APP_PROFILE: "release", APP_DRAFT_LABEL: "off" }, stdio: "pipe" });
});
after(() => { rmSync(base, { recursive: true, force: true }); rmSync(publicBase, { recursive: true, force: true }); for (const c of copies) rmSync(c, { recursive: true, force: true }); });

/** A private copy of the build to damage. */
function copy(from: string = base): string {
  const dir = mkdtempSync(join(tmpdir(), "tcm-release-copy-"));
  cpSync(from, dir, { recursive: true });
  copies.push(dir);
  return dir;
}
/**
 * Make the worker describe the files the build now has. A test that damages a file of the build means to break one rule; the worker's own description of the build (rule 13) must
 * not also fail, so every helper that writes into a copy calls this afterwards.
 */
function resync(dir: string): void {
  const source = readFileSync(join(dir, "sw.js"), "utf8");
  writeFileSync(join(dir, "sw.js"), workerSource(buildFacts(dir, LANGUAGE_SEGMENTS), source.slice(source.indexOf(";\n") + 2)));
}
const manifest = (dir: string): { chunks: Record<string, { file: string; sha256: string }>; schema: number } => JSON.parse(readFileSync(join(dir, "kb", "manifest.json"), "utf8"));
const saveManifest = (dir: string, m: unknown): void => { writeFileSync(join(dir, "kb", "manifest.json"), JSON.stringify(m)); resync(dir); };

/** Rewrite a knowledge-base chunk and keep the manifest hash right, so only the intended rule can fail. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the tests damage arbitrary JSON shapes
function edit(dir: string, name: string, fn: (data: any) => void): void {
  const m = manifest(dir);
  const file = join(dir, "kb", m.chunks[name]!.file);
  const data = JSON.parse(readFileSync(file, "utf8"));
  fn(data);
  const text = JSON.stringify(data);
  writeFileSync(file, text);
  m.chunks[name]!.sha256 = createHash("sha256").update(text).digest("hex");
  saveManifest(dir, m);          // (also describes the changed files to the worker)
}
/** Rewrite one file of the herb browser ("index" or a shard key) and keep its hash in the manifest right, so only the intended rule can fail. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the tests damage arbitrary JSON shapes
function editHerb(dir: string, which: string, fn: (data: any) => void): void {
  const m = manifest(dir) as unknown as { herbBrowser: { index: { file: string; sha256: string }; shards: Record<string, { file: string; sha256: string }> } };
  const ref = which === "index" ? m.herbBrowser.index : m.herbBrowser.shards[which]!;
  const file = join(dir, "kb", ref.file);
  const data = JSON.parse(readFileSync(file, "utf8"));
  fn(data);
  const text = JSON.stringify(data);
  writeFileSync(file, text);
  ref.sha256 = createHash("sha256").update(text).digest("hex");
  saveManifest(dir, m);
}
/** Rewrite the book and keep its hash in the manifest right, so only the intended rule can fail. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the tests damage arbitrary JSON shapes
function editBook(dir: string, fn: (data: any) => void): void {
  const m = manifest(dir) as unknown as { book: { file: string; sha256: string } };
  const file = join(dir, "kb", m.book.file);
  const data = JSON.parse(readFileSync(file, "utf8"));
  fn(data);
  const text = JSON.stringify(data);
  writeFileSync(file, text);
  m.book.sha256 = createHash("sha256").update(text).digest("hex");
  saveManifest(dir, m);
}
const bookOf = (dir: string): { file: string; chapters: string[] } => (manifest(dir) as unknown as { book: { file: string; chapters: string[] } }).book;
const firstShard = (dir: string): string => Object.keys((manifest(dir) as unknown as { herbBrowser: { shards: Record<string, unknown> } }).herbBrowser.shards)[0]!;
const html = (dir: string, fn: (s: string) => string): void => { writeFileSync(join(dir, "index.html"), fn(readFileSync(join(dir, "index.html"), "utf8"))); resync(dir); };
const entryJs = (dir: string): string => join(dir, readdirSync(join(dir, "assets")).filter((f) => f.endsWith(".js")).map((f) => `assets/${f}`).sort()[0]!);
/** Text that does not compress, for a file that is meant to be too big. */
function noiseOf(words: number): string {
  let noise = "";
  let x = 12345;
  for (let i = 0; i < words; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; noise += x.toString(36); }
  return noise;
}
const rules = (f: Failure[]): number[] => [...new Set(f.map((x) => x.rule))].sort();
const messages = (f: Failure[]): string => f.map((x) => x.message).join("\n");

describe("check-release", () => {
  test("a real release build passes with the closed-beta exception and fails only the review gate without it", () => {
    assert.deepEqual(checkRelease(base, { draftLabel: true }), []);
    const f = checkRelease(base);
    assert.deepEqual(rules(f), [12, 15, 16, 8]);          // the review gate, the draft emergency rows (a public build ships only verified ones), the herbs no sample review has covered and the draft book
    assert.match(messages(f), /not reviewed/);
    assert.match(messages(f), /a public build shows only herbs a sample review has covered/);
    assert.match(messages(f), /the learning book is "draft"/);
  });

  test("reviewed content needs no exception", () => {
    const d = copy(publicBase);          // a public build: only verified emergency rows ship (none yet), so only the review gate stands in the way
    edit(d, "core", (c) => { c.params._meta.status = "reviewed"; });
    assert.deepEqual(checkRelease(d), []);
  });

  test("a missing build is reported, not thrown", () => {
    assert.equal(checkRelease(join(base, "nowhere"))[0]?.rule, 0);
  });

  test("1: a knowledge base built for another profile", () => {
    const d = copy();
    edit(d, "core", (c) => { c.config.profileName = "dev"; });
    assert.ok(rules(checkRelease(d, { draftLabel: true })).includes(1));
  });

  test("2: dev-only text in the app or the knowledge base", () => {
    const a = copy();
    writeFileSync(entryJs(a), `${readFileSync(entryJs(a), "utf8")}\n;"DEV · release";`); resync(a);
    assert.deepEqual(rules(checkRelease(a, { draftLabel: true })), [2]);
    const b = copy();
    edit(b, "core", (c) => { c.config.note = "annotate_only"; });
    assert.deepEqual(rules(checkRelease(b, { draftLabel: true })), [2]);
    const pseudo = copy();
    writeFileSync(entryJs(pseudo), `${readFileSync(entryJs(pseudo), "utf8")}\n;({"en-xa":1});`); resync(pseudo);
    assert.deepEqual(rules(checkRelease(pseudo, { draftLabel: true })), [2], "a pseudo-locale in a release build");
    const c2 = copy();
    writeFileSync(entryJs(c2), `${readFileSync(entryJs(c2), "utf8")}\n;"Component catalogue";`); resync(c2);
    assert.deepEqual(rules(checkRelease(c2, { draftLabel: true })), [2]);
    const rx = copy();
    writeFileSync(entryJs(rx), `${readFileSync(entryJs(rx), "utf8")}\n;({"rx.title":"x"});`); resync(rx);
    assert.deepEqual(rules(checkRelease(rx, { draftLabel: true })), [2], "the personalised prescription's messages in a release build");
    const sanyin = copy();
    edit(sanyin, "core", (c) => { c.config.extra = { sanyin: {} }; });
    assert.deepEqual(rules(checkRelease(sanyin, { draftLabel: true })), [2], "the prescription's tables in a release knowledge base");
  });

  test("3: a dose or amount anywhere in the knowledge base — null is fine, a value is not", () => {
    const ok = copy();
    edit(ok, "formulas", (f) => { f.items[0].typical_g = null; });
    assert.deepEqual(checkRelease(ok, { draftLabel: true }), []);
    const bad = copy();
    edit(bad, "formulas", (f) => { f.items[0].classical_amounts = [{ herb: "x", value: 3 }]; });
    assert.deepEqual(rules(checkRelease(bad, { draftLabel: true })), [3]);
    const nested = copy();
    edit(nested, "formulas", (f) => { f.items[0].composition[0].typical_g = 9; });
    assert.match(messages(checkRelease(nested, { draftLabel: true })), /typical_g/);
    const doses = copy();
    edit(doses, "core", (c) => { c.safety.dose_references = { elderly: "half" }; });
    assert.match(messages(checkRelease(doses, { draftLabel: true })), /dose_references/);
  });

  test("4: tier-C or tier-B formulas, modifications and herb records the profile cannot reach", () => {
    const c = copy();
    edit(c, "formulas", (f) => { f.items[0].tier = "C"; });
    assert.match(messages(checkRelease(c, { draftLabel: true })), /tier C/);
    const b = copy();
    edit(b, "formulas", (f) => { f.items[0].tier = "B"; });
    assert.match(messages(checkRelease(b, { draftLabel: true })), /tier B/);
    const m = copy();
    edit(m, "formulas", (f) => { f.items[0].modifications = [{ id: "M" }]; });
    assert.match(messages(checkRelease(m, { draftLabel: true })), /modifications/);
    const h = copy();
    const mf = manifest(h);
    const file = "herbs.0123456789ab.json";
    writeFileSync(join(h, "kb", file), "{}");
    mf.chunks.herbs = { file, sha256: createHash("sha256").update("{}").digest("hex") };
    saveManifest(h, mf);
    assert.match(messages(checkRelease(h, { draftLabel: true })), /herbs chunk/);
  });

  test("5: CSP missing, weakened, inline script, external address, unhashed asset or chunk", () => {
    const none = copy();
    html(none, (s) => s.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, ""));
    assert.match(messages(checkRelease(none, { draftLabel: true })), /no Content-Security-Policy/);
    const weak = copy();
    html(weak, (s) => s.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"));
    assert.match(messages(checkRelease(weak, { draftLabel: true })), /inline or eval/);
    const noConnect = copy();
    html(noConnect, (s) => s.replace("connect-src 'self'; ", ""));
    assert.match(messages(checkRelease(noConnect, { draftLabel: true })), /connect-src/);
    const inline = copy();
    html(inline, (s) => s.replace("</head>", "<script>alert(1)</script></head>"));
    assert.match(messages(checkRelease(inline, { draftLabel: true })), /inline <script>/);
    const external = copy();
    html(external, (s) => s.replace("</head>", '<link rel="stylesheet" href="https://cdn.example.com/x.css"></head>'));
    assert.match(messages(checkRelease(external, { draftLabel: true })), /external address/);
    const unhashed = copy();
    writeFileSync(join(unhashed, "assets", "app.js"), "export {}");
    assert.match(messages(checkRelease(unhashed, { draftLabel: true })), /app\.js is not content-hashed/);
  });

  test("6: a chunk that differs from the manifest, a missing chunk, another schema, a chunk over budget, an initial script over budget", () => {
    const tamper = copy();
    const file = join(tamper, "kb", manifest(tamper).chunks.citations!.file);
    writeFileSync(file, `${readFileSync(file, "utf8")} `);
    assert.match(messages(checkRelease(tamper, { draftLabel: true })), /SHA-256 differs/);
    const missing = copy();
    rmSync(join(missing, "kb", manifest(missing).chunks.core!.file));
    assert.match(messages(checkRelease(missing, { draftLabel: true })), /not in the output/);
    const schema = copy();
    const m = manifest(schema);
    m.schema = 99;
    saveManifest(schema, m);
    assert.match(messages(checkRelease(schema, { draftLabel: true })), /schema is 99/);
    const fat = copy();
    edit(fat, "citations", (c) => { c.padding = Array.from({ length: 20000 }, (_, i) => createHash("sha256").update(String(i)).digest("hex")); });
    assert.match(messages(checkRelease(fat, { draftLabel: true })), /exceeds the \d+ B budget of the citations chunk/);
    assert.match(messages(checkRelease(base, { draftLabel: true, initialJsBudgetGz: 1000 })), /initial JavaScript is \d+ B gzip/);
  });

  test("6: the Simplified-Chinese display lists — absent, missing, damaged, or not aligned with the chunks; and cached as immutable", () => {
    type Lists = { main: { file: string; sha256: string; strings: number; digest: string }; cities: { file: string } };
    const lists = (d: string): Lists => (manifest(d) as unknown as { variants: { "zh-Hans": Lists } }).variants["zh-Hans"];
    const none = copy();
    const nm = manifest(none) as { variants?: unknown };
    delete nm.variants;
    saveManifest(none, nm);
    assert.match(messages(checkRelease(none, { draftLabel: true })), /no Simplified-Chinese display lists/);
    const missing = copy();
    rmSync(join(missing, "kb", lists(missing).main.file));
    assert.match(messages(checkRelease(missing, { draftLabel: true })), /display list main → hans-main\.[0-9a-f]+\.txt, which is not in the output/);
    const damaged = copy();
    const f = join(damaged, "kb", lists(damaged).cities.file);
    writeFileSync(f, `${readFileSync(f, "utf8")}x`);
    assert.match(messages(checkRelease(damaged, { draftLabel: true })), /hans-cities\.[0-9a-f]+\.txt: the SHA-256 differs/);
    // a chunk that gained a Chinese string the list does not know: the list is no longer aligned
    const stale = copy();
    edit(stale, "citations", (c) => { c.items[0].book += "測"; });
    assert.match(messages(checkRelease(stale, { draftLabel: true })), /display list is not aligned with the Chinese strings of the chunks/);
    const uncached = copy();
    const name = lists(uncached).main.file.replace(/[.]/g, "\\.");
    writeFileSync(join(uncached, "_headers"), readFileSync(join(uncached, "_headers"), "utf8").replace(new RegExp(`(/kb/${name}\\n {2}Cache-Control: )[^\\n]*`), "$1no-cache"));
    assert.match(messages(checkRelease(uncached, { draftLabel: true })), /Simplified display list \/kb\/hans-main\.[0-9a-f]+\.txt must be cached as immutable/);
  });

  test("7: a blocking notice that is no longer blocking, a dead-end flow, a profile that does not suppress", () => {
    const preg = copy();
    edit(preg, "core", (c) => { c.config.profile.population.pregnant.notice = "inline"; });
    assert.match(messages(checkRelease(preg, { draftLabel: true })), /population\.pregnant no longer raises a blocking notice/);
    const red = copy();
    edit(red, "core", (c) => { c.config.profile.condition.red_flag_A.notice = "none"; });
    assert.match(messages(checkRelease(red, { draftLabel: true })), /condition\.red_flag_A/);
    const flow = copy();
    edit(flow, "core", (c) => { c.config.resolution.flow = "stop"; });
    assert.match(messages(checkRelease(flow, { draftLabel: true })), /must be "continue"/);
    const enforce = copy();
    edit(enforce, "core", (c) => { c.config.profile.safety_enforcement = "annotate_only"; });
    assert.ok(rules(checkRelease(enforce, { draftLabel: true })).includes(7));
  });

  test("5: a page reference to a file that is not in the output, a manifest icon that is missing, an address on another host", () => {
    const icon = copy();
    rmSync(join(icon, "icon.svg"));
    assert.match(messages(checkRelease(icon, { draftLabel: true })), /refers to \/icon\.svg, which is not in the output/);
    const mani = copy();
    rmSync(join(mani, "icon-512.png"));
    assert.match(messages(checkRelease(mani, { draftLabel: true })), /manifest\.webmanifest lists the icon \/icon-512\.png/);
    const broken = copy();
    writeFileSync(join(broken, "manifest.webmanifest"), "{ nope");
    assert.match(messages(checkRelease(broken, { draftLabel: true })), /manifest\.webmanifest is not valid JSON/);
    const proto = copy();
    html(proto, (x) => x.replace("</head>", '<link rel="stylesheet" href="//cdn.example.com/x.css"></head>'));
    assert.match(messages(checkRelease(proto, { draftLabel: true })), /an address on another host/);
  });

  test("8: a closed beta (draft label on) that search engines may index; a public release is indexable and needs the review records", () => {
    const meta = copy();
    html(meta, (x) => x.replace(/<meta name="robots"[^>]*>/, ""));
    assert.match(messages(checkRelease(meta, { draftLabel: true })), /index\.html has no noindex robots meta/);
    const txt = copy();
    writeFileSync(join(txt, "robots.txt"), "User-agent: *\nAllow: /\n");
    assert.match(messages(checkRelease(txt, { draftLabel: true })), /robots\.txt does not disallow everything/);
    // the beta build is noindex in both places; the public build is neither
    assert.match(readFileSync(join(base, "robots.txt"), "utf8"), /^Disallow: \/$/m);
    assert.match(readFileSync(join(base, "index.html"), "utf8"), /name="robots" content="noindex, nofollow"/);
    assert.doesNotMatch(readFileSync(join(publicBase, "index.html"), "utf8"), /noindex/);
    assert.doesNotMatch(readFileSync(join(publicBase, "robots.txt"), "utf8"), /^Disallow: \/$/m);
    const pub = copy(publicBase);
    edit(pub, "core", (c) => { c.params._meta.status = "reviewed"; });
    assert.deepEqual(checkRelease(pub), []);
    assert.match(messages(checkRelease(publicBase, { draftLabel: true })), /must not be indexable/);
  });

  test("12: a public build ships only verified, current emergency numbers and always the generic line", () => {
    const core = (d: string): { emergency: { regions: { id: string; verification?: unknown; emergency: unknown[] }[] } } => JSON.parse(readFileSync(join(d, "kb", manifest(d).chunks.core!.file), "utf8"));
    // as built, the public build says only "call your local emergency number": nothing is verified yet
    assert.deepEqual(core(publicBase).emergency.regions.map((r) => r.id), ["OTHER"]);
    assert.equal(core(base).emergency.regions.length, 12, "the closed beta carries the draft rows");
    // the other cases start from the closed-beta build, which has every row; only rule 12 is looked at (editing a chunk also unaligns the display list)
    const rule12 = (d: string, o: { now?: Date; draftLabel?: boolean } = {}): string => messages(checkRelease(d, o).filter((f) => f.rule === 12));
    const verification = (at: string) => ({ at, by: "regional owner", scope: "both", source: "an official page" });
    const draftRows = copy(base);
    assert.match(rule12(draftRows), /ships the emergency numbers of TW without a verification/);
    assert.equal(rule12(draftRows, { draftLabel: true }), "", "the closed beta may carry draft rows");
    const only = (keep: string[], at?: string) => (c: { emergency: { regions: { id: string; verification?: unknown }[] } }): void => {
      c.emergency.regions = c.emergency.regions.filter((r) => keep.includes(r.id));
      if (at !== undefined) c.emergency.regions.find((r) => r.id === "TW")!.verification = verification(at);
    };
    const fresh = copy(base);
    edit(fresh, "core", only(["TW", "OTHER"], "2026-09-01"));
    assert.equal(rule12(fresh, { now: new Date("2026-10-05") }), "");
    assert.match(rule12(fresh, { now: new Date("2029-01-01") }), /verified \d+ months ago: a public build needs a verification no older than 24 months/);
    const noOther = copy(base);
    edit(noOther, "core", only(["TW"], "2026-09-01"));
    assert.match(rule12(noOther, { now: new Date("2026-10-05") }), /no generic emergency region/);
    const numbered = copy(base);
    edit(numbered, "core", (c) => { only(["TW", "OTHER"], "2026-09-01")(c); c.emergency.regions.find((r: { id: string }) => r.id === "OTHER")!.emergency = [{ number: "119", label: { "zh-Hant": "x", en: "x" } }]; });
    assert.match(rule12(numbered, { now: new Date("2026-10-05") }), /OTHER lists numbers/);
  });

  test("10: the attribution notice is shipped and complete", () => {
    const missing = copy();
    rmSync(join(missing, "NOTICE.txt"));
    assert.match(messages(checkRelease(missing, { draftLabel: true })), /NOTICE\.txt is missing/);
    const gutted = copy();
    writeFileSync(join(gutted, "NOTICE.txt"), "TCM Self-Check");
    resync(gutted);
    const m = messages(checkRelease(gutted, { draftLabel: true }));
    assert.match(m, /does not contain "TCM-Library"/);
    assert.match(m, /does not contain "Permission is hereby granted"/);
    assert.deepEqual(rules(checkRelease(gutted, { draftLabel: true })), [10]);
  });

  test("11: the host files — headers, caching of this build's chunks, fallback for every language, a 404 page, security.txt", () => {
    for (const f of ["_headers", "_redirects", "404.html", ".well-known/security.txt"]) {
      const d = copy();
      rmSync(join(d, f));
      assert.match(messages(checkRelease(d, { draftLabel: true })), new RegExp(`${f.replace(/[.]/g, "\\.")} is missing`), f);
    }
    const headers = (fn: (s: string) => string): string[] => { const d = copy(); writeFileSync(join(d, "_headers"), fn(readFileSync(join(d, "_headers"), "utf8"))); return checkRelease(d, { draftLabel: true }).filter((x) => x.rule === 11).map((x) => x.message); };
    assert.match(headers((s) => s.replace(/ {2}Content-Security-Policy:.*\n/, "")).join("\n"), /Content-Security-Policy is missing/);
    assert.match(headers((s) => s.replace(/; frame-ancestors 'none'/, "")).join("\n"), /Content-Security-Policy is missing or is not the policy/);
    assert.match(headers((s) => s.replace("nosniff", "sniff")).join("\n"), /nosniff is missing/);
    assert.match(headers((s) => s.replace("/*\n", "/*\n  Cache-Control: no-cache\n")).join("\n"), /\/\* must not set Cache-Control/);
    assert.match(headers((s) => s.replace(/(\/assets\/\*\n {2}Cache-Control: )[^\n]*/, "$1no-store")).join("\n"), /\/assets\/\* must be cached as immutable/);
    assert.match(headers((s) => s.replace(/(\/kb\/manifest\.json\n {2}Cache-Control: )[^\n]*/, "$1public, max-age=31536000, immutable")).join("\n"), /manifest\.json must be revalidated/);
    assert.match(headers((s) => s.replace(/(\/kb\/core\.[0-9a-f]+\.json\n {2}Cache-Control: )[^\n]*/, "$1no-cache")).join("\n"), /the core chunk .* must be cached as immutable/);
    assert.match(headers((s) => s.replace(/(\/sw\.js\n {2}Cache-Control: )[^\n]*/, "$1public, max-age=86400")).join("\n"), /\/sw\.js must be revalidated/);
    assert.match(headers((s) => s.replace("/sw.js\n  Cache-Control: no-cache\n", "")).join("\n"), /\/sw\.js must be revalidated/);
    assert.match(headers((s) => s.replace("/boot.js\n  Cache-Control: no-cache\n", "")).join("\n"), /\/boot\.js must be revalidated/);
    assert.match(headers((s) => s.replace("worker-src 'self'; ", "")).join("\n"), /Content-Security-Policy is missing or is not the policy/);
    const r = copy();
    writeFileSync(join(r, "_redirects"), "/en/*  /index.html  200\n/*  /index.html  200\n");
    const m = messages(checkRelease(r, { draftLabel: true }));
    assert.match(m, /_redirects: \/zh-Hant\/\* does not fall back to the app/);
    assert.match(m, /a catch-all rewrite would hide the 404/);
    const s = copy();
    writeFileSync(join(s, ".well-known/security.txt"), "Expires: 2020-01-01T00:00:00Z\n");
    assert.match(messages(checkRelease(s, { draftLabel: true })), /security\.txt has no Contact/);
    assert.match(messages(checkRelease(s, { draftLabel: true })), /no Expires or it is in the past/);
  });

  test("17: AI help in a release — the profile, a gateway the page may connect to, or the client, card or messages in a script", () => {
    const profile = copy();
    edit(profile, "core", (c) => { c.config.profile.ai = { enabled: true, endpoint: "https://ai.example", modules: { conversation: true, tongue: false, face: false } }; });
    assert.deepEqual(rules(checkRelease(profile, { draftLabel: true })), [17]);
    const csp = copy();
    html(csp, (s) => s.replace("connect-src 'self'", "connect-src 'self' https://ai.example"));
    assert.deepEqual(rules(checkRelease(csp, { draftLabel: true })), [17, 5], "and rule 5: the page names another address");
    assert.match(messages(checkRelease(csp, { draftLabel: true })), /may connect to 'self' https:\/\/ai\.example/);
    for (const marker of ["/v1/intake/turn", "ai.consent.title"]) {
      const code = copy();
      writeFileSync(entryJs(code), `${readFileSync(entryJs(code), "utf8")}\n;fetch(${JSON.stringify(marker)});`); resync(code);
      assert.deepEqual(rules(checkRelease(code, { draftLabel: true })), [17], marker);
    }
  });

  test("9: source maps", () => {
    const map = copy();
    writeFileSync(join(map, "assets", "index-abcdef12.js.map"), "{}");
    assert.match(messages(checkRelease(map, { draftLabel: true })), /source maps must not be served/);
    const comment = copy();
    writeFileSync(entryJs(comment), `${readFileSync(entryJs(comment), "utf8")}\n//# sourceMappingURL=index.js.map`);
    assert.match(messages(checkRelease(comment, { draftLabel: true })), /points to a source map/);
  });

  test("13: the service worker is present and describes exactly this build", () => {
    const worker = (d: string): string => readFileSync(join(d, "sw.js"), "utf8");
    const withWorker = (fn: (source: string) => string): Failure[] => { const d = copy(); writeFileSync(join(d, "sw.js"), fn(worker(d))); return checkRelease(d, { draftLabel: true }); };
    const only13 = (f: Failure[]): string => f.filter((x) => x.rule === 13).map((x) => x.message).join("\n");
    const facts = (source: string): { id: string; shell: string[]; knowledge: { common: string[]; hans: string[] }; languages: string[] } => JSON.parse(source.slice("self.__TCM_BUILD__=".length, source.indexOf(";\n")));
    const rewrite = (source: string, fn: (f: ReturnType<typeof facts>) => void): string => { const f = facts(source); fn(f); return `self.__TCM_BUILD__=${JSON.stringify(f)};\n${source.slice(source.indexOf(";\n") + 2)}`; };

    assert.deepEqual(checkRelease(base, { draftLabel: true }).filter((x) => x.rule === 13), []);

    const missing = copy();
    rmSync(join(missing, "sw.js"));
    assert.match(only13(checkRelease(missing, { draftLabel: true })), /sw\.js is missing/);
    assert.match(only13(withWorker(() => "console.log(1)")), /does not start with the facts of the build/);

    // a file the worker does not list, a file it lists that is not there, a file in the wrong list
    const added = copy();
    writeFileSync(join(added, "assets", "late-abcdef123.js"), "export {}");
    assert.match(only13(checkRelease(added, { draftLabel: true })), /its shell list is not the build's.*not listed: \/assets\/late-abcdef123\.js/);
    const removed = copy();
    const gone = facts(worker(removed)).shell.find((p) => p.startsWith("/assets/Advice-"))!;
    rmSync(join(removed, gone.slice(1)));
    assert.match(only13(checkRelease(removed, { draftLabel: true })), new RegExp(`listed but not in the build: ${gone.replace(/[.]/g, "\\.")}`));
    assert.match(only13(withWorker((src) => rewrite(src, (f) => { f.knowledge.common.pop(); }))), /its knowledge list is not the build's/);
    assert.match(only13(withWorker((src) => rewrite(src, (f) => { f.languages.push("fr"); }))), /language segments list is not the build's/);
    const hansChunk = (src: string): string => facts(src).knowledge.hans.find((p) => p.startsWith("/assets/hans-"))!;
    const moved = only13(withWorker((src) => rewrite(src, (f) => { const c = f.knowledge.hans.find((p) => p.startsWith("/assets/hans-"))!; f.knowledge.hans = f.knowledge.hans.filter((p) => p !== c); f.shell.push(c); })));
    assert.match(moved, /its shell list is not the build's/);
    assert.match(moved, /Simplified list must hold exactly one lazy script/);
    assert.ok(hansChunk(worker(copy())).startsWith("/assets/hans-"));

    // a stale id: a file changed after the worker was written, so the browser would see the same worker and keep the old file
    const stale = copy();
    writeFileSync(join(stale, "NOTICE.txt"), `${readFileSync(join(stale, "NOTICE.txt"), "utf8")}\nchanged`);
    assert.match(only13(checkRelease(stale, { draftLabel: true })), /the build id is not the hash of the build's files/);
    assert.match(only13(withWorker((src) => rewrite(src, (f) => { f.shell = f.shell.filter((p) => p !== "/index.html"); }))), /does not hold \/index\.html/);
    assert.match(only13(withWorker((src) => rewrite(src, (f) => { f.shell.push("/sw.js"); }))), /sw\.js lists itself/);

    // the boot script: present, loaded by the page as a classic script, self-contained and small; and the host serves it fresh
    const noBoot = copy();
    rmSync(join(noBoot, "boot.js"));
    assert.match(only13(checkRelease(noBoot, { draftLabel: true })), /boot\.js is missing/);
    const unlinked = copy();
    html(unlinked, (s) => s.replace('<script src="/boot.js"></script>', ""));
    assert.match(only13(checkRelease(unlinked, { draftLabel: true })), /index\.html does not load \/boot\.js as a classic script/);
    const reaching = copy();
    writeFileSync(join(reaching, "boot.js"), `${readFileSync(join(reaching, "boot.js"), "utf8")}\nfetch("/x");`);
    resync(reaching);
    assert.match(only13(checkRelease(reaching, { draftLabel: true })), /boot\.js reaches out/);
    const bloated = copy();
    writeFileSync(join(bloated, "boot.js"), `${readFileSync(join(bloated, "boot.js"), "utf8")}\n/*${noiseOf(8000)}*/`);
    resync(bloated);
    assert.match(only13(checkRelease(bloated, { draftLabel: true })), /boot\.js is \d+ B gzip, over the 2048 B budget/);

    // an external address, and a worker too big to read in one sitting
    assert.match(only13(withWorker((src) => `${src}\nfetch("https://example.com/track");`)), /names an external address/);
    assert.match(only13(withWorker((src) => `${src}\n/*${noiseOf(12000)}*/`)), /over the 10240 B budget/);
  });

  test("14: the manifest makes the app installable — standalone, at its root, with the icons browsers ask for — and asks for nothing else", () => {
    const only14 = (d: string): string => checkRelease(d, { draftLabel: true }).filter((x) => x.rule === 14).map((x) => x.message).join("\n");
    const manifestOf = (d: string): { [k: string]: unknown; icons: { src: string; sizes: string; type: string; purpose?: string }[] } => JSON.parse(readFileSync(join(d, "manifest.webmanifest"), "utf8"));
    const withManifest = (change: (m: ReturnType<typeof manifestOf>) => void): string => { const d = copy(); const m = manifestOf(d); change(m); writeFileSync(join(d, "manifest.webmanifest"), JSON.stringify(m)); resync(d); return only14(d); };
    assert.equal(only14(base), "");

    assert.match(withManifest((m) => { m.display = "browser"; }), /display is "browser", expected "standalone"/);
    assert.match(withManifest((m) => { m.start_url = "/en/"; }), /start_url is "\/en\/"/);
    assert.match(withManifest((m) => { m.scope = "/app/"; }), /scope is "\/app\/"/);
    assert.match(withManifest((m) => { delete m.id; }), /id is undefined/);
    assert.match(withManifest((m) => { delete m.short_name; }), /no short_name/);
    assert.match(withManifest((m) => { m.theme_color = "teal"; }), /theme_color is not a #rrggbb colour/);
    for (const key of ["shortcuts", "categories", "related_applications", "screenshots"]) assert.match(withManifest((m) => { m[key] = []; }), new RegExp(`the manifest has ${key}`), key);
    assert.match(withManifest((m) => { m.icons = m.icons.filter((i) => i.purpose !== "maskable"); }), /no maskable PNG icon of 512x512/);
    assert.match(withManifest((m) => { m.icons = m.icons.filter((i) => i.sizes !== "192x192"); }), /no any PNG icon of 192x192/);
    assert.match(withManifest((m) => { m.icons.find((i) => i.sizes === "192x192")!.sizes = "512x512"; }), /icon-192\.png is 192x192, the manifest says 512x512/);
    assert.match(withManifest((m) => { m.icons.push({ src: "/icon-1024.png", sizes: "1024x1024", type: "image/png" }); }), /icon-1024\.png, which is not in the output/);

    const noLink = copy();
    html(noLink, (s) => s.replace(/<link[^>]+rel="manifest"[^>]*>/, ""));
    assert.match(only14(noLink), /does not link a web-app manifest/);
    const noTouch = copy();
    html(noTouch, (s) => s.replace(/<link[^>]+rel="apple-touch-icon"[^>]*>/, ""));
    assert.match(only14(noTouch), /no apple-touch-icon/);
    const small = copy();
    const tiny = Buffer.from(readFileSync(join(small, "apple-touch-icon.png")));
    tiny.writeUInt32BE(100, 16);
    tiny.writeUInt32BE(100, 20);
    writeFileSync(join(small, "apple-touch-icon.png"), tiny);
    resync(small);
    assert.match(only14(small), /apple-touch-icon is not a square PNG of at least 180 px/);
  });
  test("15: the closed beta ships the herb browser, a public build ships none, and both are clean", () => {
    const m = manifest(base) as unknown as { herbBrowser?: { count: number; shards: Record<string, unknown> }; variants: { "zh-Hans": { herbs?: unknown } } };
    assert.ok(m.herbBrowser !== undefined && m.herbBrowser.count > 600 && Object.keys(m.herbBrowser.shards).length === 16);
    assert.ok(m.variants["zh-Hans"].herbs !== undefined, "and a Simplified list for each file");
    assert.equal((manifest(publicBase) as unknown as { herbBrowser?: unknown }).herbBrowser, undefined);
    assert.equal(readdirSync(join(publicBase, "kb")).filter((f) => f.includes("herbs-")).length, 0);
    assert.deepEqual(checkRelease(base, { draftLabel: true }).filter((f) => f.rule === 15), []);
  });

  test("15: a file of the herb browser that is missing, altered or not content-hashed", () => {
    const missing = copy();
    const key = firstShard(missing);
    const file = join(missing, "kb", (manifest(missing) as unknown as { herbBrowser: { shards: Record<string, { file: string }> } }).herbBrowser.shards[key]!.file);
    rmSync(file);
    resync(missing);
    assert.match(messages(checkRelease(missing, { draftLabel: true }).filter((f) => f.rule === 15)), new RegExp(`herbs-${key} → .*, which is not in the output`));

    const altered = copy();
    const f2 = join(altered, "kb", (manifest(altered) as unknown as { herbBrowser: { index: { file: string } } }).herbBrowser.index.file);
    writeFileSync(f2, readFileSync(f2, "utf8").replace(/,/, ", "));
    resync(altered);
    assert.match(messages(checkRelease(altered, { draftLabel: true }).filter((f) => f.rule === 15)), /the SHA-256 differs from the manifest/);

    const unhashed = copy();
    const m = manifest(unhashed) as unknown as { herbBrowser: { index: { file: string } } };
    const old = m.herbBrowser.index.file;
    m.herbBrowser.index.file = "herbs-index.json";
    writeFileSync(join(unhashed, "kb", "herbs-index.json"), readFileSync(join(unhashed, "kb", old)));
    rmSync(join(unhashed, "kb", old));
    saveManifest(unhashed, m);
    assert.match(messages(checkRelease(unhashed, { draftLabel: true }).filter((f) => f.rule === 15)), /is not a content-hashed herbs-index file/);
  });

  test("15: no weights, no dose and no repository path in a herb page", () => {
    const d = copy();
    editHerb(d, firstShard(d), (c) => {
      const h = Object.values(c.items)[0] as Record<string, unknown>;
      h["effects"] = { "liuxie.濕": -0.5 };
      h["dose_g_reference"] = [9, 15];
      (h["source"] as Record<string, unknown>)["path"] = "reference/sources/TCM-Library/x.md";
    });
    const f = checkRelease(d, { draftLabel: true });
    assert.match(messages(f.filter((x) => x.rule === 15)), /carries the field "effects"/);
    assert.match(messages(f.filter((x) => x.rule === 15)), /carries the field "path"/);
    assert.match(messages(f.filter((x) => x.rule === 3)), /dose field "dose_g_reference"/);
  });

  test("15: the index and the shards must agree", () => {
    const moved = copy();
    const keys = Object.keys((manifest(moved) as unknown as { herbBrowser: { shards: Record<string, unknown> } }).herbBrowser.shards);
    let carried: [string, unknown] | undefined;
    editHerb(moved, keys[0]!, (c) => { const slug = Object.keys(c.items)[0]!; carried = [slug, c.items[slug]]; delete c.items[slug]; });
    editHerb(moved, keys[1]!, (c) => { c.items[carried![0]] = carried![1]; });
    const f = checkRelease(moved, { draftLabel: true }).filter((x) => x.rule === 15);
    assert.match(messages(f), /is in shard .* but its slug maps to/);
    assert.doesNotMatch(messages(f), /in none of the shards/, "it is still in a shard, only in the wrong one");

    const dropped = copy();
    editHerb(dropped, firstShard(dropped), (c) => { delete c.items[Object.keys(c.items)[0]!]; });
    assert.match(messages(checkRelease(dropped, { draftLabel: true }).filter((x) => x.rule === 15)), /is in the index but in none of the shards/);

    const counted = copy();
    editHerb(counted, "index", (c) => { c.count += 1; });
    assert.match(messages(checkRelease(counted, { draftLabel: true }).filter((x) => x.rule === 15)), /the manifest says \d+ herbs/);
  });

  test("15: a public build lists only herbs a sample review has covered", () => {
    const d = copy();          // the closed-beta build, checked as a public one: every herb is a draft
    const f = checkRelease(d).filter((x) => x.rule === 15);
    assert.ok(f.length > 600, `${f.length} failures: one for each herb of the shards and of the index`);
    // once the sample review has covered them, nothing stands in the way of the herb rule (the review gate and the emergency rows are other rules)
    const m = manifest(d) as unknown as { herbBrowser: { shards: Record<string, unknown> } };
    editHerb(d, "index", (c) => { for (const row of c.rows) row[11] = 2; });
    for (const key of Object.keys(m.herbBrowser.shards)) editHerb(d, key, (c) => { for (const h of Object.values(c.items) as { status: string }[]) h.status = "reviewed"; });
    assert.deepEqual(checkRelease(d).filter((x) => x.rule === 15), []);
  });

  test("15 and 6: the Simplified list of each herb file", () => {
    const d = copy();
    const key = firstShard(d);
    const m = manifest(d) as unknown as { variants: { "zh-Hans": { herbs: { index: unknown; shards: Record<string, unknown> } } } };
    delete m.variants["zh-Hans"].herbs.shards[key];
    saveManifest(d, m);
    assert.match(messages(checkRelease(d, { draftLabel: true }).filter((x) => x.rule === 6)), new RegExp(`no Simplified display list "herbs-${key}"`));

    const none = copy();
    const mm = manifest(none) as unknown as { variants: { "zh-Hans": { herbs?: unknown } } };
    delete mm.variants["zh-Hans"].herbs;
    saveManifest(none, mm);
    assert.match(messages(checkRelease(none, { draftLabel: true }).filter((x) => x.rule === 6)), /the herb browser but no Simplified display lists for it/);
  });

  test("11: the files of the herb browser are cached as immutable", () => {
    const d = copy();
    const index = (manifest(d) as unknown as { herbBrowser: { index: { file: string } } }).herbBrowser.index.file;
    writeFileSync(join(d, "_headers"), readFileSync(join(d, "_headers"), "utf8").replace(new RegExp(`/kb/${index.replace(".", "\\.")}\\n  Cache-Control: [^\\n]*`), `/kb/${index}\n  Cache-Control: no-cache`));
    resync(d);
    assert.match(messages(checkRelease(d, { draftLabel: true }).filter((x) => x.rule === 11)), /the herb browser file \/kb\/herbs-index\.[0-9a-f]+\.json must be cached as immutable/);
  });

  test("16: the closed beta ships the book, a public build ships none, and both are clean", () => {
    const m = manifest(base) as unknown as { book?: { chapters: string[] } };
    assert.ok(m.book !== undefined && m.book.chapters.length === 12 && m.book.chapters[0] === "model");
    assert.equal((manifest(publicBase) as unknown as { book?: unknown }).book, undefined);
    assert.equal(readdirSync(join(publicBase, "kb")).filter((f) => f.startsWith("book.")).length, 0);
    assert.deepEqual(checkRelease(base, { draftLabel: true }).filter((f) => f.rule === 16), []);
    assert.deepEqual(checkRelease(publicBase).filter((f) => f.rule === 16), []);
  });

  test("16: a book file that is missing, altered, not content-hashed, over its budget or not listed", () => {
    const missing = copy();
    rmSync(join(missing, "kb", bookOf(missing).file));
    resync(missing);
    assert.match(messages(checkRelease(missing, { draftLabel: true }).filter((f) => f.rule === 16)), /manifest lists the book → book\.[0-9a-f]+\.json, which is not in the output/);

    const altered = copy();
    const f2 = join(altered, "kb", bookOf(altered).file);
    writeFileSync(f2, readFileSync(f2, "utf8").replace(/,/, ", "));
    resync(altered);
    assert.match(messages(checkRelease(altered, { draftLabel: true }).filter((f) => f.rule === 16)), /the SHA-256 differs from the manifest/);

    const unhashed = copy();
    const m = manifest(unhashed) as unknown as { book: { file: string } };
    const old = m.book.file;
    m.book.file = "book.json";
    writeFileSync(join(unhashed, "kb", "book.json"), readFileSync(join(unhashed, "kb", old)));
    rmSync(join(unhashed, "kb", old));
    saveManifest(unhashed, m);
    assert.match(messages(checkRelease(unhashed, { draftLabel: true }).filter((f) => f.rule === 16)), /is not a content-hashed book file/);

    const big = copy();
    editBook(big, (b) => { b.chapters[0].blocks.push({ kind: "code", text: noiseOf(9000) }); });
    assert.match(messages(checkRelease(big, { draftLabel: true }).filter((f) => f.rule === 16)), /exceeds the \d+ B budget of the book/);

    const stray = copy();
    writeFileSync(join(stray, "kb", "book.0123456789.json"), "{}");
    resync(stray);
    assert.match(messages(checkRelease(stray, { draftLabel: true }).filter((f) => f.rule === 16)), /kb\/book\.0123456789\.json is a book file the manifest does not list/);
  });

  test("16: a book that is not the one the manifest lists, or that quotes a citation the build does not ship", () => {
    const reordered = copy();
    editBook(reordered, (b) => { b.chapters.reverse(); });
    assert.match(messages(checkRelease(reordered, { draftLabel: true }).filter((f) => f.rule === 16)), /is not the book the manifest lists/);

    const simplified = copy();
    editBook(simplified, (b) => { b.lang = "zh-Hans"; });
    assert.match(messages(checkRelease(simplified, { draftLabel: true }).filter((f) => f.rule === 16)), /is not the book the manifest lists/);

    const unknown = copy();
    editBook(unknown, (b) => { const q = b.chapters[0].blocks.find((x: { kind: string }) => x.kind === "quote"); q.citation = "no-such-citation"; });
    assert.match(messages(checkRelease(unknown, { draftLabel: true }).filter((f) => f.rule === 16)), /the book's model: the quotation 「.+」 names the citation no-such-citation, which this build does not ship/);
  });

  test("16: a public build carries the book only once it is reviewed", () => {
    const d = copy();          // the closed-beta build, checked as a public one: the book is a draft
    assert.match(messages(checkRelease(d).filter((x) => x.rule === 16)), /the learning book is "draft": a public build carries it only once reviewed/);
    editBook(d, (b) => { b.status = "reviewed"; });
    assert.deepEqual(checkRelease(d).filter((x) => x.rule === 16), []);
  });

  test("11: the book is cached as immutable", () => {
    const d = copy();
    const file = bookOf(d).file;
    writeFileSync(join(d, "_headers"), readFileSync(join(d, "_headers"), "utf8").replace(new RegExp(`/kb/${file.replace(".", "\\.")}\\n  Cache-Control: [^\\n]*`), `/kb/${file}\n  Cache-Control: no-cache`));
    resync(d);
    assert.match(messages(checkRelease(d, { draftLabel: true }).filter((x) => x.rule === 11)), /the book \/kb\/book\.[0-9a-f]+\.json must be cached as immutable/);
  });
});

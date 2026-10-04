// check-release.ts must pass on a real release build and fail — with the right rule — on every seeded violation (R-03).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { checkRelease, type Failure } from "./check-release.ts";

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
const manifest = (dir: string): { chunks: Record<string, { file: string; sha256: string }>; schema: number } => JSON.parse(readFileSync(join(dir, "kb", "manifest.json"), "utf8"));
const saveManifest = (dir: string, m: unknown): void => writeFileSync(join(dir, "kb", "manifest.json"), JSON.stringify(m));

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
  saveManifest(dir, m);
}
const html = (dir: string, fn: (s: string) => string): void => writeFileSync(join(dir, "index.html"), fn(readFileSync(join(dir, "index.html"), "utf8")));
const entryJs = (dir: string): string => join(dir, readdirSync(join(dir, "assets")).filter((f) => f.endsWith(".js")).map((f) => `assets/${f}`).sort()[0]!);
const rules = (f: Failure[]): number[] => [...new Set(f.map((x) => x.rule))].sort();
const messages = (f: Failure[]): string => f.map((x) => x.message).join("\n");

describe("check-release", () => {
  test("a real release build passes with the closed-beta exception and fails only the review gate without it", () => {
    assert.deepEqual(checkRelease(base, { draftLabel: true }), []);
    const f = checkRelease(base);
    assert.deepEqual(rules(f), [8]);
    assert.match(messages(f), /not reviewed/);
  });

  test("reviewed content needs no exception", () => {
    const d = copy();
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
    writeFileSync(entryJs(a), `${readFileSync(entryJs(a), "utf8")}\n;"DEV · release";`);
    assert.deepEqual(rules(checkRelease(a, { draftLabel: true })), [2]);
    const b = copy();
    edit(b, "core", (c) => { c.config.note = "annotate_only"; });
    assert.deepEqual(rules(checkRelease(b, { draftLabel: true })), [2]);
    const c2 = copy();
    writeFileSync(entryJs(c2), `${readFileSync(entryJs(c2), "utf8")}\n;"Component catalogue";`);
    assert.deepEqual(rules(checkRelease(c2, { draftLabel: true })), [2]);
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

  test("10: the attribution notice is shipped and complete", () => {
    const missing = copy();
    rmSync(join(missing, "NOTICE.txt"));
    assert.match(messages(checkRelease(missing, { draftLabel: true })), /NOTICE\.txt is missing/);
    const gutted = copy();
    writeFileSync(join(gutted, "NOTICE.txt"), "TCM Self-Check");
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

  test("9: source maps", () => {
    const map = copy();
    writeFileSync(join(map, "assets", "index-abcdef12.js.map"), "{}");
    assert.match(messages(checkRelease(map, { draftLabel: true })), /source maps must not be served/);
    const comment = copy();
    writeFileSync(entryJs(comment), `${readFileSync(entryJs(comment), "utf8")}\n//# sourceMappingURL=index.js.map`);
    assert.match(messages(checkRelease(comment, { draftLabel: true })), /points to a source map/);
  });
});

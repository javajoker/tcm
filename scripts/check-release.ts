// Assertions on a BUILT release output (docs/release-process.md §4.1): the guard against shipping the dev profile, doses, tier-C formulas, herb records,
// internal provenance, a weak CSP or a stale knowledge base. A failure blocks the release; each rule has a seeded-violation test (check-release.test.ts).
//   node scripts/check-release.ts [--dist apps/web/dist] [--draft-label]      exit 0 = pass, 1 = failures (listed), 2 = usage error
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { reachOf } from "../packages/kb/src/bundle.ts";
import { chineseStrings, digestInput } from "../packages/kb/src/hans.ts";
import { SUPPORTED_SCHEMA_VERSION } from "../packages/kb/src/indexer.ts";
import type { CoreChunk, FormulasChunk, Manifest } from "../packages/kb/src/types.ts";
import { BUDGET_GZ } from "./bundle-data.ts";
import { cspHeader, IMMUTABLE, LANGUAGE_SEGMENTS } from "./deploy-files.ts";
import { parseHeaders, parseRedirects } from "./serve-dist.ts";
import { buildFacts, parseWorker } from "./sw-build.ts";

export interface Failure { readonly rule: number; readonly message: string }
export interface CheckOptions {
  /** A closed-beta exception with the draft label on (release process §4.1 item 8, content review §7). */
  readonly draftLabel?: boolean;
  /** Gzip budget of the initial JavaScript (release process §5). */
  readonly initialJsBudgetGz?: number;
  /** The date the build is checked on (default: today); the age of an emergency-number verification is measured against it. */
  readonly now?: Date;
}

/** The service worker is hand-written and small (offline design §3.4). */
export const SW_BUDGET_GZ = 10 * 1024;
/** The boot script is a few hundred bytes of logic; anything much bigger has pulled the application in. */
export const BOOT_BUDGET_GZ = 2 * 1024;
const read = (p: string): string => readFileSync(p, "utf8");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const rel = (dist: string, p: string): string => p.slice(dist.length + 1);

/** Field names that mean a dose or amount (rule 3). */
const DOSE_FIELDS = ["classical_amounts", "classical_amount", "typical_g", "dose_g_reference", "dose_references"];
/** Texts that exist only in dev builds (rule 2) — in the app: the profile badge, the component catalogue, the developer route and the pseudo-locales; in the knowledge base: the non-enforcing safety mode. */
const DEV_APP_MARKERS = ["DEV · ", "Component catalogue", "/_dev", "en-xa", "zh-xl"];
const DEV_KB_MARKERS = ["annotate_only"];
/** Population / condition cells that must always raise a blocking notice in a release configuration (rule 7, safety policy §2). */
const BLOCKING = [["population", "minor_under_18"], ["population", "pregnant"], ["population", "lactating"], ["condition", "red_flag_A"], ["condition", "red_flag_B"], ["condition", "serious_chronic_disease"]] as const;

export function checkRelease(distDir: string, opts: CheckOptions = {}): Failure[] {
  const dist = resolve(distDir);
  const out: Failure[] = [];
  const fail = (rule: number, message: string): void => { out.push({ rule, message }); };
  if (!existsSync(join(dist, "index.html"))) return [{ rule: 0, message: `${dist} has no index.html: build the release first (pnpm build)` }];

  const files = walk(dist);
  const html = read(join(dist, "index.html"));
  const js = files.filter((f) => f.endsWith(".js"));
  const kbFiles = files.filter((f) => rel(dist, f).startsWith("kb/") && f.endsWith(".json"));

  // ── the knowledge base: manifest, chunks, hashes, schema ─────────────────────────────────────────────
  const manifestPath = join(dist, "kb", "manifest.json");
  if (!existsSync(manifestPath)) { fail(6, "kb/manifest.json is missing"); return out; }
  const manifest = JSON.parse(read(manifestPath)) as Manifest;
  const chunkFiles = new Map<string, string>();               // chunk name → file path
  for (const [name, ref] of Object.entries(manifest.chunks)) {
    if (!ref) continue;
    const p = join(dist, "kb", ref.file);
    if (!existsSync(p)) { fail(6, `manifest lists ${name} → ${ref.file}, which is not in the output`); continue; }
    const bytes = readFileSync(p);
    if (createHash("sha256").update(bytes).digest("hex") !== ref.sha256) fail(6, `kb/${ref.file}: the SHA-256 differs from the manifest`);
    if (!new RegExp(`\\.[0-9a-f]{8,}\\.json$`).test(ref.file)) fail(5, `kb/${ref.file} is not content-hashed`);
    const budget = BUDGET_GZ[name as keyof typeof BUDGET_GZ];
    if (budget !== undefined && gzipSync(bytes).length > budget) fail(6, `kb/${ref.file}: ${gzipSync(bytes).length} B gzip exceeds the ${budget} B budget of the ${name} chunk`);
    chunkFiles.set(name, p);
  }
  if (manifest.schema !== SUPPORTED_SCHEMA_VERSION) fail(6, `the knowledge-base schema is ${manifest.schema}; this app supports ${SUPPORTED_SCHEMA_VERSION}`);

  // the Simplified-Chinese display lists (docs/post-mvp/design/simplified-chinese.md §5.1): present, hashed, within budget, and aligned with the chunks they ship with
  const hansLists = manifest.variants?.["zh-Hans"];
  if (hansLists === undefined) fail(6, "the manifest has no Simplified-Chinese display lists");
  const hansFiles: string[] = [];
  for (const name of ["main", "cities"] as const) {
    const ref = hansLists?.[name];
    if (ref === undefined) { if (hansLists !== undefined) fail(6, `the manifest has no Simplified display list "${name}"`); continue; }
    const p = join(dist, "kb", ref.file);
    hansFiles.push(ref.file);
    if (!existsSync(p)) { fail(6, `manifest lists the Simplified display list ${name} → ${ref.file}, which is not in the output`); continue; }
    const bytes = readFileSync(p);
    if (createHash("sha256").update(bytes).digest("hex") !== ref.sha256) fail(6, `kb/${ref.file}: the SHA-256 differs from the manifest`);
    if (!new RegExp(`^hans-${name}\\.[0-9a-f]{8,}\\.txt$`).test(ref.file)) fail(5, `kb/${ref.file} is not a content-hashed display list`);
    const budget = BUDGET_GZ[name === "main" ? "hansMain" : "hansCities"];
    if (gzipSync(bytes).length > budget) fail(6, `kb/${ref.file}: ${gzipSync(bytes).length} B gzip exceeds the ${budget} B budget of the Simplified ${name} list`);
    const roots = (names: string[]): unknown[] => names.filter((n) => chunkFiles.has(n)).map((n) => JSON.parse(read(chunkFiles.get(n)!)) as unknown);
    const list = chineseStrings(...(name === "main" ? roots(["core", "formulas", "citations", "guidance", "herbs"]) : roots(["cities"])));
    if (list.length !== ref.strings || createHash("sha256").update(digestInput(list)).digest("hex") !== ref.digest) fail(6, `kb/${ref.file}: the Simplified display list is not aligned with the Chinese strings of the chunks it ships with`);
    if (bytes.toString("utf8").split("\n").length !== ref.strings) fail(6, `kb/${ref.file}: the display list does not have ${ref.strings} lines`);
  }

  const corePath = chunkFiles.get("core");
  const core = corePath ? (JSON.parse(read(corePath)) as CoreChunk) : null;
  const formulas = chunkFiles.has("formulas") ? (JSON.parse(read(chunkFiles.get("formulas")!)) as FormulasChunk) : null;

  // 1 — the profile embedded in the build
  if (core === null) fail(1, "the core chunk is missing");
  else if (core.config.profileName !== "release") fail(1, `the knowledge base was built for the "${core.config.profileName}" profile, not "release"`);

  // 2 — nothing that exists only for development
  for (const f of [...js, join(dist, "index.html")]) for (const m of DEV_APP_MARKERS) if (read(f).includes(m)) fail(2, `${rel(dist, f)} contains the dev-only text "${m}"`);
  for (const f of kbFiles) for (const m of DEV_KB_MARKERS) if (read(f).includes(m)) fail(2, `${rel(dist, f)} contains the dev-only text "${m}"`);

  // 3 — no doses or amounts anywhere in the knowledge base (a dose field may exist only as null / empty)
  const dosesIn = (node: unknown, path: string, file: string): void => {
    if (Array.isArray(node)) { node.forEach((x, i) => dosesIn(x, `${path}[${i}]`, file)); return; }
    if (node === null || typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      if (DOSE_FIELDS.includes(k) && v !== null && !(Array.isArray(v) && v.length === 0) && !(typeof v === "object" && Object.keys(v as object).length === 0)) fail(3, `${file} carries the dose field "${k}" with a value at ${path}`);
      dosesIn(v, `${path}.${k}`, file);
    }
  };
  for (const f of kbFiles) dosesIn(JSON.parse(read(f)), "$", rel(dist, f));

  // 4 — no tier-C formulas, modifications or herb records unless the profile can reach the levels that use them
  if (core !== null) {
    const reach = reachOf(core.config.profile);
    if (formulas !== null) {
      for (const f of formulas.items) {
        if (f.tier === "C" && !reach.tierC) fail(4, `formula ${f.id} is tier C but this profile cannot reach tier C`);
        if (f.tier === "B" && !reach.tierB) fail(4, `formula ${f.id} is tier B but this profile cannot reach tier B`);
        if (f.modifications.length > 0 && !reach.modification) fail(4, `formula ${f.id} carries modifications but this profile cannot reach modification`);
      }
    }
    if (manifest.chunks.herbs && !reach.herbRecords) fail(4, "a herbs chunk is shipped although this profile cannot reach the levels that use herb records");
  }

  // 5 — the page: a strict CSP, no inline script, hashed assets
  const csp = /<meta[^>]+http-equiv="Content-Security-Policy"[^>]+content="([^"]*)"/i.exec(html)?.[1];
  if (csp === undefined) fail(5, "index.html has no Content-Security-Policy");
  else {
    for (const d of ["default-src 'self'", "script-src 'self'", "connect-src 'self'", "worker-src 'self'", "manifest-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) if (!csp.includes(d)) fail(5, `the CSP lacks "${d}"`);
    if (/unsafe-inline|unsafe-eval|\*/.test(csp)) fail(5, "the CSP allows inline or eval code or a wildcard");
  }
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) if (!/\bsrc=/.test(m[1]!)) fail(5, "index.html has an inline <script>");
  if (/https?:\/\//i.test(html.replace(/(?:href|src)="data:[^"]*"/g, ""))) fail(5, "index.html refers to an external address");
  for (const f of files.filter((x) => rel(dist, x).startsWith("assets/"))) if (!/-[A-Za-z0-9_-]{6,}\.[a-z0-9]+$/.test(f)) fail(5, `${rel(dist, f)} is not content-hashed`);
  // everything the page points to is in the output: scripts, styles, icons and the manifest with its own icons (a broken reference is a Lighthouse failure and a missing icon)
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
    const ref = m[1]!;
    if (ref.startsWith("//")) fail(5, `index.html refers to ${ref}, an address on another host`);
    else if (!existsSync(join(dist, ref))) fail(5, `index.html refers to ${ref}, which is not in the output`);
  }
  const manifestHref = /<link[^>]+rel="manifest"[^>]+href="([^"]+)"/i.exec(html)?.[1];
  if (manifestHref !== undefined && existsSync(join(dist, manifestHref))) {
    try {
      const wm = JSON.parse(read(join(dist, manifestHref))) as { icons?: { src: string }[] };
      for (const icon of wm.icons ?? []) if (!existsSync(join(dist, icon.src))) fail(5, `${manifestHref} lists the icon ${icon.src}, which is not in the output`);
    } catch { fail(5, `${manifestHref} is not valid JSON`); }
  }

  // 6 (cont.) — the initial JavaScript budget
  const initial = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((m) => join(dist, m[1]!.replace(/^\/+/, "")));
  const initialGz = initial.filter((f) => existsSync(f)).reduce((n, f) => n + gzipSync(readFileSync(f)).length, 0);
  const budget = opts.initialJsBudgetGz ?? 200 * 1024;
  if (initialGz > budget) fail(6, `the initial JavaScript is ${initialGz} B gzip, over the ${budget} B budget`);

  // 7 — the safety configuration is intact
  if (core !== null) {
    const cfg = core.config;
    for (const [dim, key] of BLOCKING) {
      const cell = (cfg.profile[dim] as Record<string, { notice: string; level: string }>)[key];
      if (!cell) fail(7, `the release config has no ${dim}.${key}`);
      else if (cell.notice !== "blocking_ack") fail(7, `${dim}.${key} no longer raises a blocking notice (it is "${cell.notice}")`);
    }
    if (cfg.resolution.flow !== "continue") fail(7, `the notice flow is "${cfg.resolution.flow}"; it must be "continue" (never a dead end)`);
    if (cfg.profile.safety_enforcement !== "suppress_hard") fail(7, `the release profile does not suppress hard-rule items (safety_enforcement = ${cfg.profile.safety_enforcement})`);
  }

  // 8 — review gates: unreviewed content needs the recorded closed-beta exception with the draft label on
  if (core !== null) {
    const unreviewed = core.params._meta.status !== "reviewed";
    if (opts.draftLabel) {
      // unreviewed content is not for search results: the closed beta must say noindex in the page and in robots.txt
      if (!/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html)) fail(8, "a closed beta (draft label on) must not be indexable: index.html has no noindex robots meta");
      const robots = existsSync(join(dist, "robots.txt")) ? read(join(dist, "robots.txt")) : "";
      if (!/^Disallow:\s*\/\s*$/m.test(robots)) fail(8, "a closed beta (draft label on) must not be indexable: robots.txt does not disallow everything");
    }
    if (unreviewed && !opts.draftLabel) fail(8, `the content is "${core.params._meta.status}" (not reviewed): a release needs the review records, or a recorded closed-beta exception with the draft label on (--draft-label / APP_DRAFT_LABEL=on)`);
  }

  // 12 — emergency numbers: a wrong number is a safety incident, so a public build ships only numbers a regional owner has verified, no older than 24 months, and the generic line for everyone else
  // (the closed beta may carry the draft rows, with the draft label and its own note on screen; docs/post-mvp/design/tap-tempo-and-regions.md §2.4)
  if (core !== null && !opts.draftLabel) {
    const now = (opts.now ?? new Date()).getTime();
    const regions = core.emergency.regions;
    if (!regions.some((r) => r.id === "OTHER")) fail(12, "the public build has no generic emergency region (OTHER): a person outside every listed region would be shown nothing");
    for (const r of regions) {
      if (r.id === "OTHER") { if (r.emergency.length > 0 || r.crisis.length > 0) fail(12, "the generic emergency region OTHER lists numbers"); continue; }
      if (r.verification === undefined) { fail(12, `the public build ships the emergency numbers of ${r.id} without a verification by a regional owner`); continue; }
      const months = Math.floor((now - Date.parse(r.verification.at)) / 86_400_000 / 30);
      if (!(months <= 24)) fail(12, `the emergency numbers of ${r.id} were verified ${Number.isFinite(months) ? `${months} months ago` : "on an unreadable date"}: a public build needs a verification no older than 24 months`);
    }
  }

  // 13 — the service worker (docs/post-mvp/design/offline-and-install.md §3.4): present, carrying exactly this build's files — none missing, none extra, none in the wrong list — and nothing external,
  // small, and not listing itself. Everything is recomputed here from the files of the output (scripts/sw-build.ts), never read back from the worker.
  if (!existsSync(join(dist, "sw.js"))) fail(13, "sw.js is missing: a release carries the service worker (pnpm build writes it)");
  else {
    const source = read(join(dist, "sw.js"));
    const carried = parseWorker(source);
    if (carried === null) fail(13, "sw.js does not start with the facts of the build (scripts/sw-build.ts)");
    else {
      const expected = buildFacts(dist, LANGUAGE_SEGMENTS);
      const lists: [string, readonly string[], readonly string[]][] = [["shell", carried.shell, expected.shell], ["knowledge", carried.knowledge.common, expected.knowledge.common], ["Simplified", carried.knowledge.hans, expected.knowledge.hans], ["language segments", carried.languages, expected.languages]];
      for (const [name, got, want] of lists) {
        const missing = want.filter((p) => !got.includes(p)), extra = got.filter((p) => !want.includes(p));
        if (missing.length > 0 || extra.length > 0 || got.length !== want.length) fail(13, `sw.js: its ${name} list is not the build's${missing.length > 0 ? ` (not listed: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", …" : ""})` : ""}${extra.length > 0 ? ` (listed but not in the build: ${extra.slice(0, 3).join(", ")}${extra.length > 3 ? ", …" : ""})` : ""}`);
      }
      if (carried.id !== expected.id) fail(13, "sw.js: the build id is not the hash of the build's files, so a changed file would not change the cache");
      if (!carried.shell.includes("/index.html")) fail(13, "sw.js: the shell does not hold /index.html, so the app could not start offline");
      if (carried.knowledge.hans.filter((p) => /^\/assets\/hans-[^/]+\.js$/.test(p)).length !== 1) fail(13, "sw.js: the Simplified list must hold exactly one lazy script, the Simplified catalogue (assets/hans-<hash>.js)");
      if ([...carried.shell, ...carried.knowledge.common, ...carried.knowledge.hans].includes("/sw.js")) fail(13, "sw.js lists itself");
    }
    if (/https?:\/\//i.test(source)) fail(13, "sw.js names an external address: the worker may touch only this origin");
    // the boot script (offline design §3.5): a file of its own that the page loads as a classic script, so that a start is counted even when the application's script cannot load
    if (!existsSync(join(dist, "boot.js"))) fail(13, "boot.js is missing: the boot guard counts failed starts and must not depend on the application's own script");
    else {
      if (!/<script src="\/boot\.js"><\/script>/.test(html)) fail(13, "index.html does not load /boot.js as a classic script");
      const boot = read(join(dist, "boot.js"));
      if (/https?:\/\//i.test(boot) || /\bimport\s*\(|\bfetch\s*\(/.test(boot)) fail(13, "boot.js reaches out: it must be self-contained");
      if (gzipSync(boot).length > BOOT_BUDGET_GZ) fail(13, `boot.js is ${gzipSync(boot).length} B gzip, over the ${BOOT_BUDGET_GZ} B budget`);
    }
    if (gzipSync(source).length > SW_BUDGET_GZ) fail(13, `sw.js is ${gzipSync(source).length} B gzip, over the ${SW_BUDGET_GZ} B budget: it is meant to be read in one sitting`);
  }

  // 14 — installability (offline design §3.6): a standalone manifest that opens the app at its root, with the icons a browser asks for — each there, of the size it says — and nothing that sends the person
  // elsewhere (no shortcuts, categories or related applications); an icon for iOS's Home Screen. Everything is read from the output.
  const manifestLink = /<link[^>]+rel="manifest"[^>]+href="([^"]+)"/i.exec(html)?.[1];
  if (manifestLink === undefined || !existsSync(join(dist, manifestLink.replace(/^\//, "")))) fail(14, "index.html does not link a web-app manifest that is in the output");
  else {
    type Icon = { src?: string; sizes?: string; type?: string; purpose?: string };
    let wm: { [k: string]: unknown; icons?: Icon[] } = {};
    try { wm = JSON.parse(read(join(dist, manifestLink.replace(/^\//, "")))); } catch { fail(14, `${manifestLink} is not valid JSON`); }
    for (const [key, want] of [["display", "standalone"], ["start_url", "/"], ["scope", "/"], ["id", "/"]] as const) if (wm[key] !== want) fail(14, `the manifest's ${key} is ${JSON.stringify(wm[key])}, expected ${JSON.stringify(want)}`);
    for (const key of ["name", "short_name", "lang"]) if (typeof wm[key] !== "string" || (wm[key] as string).length === 0) fail(14, `the manifest has no ${key}`);
    for (const key of ["theme_color", "background_color"]) if (typeof wm[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(wm[key] as string)) fail(14, `the manifest's ${key} is not a #rrggbb colour`);
    for (const key of ["shortcuts", "categories", "related_applications", "prefer_related_applications", "screenshots", "protocol_handlers", "file_handlers", "share_target"]) if (key in wm) fail(14, `the manifest has ${key}: the app asks for nothing beyond its icon and its window`);
    const icons = wm.icons ?? [];
    const pngSize = (file: string): string | null => { const b = readFileSync(file); return b.length >= 24 && b.subarray(1, 4).toString("latin1") === "PNG" ? `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` : null; };
    for (const icon of icons) {
      const file = join(dist, (icon.src ?? "").replace(/^\//, ""));
      if (!existsSync(file)) { fail(14, `the manifest lists the icon ${icon.src}, which is not in the output`); continue; }
      if (icon.type === "image/png" && pngSize(file) !== icon.sizes) fail(14, `the icon ${icon.src} is ${pngSize(file) ?? "not a PNG"}, the manifest says ${icon.sizes}`);
    }
    const has = (size: string, purpose: string): boolean => icons.some((i) => i.sizes === size && i.type === "image/png" && (i.purpose ?? "any") === purpose);
    for (const [size, purpose] of [["192x192", "any"], ["512x512", "any"], ["512x512", "maskable"]] as const) if (!has(size, purpose)) fail(14, `the manifest has no ${purpose} PNG icon of ${size}, which browsers ask for before they offer to install`);
  }
  const touch = /<link[^>]+rel="apple-touch-icon"[^>]+href="([^"]+)"/i.exec(html)?.[1];
  if (touch === undefined || !existsSync(join(dist, touch.replace(/^\//, "")))) fail(14, "index.html has no apple-touch-icon in the output: iOS needs one for \"Add to Home Screen\"");
  else { const b = readFileSync(join(dist, touch.replace(/^\//, ""))); if (b.length < 24 || b.readUInt32BE(16) < 180 || b.readUInt32BE(16) !== b.readUInt32BE(20)) fail(14, "the apple-touch-icon is not a square PNG of at least 180 px"); }

  // 10 — the attribution notice travels with the app: MIT-licensed material derived into the knowledge base requires its copyright and permission notice to be kept
  if (!existsSync(join(dist, "NOTICE.txt"))) fail(10, "NOTICE.txt is missing: the attribution notice must be shipped with the app");
  else {
    const notice = read(join(dist, "NOTICE.txt"));
    for (const needed of ["TCM-Library", "Permission is hereby granted", "Apache License", "GeoNames", "CC BY 4.0"]) if (!notice.includes(needed)) fail(10, `NOTICE.txt does not contain "${needed}"`);
  }

  // 11 — the files a static host needs: headers (CSP with frame-ancestors, nosniff, referrer, caching that names this build's chunks), the SPA fallback for every language, a real 404 page, security.txt
  for (const f of ["_headers", "_redirects", "404.html", ".well-known/security.txt"]) if (!existsSync(join(dist, f))) fail(11, `${f} is missing: the host needs it (scripts/deploy-files.ts)`);
  if (existsSync(join(dist, "_headers"))) {
    const rules = parseHeaders(read(join(dist, "_headers")));
    const all = rules.find((r) => r.pattern === "/*");
    const header = (name: string): string | undefined => all?.headers.find(([k]) => k.toLowerCase() === name)?.[1];
    if (header("content-security-policy") !== cspHeader()) fail(11, "_headers: the Content-Security-Policy is missing or is not the policy of the page plus frame-ancestors 'none'");
    if (header("x-content-type-options") !== "nosniff") fail(11, "_headers: X-Content-Type-Options: nosniff is missing");
    if (header("referrer-policy") !== "no-referrer") fail(11, "_headers: Referrer-Policy: no-referrer is missing");
    if (all?.headers.some(([k]) => k.toLowerCase() === "cache-control")) fail(11, "_headers: /* must not set Cache-Control (Cloudflare combines every matching rule)");
    const cache = (path: string): string | undefined => rules.find((r) => r.pattern === path)?.headers.find(([k]) => k.toLowerCase() === "cache-control")?.[1];
    if (cache("/assets/*") !== IMMUTABLE) fail(11, "_headers: /assets/* must be cached as immutable");
    if (cache("/kb/manifest.json") !== "no-cache") fail(11, "_headers: /kb/manifest.json must be revalidated (no-cache)");
    if (cache("/sw.js") !== "no-cache") fail(11, "_headers: /sw.js must be revalidated (no-cache): a worker the HTTP cache keeps is a worker that cannot be replaced");
    if (cache("/boot.js") !== "no-cache") fail(11, "_headers: /boot.js must be revalidated (no-cache): its name carries no hash");
    for (const [name, ref] of Object.entries(manifest.chunks)) if (ref && cache(`/kb/${ref.file}`) !== IMMUTABLE) fail(11, `_headers: the ${name} chunk /kb/${ref.file} must be cached as immutable`);
    for (const f of hansFiles) if (cache(`/kb/${f}`) !== IMMUTABLE) fail(11, `_headers: the Simplified display list /kb/${f} must be cached as immutable`);
  }
  if (existsSync(join(dist, "_redirects"))) {
    const redirects = parseRedirects(read(join(dist, "_redirects")));
    for (const l of LANGUAGE_SEGMENTS) if (!redirects.some((r) => r.from === `/${l}/*` && r.to === "/index.html" && r.status === 200)) fail(11, `_redirects: /${l}/* does not fall back to the app`);
    if (redirects.some((r) => r.from === "/*")) fail(11, "_redirects: a catch-all rewrite would hide the 404 for unknown languages");
  }
  if (existsSync(join(dist, ".well-known/security.txt"))) {
    const t = read(join(dist, ".well-known/security.txt"));
    const expires = /^Expires:\s*(\S+)$/m.exec(t)?.[1];
    if (!/^Contact:\s*\S+/m.test(t)) fail(11, "security.txt has no Contact");
    if (expires === undefined || Date.parse(expires) <= Date.now()) fail(11, "security.txt has no Expires or it is in the past");
  }

  // 9 — no source maps
  for (const f of files.filter((x) => x.endsWith(".map"))) fail(9, `${rel(dist, f)}: source maps must not be served`);
  for (const f of js) if (/\/\/# sourceMappingURL=/.test(read(f))) fail(9, `${rel(dist, f)} points to a source map`);
  return out;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dist = args.includes("--dist") ? args[args.indexOf("--dist") + 1] : join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "dist");
  if (!dist) { console.error("usage: node scripts/check-release.ts [--dist <dir>] [--draft-label]"); process.exit(2); }
  const draftLabel = args.includes("--draft-label") || process.env.APP_DRAFT_LABEL === "on";
  const failures = checkRelease(dist, { draftLabel });
  for (const f of failures) console.error(`✗ [${f.rule}] ${f.message}`);
  console.log(failures.length === 0 ? `check-release: ${resolve(dist)} passes${draftLabel ? " (closed-beta exception: draft label on)" : ""}` : `check-release: ${failures.length} failure(s)`);
  process.exit(failures.length === 0 ? 0 : 1);
}

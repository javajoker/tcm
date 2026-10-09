// What the service worker is told about its build (docs/post-mvp/design/offline-and-install.md §3.4). Pure functions over a build's output directory, used by the Vite plugin that writes
// `sw.js` (apps/web/vite.config.ts) and by `check-release`, which recomputes everything from the files it finds and refuses a worker whose lists are not exactly the build.
// Nothing here is typed by hand: a file is in the shell, in the knowledge base or in neither because of where it is and what it is called.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Build } from "../apps/web/src/sw/build.ts";

export type { Build };

/** Files that are never cached: the worker itself, the host's own files, the robots and security files and the 404 page. */
export const NEVER_CACHED = ["sw.js", "_headers", "_redirects", "404.html", "robots.txt"] as const;
export type Part = "shell" | "common" | "hans" | "never";

/**
 * Which list a file of the build belongs to (`path` has no leading slash). The Simplified display lists and the Simplified catalogue are fetched only for a person who reads Simplified
 * (about 43 KB the others do not download); the catalogue is the lazy chunk Vite names after its module, `hans-<hash>.js` — a rename would put it in the shell (harmless), and
 * `check-release` would say so. The reference for learners and practitioners and its display list are in no list, unless every reader reads with it; the course's files are in none.
 */
export function classify(path: string, referenceOffline = false): Part {
  if ((NEVER_CACHED as readonly string[]).includes(path) || path.startsWith(".well-known/")) return "never";
  // the study reference (PM-53, PM-54) is every reader's by default in a build that serves it to all (`dose_display: all`), so its copy is part of the offline copy; otherwise it is asked for by
  // those who declared a role only, and the worker leaves it to the network and the browser's cache: a general reader's offline copy then holds no amount and no formula beyond the release profile
  if (/^kb\/(hans-)?reference\.[0-9a-f]+\.(json|txt)$/.test(path)) return !referenceOffline ? "never" : path.startsWith("kb/hans-") ? "hans" : "common";
  // the course (PM-60): some 230 KB that most readers never open, so it is not part of the offline copy — a page read once stays in the browser's cache (immutable)
  if (/^kb\/course-[a-z0-9-]+\.[0-9a-f]+\.json$/.test(path)) return "never";
  if (path.startsWith("kb/hans-") || /^assets\/hans-[^/]+\.js$/.test(path)) return "hans";
  if (path.startsWith("kb/")) return "common";
  return "shell";
}

/** Every file under `dir`, as site-root-relative paths with `/`, sorted. */
export function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(dir, full).split(sep).join("/"));
    }
  };
  walk(dir);
  return out.sort();
}

/** Whether this build's offline copy holds the study reference: the build serves it to every reader by default (`dose_display: all` in the core chunk's profile), so the product must work offline with it. */
export function referenceOffline(dir: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, "kb", "manifest.json"), "utf8")) as { reference?: unknown; chunks: { core: { file: string } } };
    if (manifest.reference === undefined) return false;
    const core = JSON.parse(readFileSync(join(dir, "kb", manifest.chunks.core.file), "utf8")) as { config: { profile: { dose_display?: string } } };
    return core.config.profile.dose_display === "all";
  } catch {
    return false;
  }
}

/** A hash of the build's cached files (their names and their contents): a changed file is a changed id, so a new cache and a new `sw.js` for the browser to notice. */
export function buildId(dir: string, paths: readonly string[]): string {
  const h = createHash("sha256");
  for (const p of [...paths].sort()) h.update(`${p}\0${createHash("sha256").update(readFileSync(join(dir, p))).digest("hex")}\n`);
  return h.digest("hex").slice(0, 16);
}

/** The worker's view of the build in `dir` (which must not yet hold `sw.js`'s final form: it is never listed). */
export function buildFacts(dir: string, languages: readonly string[]): Build {
  const parts: Record<Part, string[]> = { shell: [], common: [], hans: [], never: [] };
  const offline = referenceOffline(dir);
  for (const f of filesUnder(dir)) parts[classify(f, offline)].push(`/${f}`);
  const cached = [...parts.shell, ...parts.common, ...parts.hans].map((p) => p.slice(1));
  return { id: buildId(dir, cached), shell: parts.shell, knowledge: { common: parts.common, hans: parts.hans }, languages: [...languages] };
}

const PRELUDE = "self.__TCM_BUILD__=";
/** `sw.js`: the build's facts on the first line, then the bundled worker. */
export const workerSource = (build: Build, code: string): string => `${PRELUDE}${JSON.stringify(build)};\n${code}`;
/** The facts a built `sw.js` carries (`null` when the file does not start the way `workerSource` writes it). */
export function parseWorker(source: string): Build | null {
  if (!source.startsWith(PRELUDE)) return null;
  const end = source.indexOf(";\n");
  if (end < 0) return null;
  try { return JSON.parse(source.slice(PRELUDE.length, end)) as Build; } catch { return null; }
}

/**
 * A worker that removes every offline copy and itself: it takes over at once, deletes the caches named `tcm-app-*`, takes its clients and reloads them from the network, then unregisters.
 * The development build serves it as `sw.js` (so a reviewer who once visited a release build never sees a stale preview) and `scripts/make-kill-sw.ts` writes it over a faulty worker
 * (release process §7). Self-contained: no import, nothing to bundle.
 */
export const killWorkerSource = (): string => `// A worker that removes the offline copy and itself (docs/post-mvp/design/offline-and-install.md §5).
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith("tcm-app-")) await caches.delete(name);
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: "window" });
    await self.registration.unregister();
    for (const client of windows) client.navigate(client.url).catch(() => {});
  })());
});
`;

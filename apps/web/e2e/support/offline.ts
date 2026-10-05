// Builds and servers for the offline scenarios (docs/post-mvp/design/offline-and-install.md §6): copies of the real release build with one change each, a worker that describes the copy, and a site
// whose build can be swapped under a running browser — the way a deployment and a rollback look to a person who has the app open.
import { expect, type Page } from "@playwright/test";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { servePages, type Pages } from "../../../../scripts/serve-dist.ts";
import { LANGUAGE_SEGMENTS } from "../../../../scripts/deploy-files.ts";
import { buildFacts, workerSource } from "../../../../scripts/sw-build.ts";

const made: string[] = [];
export const cleanUpBuilds = (): void => { for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true }); };

/** A copy of a build with `change` applied to its files, and a `sw.js` that describes the copy (a different build, as far as the browser can tell). */
export function variantOf(dist: string, change: (dir: string) => void): string {
  const dir = mkdtempSync(join(tmpdir(), "tcm-offline-"));
  made.push(dir);
  cpSync(dist, dir, { recursive: true });
  change(dir);
  const source = readFileSync(join(dir, "sw.js"), "utf8");
  writeFileSync(join(dir, "sw.js"), workerSource(buildFacts(dir, LANGUAGE_SEGMENTS), source.slice(source.indexOf(";\n") + 2)));
  return dir;
}

/** The same build with a marker the page can show: build "B" of a two-build rehearsal. */
export const markedBuild = (dist: string, marker: string): string => variantOf(dist, (dir) => {
  const html = readFileSync(join(dir, "index.html"), "utf8");
  writeFileSync(join(dir, "index.html"), html.replace("<head>", `<head>\n    <meta name="tcm-rehearsal" content="${marker}" />`));
});

/**
 * A build whose application cannot start. `throws`: the application's script is replaced by a module that throws. `missing`: it points at a script the host no longer has (a deploy removed it while the
 * person's offline copy still names it). The replacement has a name of its own, so that the browser's HTTP cache cannot serve the good file under the old one. The boot script, a file of its own, is untouched.
 */
export const brokenBuild = (dist: string, how: "throws" | "missing"): string => variantOf(dist, (dir) => {
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const app = /<script type="module"[^>]*src="(\/assets\/[^"]+)"/.exec(html)?.[1];
  expect(app, "the page loads the application as a module script").toBeDefined();
  expect(html, "the release page loads the boot script").toContain('<script src="/boot.js"></script>');
  if (how === "throws") writeFileSync(join(dir, "assets", "broken-abcdef123.js"), 'throw new Error("this build cannot start");\n');
  writeFileSync(join(dir, "index.html"), html.replace(app!, "/assets/broken-abcdef123.js"));
  expect(how === "throws" ? readdirSync(join(dir, "assets")) : []).toEqual(how === "throws" ? expect.arrayContaining(["broken-abcdef123.js"]) : []);
});

/** One origin whose build can be replaced while a page stays open on it: `serve(dir)` stops the server and starts another on the same port. */
export class Site {
  private pages: Pages | null = null;
  readonly port: number;
  constructor(port: number) { this.port = port; }
  async serve(dir: string): Promise<void> { await this.stop(); this.pages = await servePages(dir, this.port); }
  async stop(): Promise<void> { await this.pages?.close(); this.pages = null; }
}

/** Run something in the page, again if the page navigates under it (an update reloads it: a poll for the new state must not stumble on the old page going away). */
export async function inPage<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await run(); } catch (error) {
      if (attempt >= 20 || !/context was destroyed|navigat|Target closed/i.test(String(error))) throw error;
      await new Promise((r) => setTimeout(r, 150));
    }
  }
}

/** The names of the offline copies (it only lists: opening a cache that was just deleted would make an empty one, and a test must not change what it looks at). */
export const cacheNames = (page: Page): Promise<string[]> => inPage(() => page.evaluate(async () => (await caches.keys()).filter((n) => n.startsWith("tcm-app-"))));

/** The paths held by the offline copies of this application, per cache. */
export const cachesOf = (page: Page): Promise<Record<string, string[]>> => inPage(() => page.evaluate(async () => {
  const out: Record<string, string[]> = {};
  for (const name of await caches.keys()) {
    if (!name.startsWith("tcm-app-") || !(await caches.has(name))) continue;
    out[name] = (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname).sort();
  }
  return out;
}));

/** Ask the browser to look for a newer worker now (it also does so on every navigation). */
export const checkForUpdate = (page: Page): Promise<void> => inPage(() => page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())?.update(); }));
export const registrations = (page: Page): Promise<number> => inPage(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length));
export const marker = (page: Page): Promise<string | null> => inPage(() => page.evaluate(() => document.querySelector('meta[name="tcm-rehearsal"]')?.getAttribute("content") ?? null));

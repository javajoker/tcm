// E22 offline use (docs/post-mvp/design/offline-and-install.md §6): after one visit the whole product works with the server gone — a whole assessment, the result, the history, the settings and
// the sources — and the offline copy holds only the files of the build. The scenario starts its own server (the project gives it a port of its own) so that it can stop it: request interception
// does not reach a service worker's own requests, and a stopped server is the real thing.
import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { servePages } from "../../../scripts/serve-dist.ts";
import { parseWorker } from "../../../scripts/sw-build.ts";
import { ADULT_MAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

const DIST = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

test.describe.configure({ mode: "serial" });

/** The paths held by the offline copies of this application. */
const cachedFiles = (page: Page): Promise<string[]> => page.evaluate(async () => {
  const out: string[] = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith("tcm-app-")) continue;
    for (const request of await (await caches.open(name)).keys()) out.push(new URL(request.url).pathname);
  }
  return out.sort();
});

test("E22: after one visit the whole product works with the server gone, and the offline copy holds only the build's files", async ({ app, page, baseURL, lang }) => {
  const build = parseWorker(readFileSync(join(DIST, "sw.js"), "utf8"));
  expect(build, "the build carries a service worker").not.toBeNull();
  const wanted = [...build!.shell, ...build!.knowledge.common, ...(lang === "zh-Hans" ? build!.knowledge.hans : [])].sort();

  const pages = await servePages(DIST, Number(new URL(baseURL!).port));
  try {
    await app.goto("/");
    await expect(app.heading("intake.landing.title")).toBeVisible();
    // the worker installs in the background once the page is idle, then keeps the knowledge files of the script in use
    await expect.poll(() => cachedFiles(page), { timeout: 45_000, intervals: [500] }).toEqual(wanted);
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state), { timeout: 15_000 }).toBe("activated");
  } finally {
    await pages.close();
  }

  // the network is gone: the origin does not answer at all
  await expect(page.evaluate(() => fetch("/kb/manifest.json", { cache: "no-store" }).then(() => "answered", () => "gone"))).resolves.toBe("answered");          // …except through the worker, which has it
  await page.reload();
  await expect(app.heading("intake.landing.title")).toBeVisible();

  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await expect(page.locator("#sec-summary")).toBeVisible();

  // every other screen, by loading its address (a navigation: the worker answers it with the app) and by moving within the app
  await app.goto("/history");
  await expect(app.heading("report.history.title")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(1);                                    // the result just saved is there
  await app.goto("/settings");
  await expect(app.heading("common.settings.title")).toBeVisible();
  await app.goto("/sources");
  await expect(app.heading("common.sources.title")).toBeVisible();

  // after a whole assessment the offline copy still holds exactly the build's files, nothing the person produced
  expect(await cachedFiles(page)).toEqual(wanted);

  // an address the app does not know is a real 404 from the network, not the app: the worker leaves it alone
  await expect(page.goto("/nothing/here")).rejects.toThrow();
});

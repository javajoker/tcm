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
import { brokenBuild, cacheNames, cachesOf, checkForUpdate, cleanUpBuilds, inPage, markedBuild, marker, registrations, Site } from "./support/offline.ts";
import { idbRecords } from "./support/storage.ts";

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
  // the Learn section, whose chunk the person never opened while online: its search and a page of it work from the offline copy (PM-13)
  await app.goto("/learn");
  await expect(app.heading("learn.title")).toBeVisible();
  await page.getByRole("combobox", { name: app.t("learn.search.label") }).fill(lang === "en" ? "yin yang" : lang === "zh-Hans" ? "阴阳" : "陰陽");
  await page.getByRole("listbox").getByRole("option").first().click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/terms/yin-yang$`));
  await expect(page.getByRole("region", { name: app.t("learn.term.meaning") })).toContainText("yīn yáng");

  // after a whole assessment the offline copy still holds exactly the build's files, nothing the person produced
  expect(await cachedFiles(page)).toEqual(wanted);

  // an address the app does not know is a real 404 from the network, not the app: the worker leaves it alone
  await expect(page.goto("/nothing/here")).rejects.toThrow();
});

test.afterAll(cleanUpBuilds);

/** Wait until the offline copy of the running build holds its shell and the knowledge files of the script in use. */
async function ready(page: Page, lang: string): Promise<void> {
  const build = parseWorker(readFileSync(join(DIST, "sw.js"), "utf8"))!;
  await expect.poll(async () => Object.values(await cachesOf(page)).some((paths) => build.knowledge.common.every((p) => paths.includes(p)) && (lang !== "zh-Hans" || build.knowledge.hans.every((p) => paths.includes(p)))), { timeout: 45_000, intervals: [500] }).toBe(true);
}

test("E22b: a new build waits until the person reloads, the draft survives, and a rollback is just another update", async ({ app, page, baseURL, lang, context }) => {
  const site = new Site(Number(new URL(baseURL!).port));
  const versionB = markedBuild(DIST, "B");
  try {
    await site.serve(DIST);                                           // build A, as deployed
    await app.start();
    await ready(page, lang);
    expect(await marker(page)).toBeNull();
    await app.fillProfile(ADULT_MAN);
    await app.screen();
    await app.continueScreening();
    await app.inquiry(typicalSymptoms("LG1"), { stopAfter: 3 });
    await expect.poll(async () => JSON.stringify(await idbRecords(page, "drafts"))).toContain("S_");
    await page.evaluate(() => { (window as unknown as { keptAlive: boolean }).keptAlive = true; });
    const before = page.url();

    // build B is deployed while the page is open: it installs beside A, the page is told, and nothing else happens
    await site.serve(versionB);
    await checkForUpdate(page);
    const reload = page.getByRole("button", { name: app.t("common.offline.update.reload"), exact: true });
    await expect(reload).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("status").filter({ hasText: app.t("common.offline.update.ready") })).toBeVisible();
    expect(Object.keys(await cachesOf(page))).toHaveLength(2);          // A is still the one running; B waits beside it
    expect(page.url()).toBe(before);
    expect(await page.evaluate(() => (window as unknown as { keptAlive?: boolean }).keptAlive)).toBe(true);             // the page was not reloaded under the person
    expect(await marker(page)).toBeNull();

    // the person chooses: build B loads, build A's copy is deleted, the draft is where it was left
    await reload.click();
    await expect.poll(() => marker(page), { timeout: 30_000 }).toBe("B");
    await expect.poll(async () => Object.keys(await cachesOf(page)).length, { timeout: 15_000 }).toBe(1);
    await app.goto("/");
    await expect(page.getByRole("heading", { level: 2, name: app.t("intake.landing.resume.title") })).toBeVisible();
    expect(JSON.stringify(await idbRecords(page, "drafts"))).toContain("S_");
    await ready(page, lang);

    // a rollback: the previous build is deployed again; its worker differs in bytes, so it installs like any other update
    await site.serve(DIST);
    await checkForUpdate(page);
    await expect(page.getByRole("button", { name: app.t("common.offline.update.reload"), exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: app.t("common.offline.update.reload"), exact: true }).click();
    await expect.poll(() => marker(page), { timeout: 30_000 }).toBeNull();
    await expect.poll(async () => Object.keys(await cachesOf(page)).length, { timeout: 15_000 }).toBe(1);
    await app.goto("/");
    await expect(page.getByRole("heading", { level: 2, name: app.t("intake.landing.resume.title") })).toBeVisible();          // still the same draft

    // …and a build nobody clicked for: closing the page lets it take over, so the next visit runs it
    await site.serve(versionB);
    await checkForUpdate(page);
    await expect(page.getByRole("button", { name: app.t("common.offline.update.reload"), exact: true })).toBeVisible({ timeout: 30_000 });
    await page.close();
    let seen: string | null = null;
    for (let attempt = 0; attempt < 8 && seen !== "B"; attempt++) {
      const next = await context.newPage();
      await next.goto(`/${lang}/`);
      seen = await marker(next);
      if (seen !== "B") { await next.close(); await new Promise((r) => setTimeout(r, 750)); }
    }
    expect(seen).toBe("B");
  } finally {
    await site.stop();
  }
});

test("E22c: Remove offline copy deletes the copy and the worker, and the next visit installs it again", async ({ app, page, baseURL, lang }) => {
  const site = new Site(Number(new URL(baseURL!).port));
  try {
    await site.serve(DIST);
    await app.goto("/settings");
    await expect(app.heading("common.settings.title")).toBeVisible();
    await ready(page, lang);
    await expect(page.getByRole("status").filter({ hasText: app.t("common.offline.status.ready") })).toBeVisible();
    await app.button("common.offline.remove").click();
    await expect(page.getByRole("status").filter({ hasText: app.t("common.offline.status.removed") })).toBeVisible();
    await expect.poll(async () => ({ copies: (await cacheNames(page)).length, workers: await registrations(page) })).toEqual({ copies: 0, workers: 0 });
    await expect(app.button("common.offline.remove")).toHaveCount(0);
    // the next visit installs it again
    await app.goto("/settings");
    await ready(page, lang);
    expect(await registrations(page)).toBe(1);
  } finally {
    await site.stop();
  }
});

for (const how of ["missing", "throws"] as const) {
  test(`E22d (${how}): a build whose application ${how === "missing" ? "script is gone" : "throws at start"} is dropped after two failed starts: the worker and its copy go, and the next load comes from the network`, async ({ app, page, baseURL, lang }) => {
    const site = new Site(Number(new URL(baseURL!).port));
    const broken = brokenBuild(DIST, how);
    try {
      await site.serve(DIST);
      await app.goto("/");
      await expect(app.heading("intake.landing.title")).toBeVisible();
      await ready(page, lang);
      await site.serve(broken);                                           // a faulty release is deployed…
      await checkForUpdate(page);
      const reload = page.getByRole("button", { name: app.t("common.offline.update.reload"), exact: true });
      await expect(reload).toBeVisible({ timeout: 30_000 });
      await reload.click();                                               // …and the person takes it
      // the first two starts fail: the page stays empty (the boot script counts them), the worker keeps serving the broken build
      const emptyPage = (): Promise<number> => inPage(() => page.evaluate(() => document.getElementById("root")?.childElementCount ?? -1));
      const starts = (): Promise<number> => inPage(() => page.evaluate(() => Number(localStorage.getItem("tcm.boot") ?? "0")));
      await expect.poll(emptyPage, { timeout: 20_000 }).toBe(0);
      await expect.poll(starts, { timeout: 20_000 }).toBe(1);
      await page.reload();
      await expect.poll(emptyPage, { timeout: 20_000 }).toBe(0);
      await expect.poll(starts, { timeout: 20_000 }).toBe(2);
      // the fix is deployed; the third start finds two failures behind it, drops the offline copy and loads from the network
      await site.serve(DIST);
      await page.reload();
      await expect(app.heading("intake.landing.title")).toBeVisible({ timeout: 30_000 });
      // …and the page is a good one that has rendered: the counter is clear, and it installs a fresh copy
      await expect.poll(() => inPage(() => page.evaluate(() => localStorage.getItem("tcm.boot"))), { timeout: 15_000 }).toBeNull();
      await ready(page, lang);
    } finally {
      await site.stop();
    }
  });
}

// E15 knowledge fetch failure and offline, E16 print view, E18 release bundle, E19 privacy, E20 storage blocked (docs/test-plan.md §5.1).
import { expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ADULT_MAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";
import { idbRecords } from "./support/storage.ts";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");

test("E15: when the knowledge base cannot be fetched there is an error with a retry, the answers are kept and nothing medical is shown; offline after the load a screen that has to be fetched fails safely", async ({ app, page, context, browserName }) => {
  await app.start();
  await app.fillProfile(ADULT_MAN);
  await app.screen();
  await app.continueScreening();
  await app.inquiry(typicalSymptoms("LG1"), { stopAfter: 3 });
  await expect.poll(async () => JSON.stringify(await idbRecords(page, "drafts"))).toContain("S_");           // the autosave has written what was answered
  // the next load fails
  await page.route("**/kb/**", (route) => route.abort());
  await page.reload();
  await expect(app.button("errors.kb.retry")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/Spleen|Lung qi|脾氣虛|肺氣虛|Formula|方劑/);       // no partial medical output
  // the connection comes back: retry, and the draft is where it was left
  await page.unroute("**/kb/**");
  await app.button("errors.kb.retry").click();
  await expect(page.locator("fieldset > legend[tabindex]").first()).toBeVisible();
  // Playwright's WebKit keeps a failed module fetch across the reload that follows, so the offline half is checked in Chromium only (the knowledge-base half above runs everywhere)
  if (browserName === "chromium") {
    // offline once the app is loaded: what is already on the page keeps working, a step that has to be fetched fails safely, and "Try again" brings it back
    await context.setOffline(true);
    await app.inquiry(typicalSymptoms("LG1"));                                                          // the questions are all in the page
    await expect(app.heading("errors.crash.title")).toBeVisible();                                      // the observation step was never fetched
    await expect(page.locator("main")).not.toContainText(/Spleen|Lung qi|脾氣虛|肺氣虛/);
    await context.setOffline(false);
    await expect.poll(() => page.evaluate(() => fetch("/", { cache: "no-store" }).then((r) => r.ok, () => false))).toBe(true);        // the browser sees the connection again
    await app.button("errors.crash.retry").click();
    await expect(page).toHaveURL(new RegExp(`/${app.lang}/observe$`));
    await app.toResult();
    await expect(page.locator("#sec-summary")).toBeVisible();
  }
});

test("E16: the print view has the panel as a table and a figure, the sources as footnotes and the disclaimer in the footer", async ({ app, page }) => {
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const sources = page.getByRole("region", { name: app.t("report.print.sources"), includeHidden: true });
  await expect(sources).toBeVisible();
  await expect(sources.getByRole("listitem").first()).toContainText("《");
  await expect(page.getByText(app.t("report.print.footer"), { exact: true }).first()).toBeVisible();
  // every table twin of a figure is open on paper
  expect(await page.locator("details:not([open])").count()).toBe(0);
  await expect(page.locator("#sec-panel table").first()).toBeVisible();
  // the screen furniture is gone
  await expect(page.getByRole("navigation", { name: app.t("report.nav.label") })).toBeHidden();
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
});

test("E18: the release build has no inspector route, no dose references, no tier C and passes check-release", async ({ app, page }, testInfo) => {
  await app.goto("/_dev");
  await expect(app.heading("common.notFound.title")).toBeVisible();                                    // the inspector is not in the release bundle
  await expect(page.getByText(/DEV · dev|DEV/)).toHaveCount(0);
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await expect(page.locator("main")).not.toContainText(/about \d+(\.\d+)? g\b|約 ?\d+(\.\d+)? ?克/);
  await expect(page.locator("main")).not.toContainText(app.t("report.advice.study"));                  // tier B and C formulas are not even in the data
  await page.locator("#sec-advice").getByRole("link", { name: /^(Open details|查看詳情)/ }).first().click();
  await expect(page.getByRole("columnheader", { name: app.t("formula.composition.col.amount") })).toHaveCount(0);    // and no amounts on a formula's own page
  await expect(page.locator("main")).not.toContainText(/about \d+(\.\d+)? g|約 ?\d+(\.\d+)? ?克/);
  if (testInfo.project.name === "release-desktop-en") {
    const out = execFileSync("node", ["../../scripts/check-release.ts", "--draft-label"], { cwd: WEB, encoding: "utf8" });
    expect(out).toContain("passes");
  }
});

test("E19: nothing leaves the device and no value the person typed shows up in a URL, the history or the console", async ({ app, page }) => {
  const requests: string[] = [];
  const consoleText: string[] = [];
  const navigations: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("console", (m) => consoleText.push(m.text()));
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });
  const MARKERS = ["xyzzy-nut", "1990-05-12", "marker-medicine"];
  await app.start();
  await app.fillProfile({ ...ADULT_MAN, medications: "none", allergies: { names: ["xyzzy-nut"] }, birth: { date: "1990-05-12", time: "14:30", city: "Taipei" } });
  await app.screen();
  await app.continueScreening();
  await app.inquiry(typicalSymptoms("SP1"));
  await app.toResult();
  const origin = new URL(page.url()).origin;
  expect(requests.filter((u) => !u.startsWith(origin) && !u.startsWith("data:") && !u.startsWith("blob:")), "requests to another origin").toEqual([]);
  for (const marker of MARKERS) {
    expect(requests.filter((u) => u.includes(marker)), `${marker} in a request URL`).toEqual([]);
    expect(navigations.filter((u) => u.includes(marker)), `${marker} in the history`).toEqual([]);
    expect(consoleText.filter((t) => t.includes(marker)), `${marker} in the console`).toEqual([]);
  }
  // birth data is not on the device unless the person chose to remember it: the saved result holds no birth moment, localStorage has none
  const stored = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("tcm-app"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = (name: string): Promise<unknown[]> => new Promise((res) => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => res(r.result); });
    return JSON.stringify({ a: await all("assessments"), d: await all("drafts"), l: { ...localStorage } });
  });
  expect(stored).not.toContain("1990-05-12");
  expect(stored).not.toContain('"year":1990');                                                           // neither the entered date nor the four pillars' birth moment
});

test("E20: with browser storage blocked the flow and the result still work and say they are not saved", async ({ app, page, context }) => {
  await context.addInitScript(() => {
    const deny = (): never => { throw new DOMException("blocked", "SecurityError"); };
    Object.defineProperty(window, "indexedDB", { configurable: true, get: deny });
    Object.defineProperty(window, "localStorage", { configurable: true, get: deny });
  });
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await expect(page.getByText(new RegExp(`^⚠?\\s*${app.t("report.notSaved")}$`)).first()).toBeVisible();
  await expect(page.locator("#sec-summary")).toBeVisible();
});

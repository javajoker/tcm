// E35 keeping a file up to date (docs/post-mvp/design/research-tracks.md §4; task PM-32), in Chrome — the browser that can choose a file to write — and its absence everywhere else: the card is there only where the
// browser can choose a file; setting it up writes an encrypted backup to the file; a change to the results writes it again; a visit later asks for the passphrase again and checks it against the file; the file
// of another device is merged before anything is written; and a write that fails leaves the file as it was, says why, and is tried again on a click. The picker is the browser's own native dialog, which a test
// cannot press, so it is replaced by one that opens a file of the browser's private file system: the same file-handle API (`createWritable`, permissions), the same structured clone into IndexedDB.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type Page } from "@playwright/test";
import { ADULT_MAN, App } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import type { Lang } from "./support/i18n.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

test.setTimeout(300_000);

const FILE = "tcm-backup.encrypted.json";
const PASS = "a long enough passphrase";

/** In the page, before anything of the app runs: a save picker that opens the file by that name in the private file system, and a switch that makes the next write fail the way the browser would raise it. */
const PICKER = (): void => {
  const w = window as unknown as { showSaveFilePicker: unknown; __failNext: string | null; __picked: number };
  w.__picked = 0;
  w.__failNext = null;
  w.showSaveFilePicker = async (options: { suggestedName: string }) => { w.__picked += 1; return (await navigator.storage.getDirectory()).getFileHandle(options.suggestedName, { create: true }); };
  const create = FileSystemFileHandle.prototype.createWritable;
  FileSystemFileHandle.prototype.createWritable = async function (this: FileSystemFileHandle, ...args: Parameters<FileSystemFileHandle["createWritable"]>) {
    const name = w.__failNext;
    if (name !== null) { w.__failNext = null; throw new DOMException("injected by the test", name); }
    return create.apply(this, args);
  };
};

const readFile = (page: Page, name: string): Promise<string> => page.evaluate(async (n) => {
  try { return await (await (await (await navigator.storage.getDirectory()).getFileHandle(n)).getFile()).text(); } catch { return ""; }
}, name);
const writeFile = (page: Page, name: string, text: string): Promise<void> => page.evaluate(async ({ n, t }) => {
  const writable = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
  await writable.write(t);
  await writable.close();
}, { n: name, t: text });

const nav = (app: App, page: Page, key: "common.nav.history" | "common.nav.settings") => page.getByRole("navigation", { name: app.t("common.nav.menu") }).getByRole("link", { name: app.t(key), exact: true });
const cardOf = (app: App, page: Page) => page.getByRole("region", { name: app.t("common.sync.title"), exact: true });

/** Set it up from Settings: the passphrase twice, then the file. */
async function setUp(app: App, page: Page): Promise<void> {
  const card = cardOf(app, page);
  await card.getByRole("button", { name: app.t("common.sync.setup"), exact: true }).click();
  const dialog = page.getByRole("dialog", { name: app.t("common.sync.setup.title") });
  await dialog.getByLabel(app.t("common.backup.passphrase.label"), { exact: true }).fill(PASS);
  await dialog.getByLabel(app.t("common.backup.passphrase.again"), { exact: true }).fill(PASS);
  await dialog.getByRole("button", { name: app.t("common.sync.setup.choose"), exact: true }).click();
}
const idle = (app: App, page: Page) => expect(cardOf(app, page).getByRole("status").first()).toContainText(app.t("common.sync.state.idle", { name: FILE }), { timeout: 60_000 });

/** A second device: a browser context of its own, with its own storage and its own private file system. */
async function device(browser: Browser, lang: Lang): Promise<{ page: Page; app: App; close: () => Promise<void> }> {
  const use = test.info().project.use as { baseURL?: string; locale?: string; timezoneId?: string; viewport?: { width: number; height: number } | null };
  const context = await browser.newContext({
    ...(use.baseURL !== undefined ? { baseURL: use.baseURL } : {}), ...(use.locale !== undefined ? { locale: use.locale } : {}), ...(use.timezoneId !== undefined ? { timezoneId: use.timezoneId } : {}),
    ...(use.viewport ? { viewport: use.viewport } : {}), serviceWorkers: "block",
  });
  await context.addInitScript(PICKER);
  const page = await context.newPage();
  return { page, app: new App(page, lang), close: () => context.close() };
}

test("E35: the card is there only where the browser can choose a file to write, and so is its row of what is stored", async ({ app, page }) => {
  await app.goto("/settings");
  await expect(app.heading("common.settings.title")).toBeVisible();
  const can = await page.evaluate(() => typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function");
  await expect(cardOf(app, page)).toHaveCount(can ? 1 : 0);
  await expect(page.getByText(app.t("common.settings.privacy.sync"), { exact: true })).toHaveCount(can ? 1 : 0);
  if (can) await app.simplified("settings with the sync card");
});

test("E35: set up, the first write, a write after a change, and a visit later that asks for the passphrase again and checks it against the file", async ({ app, page, browserName }) => {
  test.skip(browserName !== "chromium", "only Chromium can choose a file to write");
  await page.addInitScript(PICKER);
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await nav(app, page, "common.nav.settings").click();                                                       // within the page: nothing is lost
  const card = cardOf(app, page);
  await expect(card).toBeVisible();
  await app.simplified("settings with the sync card");
  await setUp(app, page);
  await idle(app, page);
  expect(await page.evaluate(() => (window as unknown as { __picked: number }).__picked)).toBe(1);
  const first = await readFile(page, FILE);
  expect(JSON.parse(first)["format"]).toBe("tcm-backup-encrypted");
  expect(Object.keys(JSON.parse(first)).sort(), "nothing but the envelope is readable: the rest is ciphertext").toEqual(["cipher", "ciphertext", "compression", "createdAt", "format", "kdf", "version"]);

  // a change to the results is written, a few seconds later
  await nav(app, page, "common.nav.history").click();
  await page.getByRole("button", { name: new RegExp(`^${app.t("report.history.deleteLabel", { when: "@@" }).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("@@", ".*")}$`) }).click();
  await expect.poll(() => readFile(page, FILE), { timeout: 60_000 }).not.toBe(first);
  const second = await readFile(page, FILE);
  expect(JSON.parse(second)["format"]).toBe("tcm-backup-encrypted");

  // a visit later: the file is remembered, the passphrase is asked for again, and a slip cannot change the file
  await app.goto("/settings");
  const again = cardOf(app, page);
  await expect(again.getByRole("status").first()).toContainText(app.t("common.sync.state.passphrase", { name: FILE }), { timeout: 20_000 });
  await again.getByLabel(app.t("common.sync.passphrase.label"), { exact: true }).fill("a different passphrase, by mistake");
  await again.getByRole("button", { name: app.t("common.sync.unlock"), exact: true }).click();
  await expect(again.getByRole("alert")).toContainText(app.t("common.sync.failure.passphrase"), { timeout: 60_000 });
  expect(await readFile(page, FILE)).toBe(second);
  await again.getByLabel(app.t("common.sync.passphrase.label"), { exact: true }).fill(PASS);
  await again.getByRole("button", { name: app.t("common.sync.unlock"), exact: true }).click();
  await idle(app, page);

  // stopping forgets the file and leaves it where it is
  await again.getByRole("button", { name: app.t("common.sync.stop"), exact: true }).click();
  await expect(again.getByRole("button", { name: app.t("common.sync.setup"), exact: true })).toBeVisible();
  expect((await readFile(page, FILE)).length).toBeGreaterThan(0);
});

test("E35: the file of another device is merged before anything is written, and then both histories are in both places", async ({ app, page, browser, browserName, lang }) => {
  test.skip(browserName !== "chromium", "only Chromium can choose a file to write");
  await page.addInitScript(PICKER);
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await nav(app, page, "common.nav.settings").click();
  await setUp(app, page);
  await idle(app, page);
  const theirs = await readFile(page, FILE);

  const other = await device(browser, lang);
  try {
    await other.app.flow(ADULT_MAN, typicalSymptoms("SP1"));                                                   // this device has a result of its own
    await writeFile(other.page, FILE, theirs);                                                               // the folder has been synchronised: the first device's file is here
    await nav(other.app, other.page, "common.nav.settings").click();
    await setUp(other.app, other.page);
    const card = cardOf(other.app, other.page);
    await expect(card.getByRole("status").first()).toContainText(other.app.t("common.sync.state.merge", { name: FILE }), { timeout: 60_000 });
    expect(await readFile(other.page, FILE)).toBe(theirs);                                                   // never overwritten silently
    await card.getByRole("button", { name: other.app.t("common.sync.merge"), exact: true }).click();
    const dialog = other.page.getByRole("dialog", { name: other.app.t("common.sync.merge.title") });
    await expect(dialog).toContainText(other.app.t("common.sync.merge.intro", { name: FILE }));
    await dialog.getByRole("button", { name: other.app.t("common.sync.merge.action"), exact: true }).click();
    await idle(other.app, other.page);
    expect(await readFile(other.page, FILE)).not.toBe(theirs);                                               // now it holds both
    await other.app.goto("/history");
    await expect(other.page.getByRole("checkbox")).toHaveCount(2);
  } finally {
    await other.close();
  }
});

test("E35: a write that fails leaves the file as it was, says why in words, and is tried again on a click", async ({ app, page, browserName }) => {
  test.skip(browserName !== "chromium", "only Chromium can choose a file to write");
  await page.addInitScript(PICKER);
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await nav(app, page, "common.nav.settings").click();
  await setUp(app, page);
  await idle(app, page);
  const was = await readFile(page, FILE);
  const card = cardOf(app, page);
  await page.evaluate(() => { (window as unknown as { __failNext: string }).__failNext = "NoModificationAllowedError"; });       // another program holds the file
  await card.getByRole("button", { name: app.t("common.sync.now"), exact: true }).click();
  await expect(card.getByRole("alert")).toContainText(app.t("common.sync.failure.locked"), { timeout: 60_000 });
  await expect(card.getByRole("status").first()).toContainText(app.t("common.sync.state.error", { name: FILE }));
  expect(await readFile(page, FILE)).toBe(was);
  await card.getByRole("button", { name: app.t("common.sync.retry"), exact: true }).click();
  await idle(app, page);
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test(`the card and its setup dialog (${scheme})`, async ({ app, page, browserName }) => {
      test.skip(browserName !== "chromium", "only Chromium can choose a file to write");
      await page.addInitScript(PICKER);
      await app.goto("/settings");
      await expect(cardOf(app, page)).toBeVisible();
      const scan = async (where: string): Promise<void> => {
        const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        expect(violations.map((v) => `${where}: ${v.id} (${v.impact}) — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), where).toEqual([]);
      };
      await scan(`settings with the sync card (${scheme})`);
      await cardOf(app, page).getByRole("button", { name: app.t("common.sync.setup"), exact: true }).click();
      await expect(page.getByRole("dialog", { name: app.t("common.sync.setup.title") })).toBeVisible();
      await scan(`sync setup dialog (${scheme})`);
    });
  });
}

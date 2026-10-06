// E30 the local data lock (docs/post-mvp/design/backup-and-data-lock.md §5, §7; task PM-20), in real browsers with the real key derivation: after a whole assessment the person turns the lock on and the raw
// IndexedDB — read from the page — holds nothing of the history; Lock now, a reload and the wrong passphrases (and the wait after five) keep it shut; the right one opens it where it was; the passphrase is
// changed and the lock turned off; the idle time locks by itself; and a forgotten passphrase is a way out through Erase.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { ADULT_WOMAN, type App } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";
import { idbRecords } from "./support/storage.ts";

test.setTimeout(300_000);

const PASS = "correct horse battery staple";
const OTHER = "another long passphrase 42";
const ALLERGY = "ZZQX-ALLERGY";
const MARKERS = [ALLERGY, "findings", "verdict", "ageYears", "allergies", "kbVersion", "recommendations", "S_FATIGUE"];

const stored = async (page: Page): Promise<string> => JSON.stringify([await idbRecords(page, "drafts"), await idbRecords(page, "assessments"), await idbRecords(page, "meta")]);

async function turnOn(app: App, page: Page, passphrase = PASS): Promise<void> {
  await app.goto("/settings");
  const card = page.getByRole("region", { name: app.t("lock.card.title"), exact: true });
  await card.getByRole("button", { name: app.t("lock.card.enable"), exact: true }).click();
  const dialog = page.getByRole("dialog", { name: app.t("lock.enable.title"), exact: true });
  await expect(dialog.getByText(app.t("lock.enable.lost"))).toBeVisible();
  await dialog.getByLabel(app.t("common.backup.passphrase.label"), { exact: true }).fill(passphrase);
  await dialog.getByLabel(app.t("common.backup.passphrase.again"), { exact: true }).fill(passphrase);
  await dialog.getByRole("checkbox", { name: new RegExp(app.t("lock.enable.backup.skip").slice(0, 18)) }).check({ force: true });
  await dialog.getByRole("button", { name: app.t("lock.enable.action"), exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect(card.getByRole("button", { name: app.t("lock.card.now"), exact: true })).toBeVisible();
}

async function unlock(app: App, page: Page, passphrase = PASS): Promise<void> {
  await page.getByLabel(app.t("lock.screen.label"), { exact: true }).fill(passphrase);
  await page.getByRole("button", { name: app.t("lock.screen.unlock"), exact: true }).click();
}

async function axeClean(page: Page, where: string): Promise<void> {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`), `${where} (${scheme})`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

test("E30: turn the lock on and the raw store holds nothing of the history; lock, reload, wrong passphrases and the wait; unlock where it was; change the passphrase; turn it off", async ({ app, page, lang }) => {
  await app.flow({ ...ADULT_WOMAN, allergies: { names: [ALLERGY] } }, typicalSymptoms("SP1"));
  const before = await stored(page);
  for (const m of [ALLERGY, "ageYears", "findings"]) expect(before, `the scan can see ${m}`).toContain(m);

  await turnOn(app, page);
  await app.simplified("settings with the lock on");
  const after = await stored(page);
  for (const m of MARKERS) expect(after, `the raw store still shows ${m}`).not.toContain(m);
  expect(after).toContain('"keyId"');                                                  // the lock record is there, and holds no secret
  expect(after).not.toContain(PASS);
  expect(await page.evaluate(() => localStorage.getItem("tcm.lockHint"))).toBe("1");
  expect(await page.evaluate(() => Object.entries(localStorage).map(([k, v]) => `${k}=${v}`).join("\n"))).not.toContain(ALLERGY);

  // the history still opens while the key is in memory (moving inside the app; loading a page again would lock it)
  await page.getByRole("navigation", { name: app.t("common.nav.menu") }).getByRole("link", { name: app.t("common.nav.history"), exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  expect(new URL(page.url()).pathname).toBe(`/${lang}/history`);

  // Lock now: the lock screen replaces the app, and a reload does not open it
  await page.getByRole("navigation", { name: app.t("common.nav.menu") }).getByRole("button", { name: app.t("lock.menu.lock"), exact: true }).click();
  await expect(app.heading("lock.screen.title")).toBeVisible();
  await app.simplified("lock screen");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await axeClean(page, "lock screen");
  await page.reload();
  await expect(app.heading("lock.screen.title")).toBeVisible();
  await expect(page.getByRole("navigation", { name: app.t("common.nav.menu") })).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(ALLERGY);
  expect(new URL(page.url()).pathname).toBe(`/${lang}/history`);

  // five wrong passphrases, then the wait; the right one is not even looked at during it
  for (let i = 0; i < 5; i++) {
    await unlock(app, page, `wrong passphrase ${i}`);
    await expect(page.getByLabel(app.t("lock.screen.label"), { exact: true })).toBeEnabled({ timeout: 30_000 });          // the try has finished (the field is shut while it is made)
    if (i < 4) await expect(page.getByText(app.t("lock.screen.wrong"))).toBeVisible();
  }
  await page.getByLabel(app.t("lock.screen.label"), { exact: true }).fill(PASS);
  await expect(page.getByRole("button", { name: app.t("lock.screen.unlock"), exact: true })).toBeDisabled();
  await expect(page.getByText(app.t("lock.screen.wait.note"))).toBeVisible();
  await expect(page.getByRole("button", { name: app.t("lock.screen.unlock"), exact: true })).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByRole("status").filter({ hasText: app.t("lock.screen.wait.over") })).toHaveCount(1);       // the end of the wait is said, politely
  await page.getByRole("button", { name: app.t("lock.screen.unlock"), exact: true }).click();
  await expect(page.getByRole("checkbox")).toHaveCount(1, { timeout: 60_000 });                      // the history is back, where it was
  expect(new URL(page.url()).pathname).toBe(`/${lang}/history`);

  // change the passphrase: the old one no longer opens it, the new one does
  await page.getByRole("navigation", { name: app.t("common.nav.menu") }).getByRole("link", { name: app.t("common.nav.settings"), exact: true }).click();
  const card = page.getByRole("region", { name: app.t("lock.card.title"), exact: true });
  await card.getByRole("button", { name: app.t("lock.card.change"), exact: true }).click();
  const dialog = page.getByRole("dialog", { name: app.t("lock.change.title"), exact: true });
  await dialog.getByLabel(app.t("lock.change.current"), { exact: true }).fill(PASS);
  await dialog.getByLabel(app.t("lock.change.new"), { exact: true }).fill(OTHER);
  await dialog.getByLabel(app.t("common.backup.passphrase.again"), { exact: true }).fill(OTHER);
  await dialog.getByRole("button", { name: app.t("lock.change.action"), exact: true }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect(page.getByText(app.t("lock.card.done.changed"))).toBeVisible();
  expect(await stored(page)).not.toContain(ALLERGY);
  await page.getByRole("navigation", { name: app.t("common.nav.menu") }).getByRole("button", { name: app.t("lock.menu.lock"), exact: true }).click();
  await expect(app.heading("lock.screen.title")).toBeVisible();
  await unlock(app, page, PASS);
  await expect(page.getByText(app.t("lock.screen.wrong"))).toBeVisible();
  await unlock(app, page, OTHER);
  await expect(page.getByRole("region", { name: app.t("lock.card.title"), exact: true })).toBeVisible({ timeout: 60_000 });

  // turn it off: the right passphrase is asked again, and the history is plain again
  await page.getByRole("region", { name: app.t("lock.card.title"), exact: true }).getByRole("button", { name: app.t("lock.card.disable"), exact: true }).click();
  const off = page.getByRole("dialog", { name: app.t("lock.disable.title"), exact: true });
  await off.getByLabel(app.t("common.backup.passphrase.label"), { exact: true }).fill(PASS);              // the old one: refused
  await off.getByRole("button", { name: app.t("lock.disable.action"), exact: true }).click();
  await expect(off.getByRole("alert")).toBeVisible({ timeout: 60_000 });
  await off.getByLabel(app.t("common.backup.passphrase.label"), { exact: true }).fill(OTHER);
  await off.getByRole("button", { name: app.t("lock.disable.action"), exact: true }).click();
  await expect(off).toBeHidden({ timeout: 60_000 });
  await expect(page.getByText(app.t("lock.card.done.off"))).toBeVisible();
  const plain = await stored(page);
  expect(plain).toContain(ALLERGY);
  expect(plain).not.toContain('"keyId"');
  expect(await page.evaluate(() => localStorage.getItem("tcm.lockHint"))).toBeNull();
  await page.reload();
  await expect(page.getByRole("region", { name: app.t("lock.card.title"), exact: true }).getByRole("button", { name: app.t("lock.card.enable"), exact: true })).toBeVisible();
});

test("E30: the idle time locks by itself, and a touch starts the wait again", async ({ app, page }) => {
  await app.flow(ADULT_WOMAN, typicalSymptoms("SP1"));
  await turnOn(app, page);
  const card = page.getByRole("region", { name: app.t("lock.card.title"), exact: true });
  await card.getByLabel(app.t("lock.card.idle.label"), { exact: true }).selectOption("5");
  await expect(card.getByText(app.t("lock.card.on", { minutes: app.plural("lock.card.idle", 5) }))).toBeVisible();
  // from here on the clock is the test's: the lock screen after a reload, the passphrase, and then five minutes
  await page.clock.install({ time: Date.now() });
  await app.goto("/history");
  await expect(app.heading("lock.screen.title")).toBeVisible();
  await unlock(app, page);
  await expect(page.getByRole("checkbox")).toHaveCount(1, { timeout: 60_000 });
  await page.clock.fastForward("04:00");
  await expect(page.getByRole("checkbox")).toHaveCount(1);                              // four minutes: still open
  await page.mouse.click(5, 5);                                                       // a touch
  await page.clock.fastForward("04:00");
  await expect(page.getByRole("checkbox")).toHaveCount(1);                              // eight in all, four since the touch
  await page.clock.fastForward("02:00");
  await expect(app.heading("lock.screen.title")).toBeVisible({ timeout: 30_000 });     // six since the touch: locked, and the page loaded again
  await expect(page.getByRole("heading", { name: app.t("report.history.title"), exact: true })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("E30: a forgotten passphrase is a way out through Erase, and the app starts again empty", async ({ app, page }) => {
  await app.flow(ADULT_WOMAN, typicalSymptoms("SP1"));
  await turnOn(app, page);
  await page.getByRole("navigation", { name: app.t("common.nav.menu") }).getByRole("button", { name: app.t("lock.menu.lock"), exact: true }).click();
  await expect(app.heading("lock.screen.title")).toBeVisible();
  await expect(page.getByText(app.t("lock.screen.forgot.body"))).toBeVisible();
  await page.getByRole("button", { name: app.t("lock.screen.erase"), exact: true }).click();
  const dialog = page.getByRole("dialog", { name: app.t("common.settings.erase.title"), exact: true });
  await dialog.getByRole("button", { name: app.t("common.settings.erase.confirm"), exact: true }).click();
  await expect(page).toHaveURL(/\/zh-Hant\/$/, { timeout: 30_000 });                       // erased: the language is the default again
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("tcm.lockHint"))).toBeNull();
  expect((await idbRecords(page, "assessments")).length).toBe(0);
  expect((await idbRecords(page, "meta")).length).toBe(0);
  await page.goto("/zh-Hant/history");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("E30: the dialogs of the Settings card have no axe violations in either colour scheme", async ({ app, page }) => {
  await app.goto("/settings");
  await axeClean(page, "settings");
  const card = page.getByRole("region", { name: app.t("lock.card.title"), exact: true });
  await card.getByRole("button", { name: app.t("lock.card.enable"), exact: true }).click();
  await expect(page.getByRole("dialog", { name: app.t("lock.enable.title"), exact: true })).toBeVisible();
  await app.simplified("enable dialog");
  await axeClean(page, "turn the lock on");
});

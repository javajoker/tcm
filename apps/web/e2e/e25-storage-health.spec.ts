// E25 storage health (docs/post-mvp/design/backup-and-data-lock.md §4): Settings says where the data lives and why it can disappear; the browser is asked to keep it only when the person presses the
// button — never on its own, and not before a result is saved.
import { expect } from "@playwright/test";
import { ADULT_MAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

declare global { interface Window { __persistAsked?: number } }

test("E25: the browser is asked to keep the data only on a click, after the first saved result; the explanation is always there", async ({ app, page }) => {
  // count the requests to keep the data, and let the browser answer "not kept" so the button is offered
  await page.addInitScript(() => {
    const storage = navigator.storage;
    if (!storage) return;
    window.__persistAsked = 0;
    Object.defineProperty(storage, "persisted", { value: () => Promise.resolve(false), configurable: true });
    Object.defineProperty(storage, "persist", { value: () => { window.__persistAsked = (window.__persistAsked ?? 0) + 1; return Promise.resolve(false); }, configurable: true });
  });
  await app.goto("/settings");
  const card = page.locator("#settings-data");
  await expect(card.getByRole("heading", { name: app.t("common.health.why.title") })).toBeVisible();
  for (const key of ["private", "idle", "cleared", "other"]) await expect(card).toContainText(app.t(`common.health.why.${key}`));
  await expect(card).toContainText(app.t("common.health.notPersisted"));
  await expect(card.getByRole("button", { name: app.t("common.health.ask"), exact: true })).toHaveCount(0);            // nothing is saved yet

  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await app.goto("/settings");
  const ask = page.locator("#settings-data").getByRole("button", { name: app.t("common.health.ask"), exact: true });
  await expect(ask).toBeVisible();
  expect(await page.evaluate(() => window.__persistAsked ?? 0), "nothing was asked by itself").toBe(0);
  await ask.click();
  await expect.poll(() => page.evaluate(() => window.__persistAsked ?? 0)).toBe(1);
  await expect(page.locator("#settings-data")).toContainText(app.t("common.health.ask.denied"));
});

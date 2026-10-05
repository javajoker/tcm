// E23 installation (docs/post-mvp/design/offline-and-install.md §3.6): the browser's offer is held until the person asks for it in Settings — nothing is offered on a first visit, and the app
// never shows its own dialog by itself. The offer is simulated with the event a Chromium-family browser fires.
import { expect } from "@playwright/test";
import { test } from "./support/fixtures.ts";

declare global { interface Window { __installPrompts?: number } }

test("E23: the browser's install offer is held back, shown only as a button in Settings, and used only when the person presses it", async ({ app, page }) => {
  await app.goto("/");
  await expect(app.heading("intake.landing.title")).toBeVisible();
  expect(await page.getByRole("button", { name: app.t("common.install.action"), exact: true }).count()).toBe(0);        // nothing on a first visit

  // the browser makes its offer (a Chromium-family browser does, once it judges the app installable)
  const held = await page.evaluate(() => {
    const offer = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: () => { window.__installPrompts = (window.__installPrompts ?? 0) + 1; return Promise.resolve(); },
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    window.dispatchEvent(offer);
    return offer.defaultPrevented;
  });
  expect(held, "the browser's own install bar is not shown").toBe(true);
  expect(await page.getByRole("button", { name: app.t("common.install.action"), exact: true }).count()).toBe(0);        // still nothing: the offer waits for the person
  expect(await page.evaluate(() => window.__installPrompts ?? 0)).toBe(0);

  await app.link("common.nav.settings").click();                                                                         // within the page: the held offer is still there
  await expect(app.heading("common.settings.title")).toBeVisible();
  const card = page.locator("#settings-install");
  await expect(card).toContainText(app.t("common.install.hint"));
  await expect(card).toContainText(app.t("common.install.how"));                                                          // the same words for every browser
  expect(await page.evaluate(() => window.__installPrompts ?? 0)).toBe(0);
  await card.getByRole("button", { name: app.t("common.install.action"), exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__installPrompts ?? 0)).toBe(1);
  await expect(card.getByRole("status")).toContainText(app.t("common.install.status.accepted"));
  await expect(card.getByRole("button")).toHaveCount(0);                                                                  // the offer was used
});

test("E23b: without an offer, Settings still says how to install, in words, with no button", async ({ app, page }) => {
  await app.goto("/settings");
  const card = page.locator("#settings-install");
  await expect(card).toBeVisible();
  await expect(card).toContainText(app.t("common.install.how"));
  await expect(card.getByRole("button")).toHaveCount(0);
});

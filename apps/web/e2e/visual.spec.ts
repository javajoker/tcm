// Visual regression (docs/test-plan.md §1, Q-07): the key screens in zh-Hant, en and the pseudo-locale en-XA, at 320 and 1280 px (the two projects `visual-320` and `visual-1280`, dev build).
// One walk through the flow in English builds the state; each screen is then shown in the three languages by changing the language segment of its URL (the draft and the saved result are on the
// device, so the same data is behind every picture). The clock is fixed so dates are the same on every run. Baselines: `pnpm --filter @tcm/web e2e:visual --update-snapshots`, see docs/test-plan.md.
import { expect, type Page } from "@playwright/test";
import { ADULT_WOMAN, App } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

const LANGS = ["zh-Hant", "en", "en-XA"] as const;
const NOW = new Date("2026-10-04T12:00:00+08:00");

/** The route of the current page without its language segment. */
const routeOf = (page: Page): string => new URL(page.url()).pathname.replace(/^\/(zh-Hant|en-XA|en)/, "") || "/";

async function shoot(page: Page, name: string, opts: { fullPage?: boolean } = {}): Promise<void> {
  const route = routeOf(page);
  const hash = new URL(page.url()).hash;
  for (const lang of LANGS) {
    await page.goto(`/${lang}${route}${hash}`);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await expect(page, `${name} (${lang})`).toHaveScreenshot(`${name}-${lang}.png`, { fullPage: opts.fullPage ?? true });
  }
  await page.goto(`/en${route}${hash}`);
  await page.waitForLoadState("networkidle");
}

/** A screen whose state lives in the page (a wizard step): shown in English and, with the language toggle, in Chinese; the pseudo-locale has no toggle. */
async function shootStateful(page: Page, name: string): Promise<void> {
  await expect(page, `${name} (en)`).toHaveScreenshot(`${name}-en.png`, { fullPage: true });
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await expect(page, `${name} (zh-Hant)`).toHaveScreenshot(`${name}-zh-Hant.png`, { fullPage: true });
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

test("the key screens, in three languages", async ({ page, lang }) => {
  test.setTimeout(300_000);
  await page.clock.setFixedTime(NOW);
  const app = new App(page, lang);
  await app.goto("/");
  await shoot(page, "01-landing");
  await app.start();
  await app.fillProfile({ ...ADULT_WOMAN, birth: { date: "1990-05-12", time: "14:30", city: "Taipei" } });
  await page.goto("/en/start");
  await shoot(page, "02-profile");
  await app.fillProfile(ADULT_WOMAN).catch(() => undefined);
  await expect(page).toHaveURL(/\/en\/screen$/);
  await shoot(page, "03-screening");
  await app.screen();
  await app.continueScreening();
  await app.inquiry(typicalSymptoms("SP1"), { stopAfter: 4 });
  await shoot(page, "04-inquiry-question");
  await app.inquiry(typicalSymptoms("SP1"));
  await expect(page).toHaveURL(/\/en\/observe$/);
  await shoot(page, "05-observation-hub");
  await page.locator("#observe-tongue").getByRole("link", { name: app.t("observe.hub.start") }).click();
  for (let step = 0; step < 4; step++) await app.button("observe.next").click();
  await shootStateful(page, "06-tongue-zones");
  await app.button("observe.done").click();
  await page.locator("#observe-pulse").getByRole("link", { name: app.t("observe.hub.start") }).click();
  await shoot(page, "07-pulse");
  await app.goto("/observe");
  await page.getByRole("button", { name: new RegExp(`^(${app.t("observe.hub.skip")}|${app.t("observe.hub.continue")})$`) }).click();
  await shoot(page, "08-review");
  await app.button("intake.review.run").click();
  await expect(app.heading("report.title")).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await shoot(page, "09-result");
  await page.locator("#sec-advice").getByRole("link", { name: /^Open details/ }).first().click();
  await shoot(page, "10-formula");
  await app.goto("/history");
  await shoot(page, "11-history");
  await app.goto("/settings");
  await shoot(page, "12-settings");
  await app.goto("/sources");
  await shoot(page, "13-sources");
  await app.goto("/no-such-page");
  await shoot(page, "14-not-found");
});

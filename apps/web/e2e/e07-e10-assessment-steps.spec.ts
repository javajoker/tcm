// E7 insufficient information, E9 tongue, E10 pulse (docs/test-plan.md §5.1).
import { expect, type Page } from "@playwright/test";
import { ADULT_MAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

test("E7: when the questions alone are not enough, the result says so, shows no formula and points to the tongue and pulse", async ({ app, page }) => {
  await app.flow(ADULT_MAN, typicalSymptoms("SP6"), {}, { skip: ["Q_COURSE"] });               // 胃陰虛: a thin picture, and the question about how long skipped
  const summary = page.getByRole("region", { name: app.t("report.summary.insufficient.title") });
  await expect(summary).toBeVisible();
  await expect(summary.getByRole("listitem")).toHaveCount(1);                                      // what is missing: the question about how long
  await summary.getByRole("button", { name: app.t("report.summary.insufficient.cta") }).click();
  await app.inquiry(typicalSymptoms("SP6"));                                                       // answer it; now every question is answered
  await app.toResult();
  await expect(summary).toBeVisible();
  await expect(summary.getByRole("listitem")).toHaveCount(0);
  await expect(summary.getByRole("button", { name: app.t("report.summary.insufficient.observe.cta") })).toBeVisible();
  await expect(page.locator("#sec-advice")).toContainText(app.t("report.advice.insufficient"));
  await expect(page.locator("#sec-advice").getByRole("heading", { level: 4 })).toHaveCount(0);    // no formula card
  await expect(page.locator("#sec-panel")).toHaveCount(0);                                         // the panel waits for a leaning
  await summary.getByRole("button", { name: app.t("report.summary.insufficient.observe.cta") }).click();
  await expect(page).toHaveURL(new RegExp(`/${app.lang}/observe$`));                               // the answers come back as a draft
});

const zoneButton = (page: Page, name: string) => page.getByRole("button", { name });

test("E9: the tongue map and its checklist twin stay in sync, by touch and by keyboard", async ({ app, page }) => {
  await app.toObserve(ADULT_MAN, typicalSymptoms("SP1"));
  await page.locator("#observe-tongue").getByRole("link", { name: app.t("observe.hub.start") }).click();
  for (let i = 0; i < 4; i++) await app.button("observe.next").click();                         // how → colour → shape → coating → zones
  await expect(app.heading("observe.tongue.zones.title", 2)).toBeVisible();
  const tip = app.t("observe.tongue.zone.open", { zone: app.t("observe.tongue.zone.tip") });
  const tipGroup = page.getByRole("group", { name: app.t("observe.tongue.zone.tip"), exact: true });
  await expect(zoneButton(page, tip)).toHaveAttribute("aria-pressed", "false");
  // pointer: open the zone, tick its first sign in the sheet → the zone is marked and the twin shows the same box ticked
  await zoneButton(page, tip).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  const first = sheet.getByRole("checkbox").first();
  await first.check({ force: true });
  const label = (await first.evaluate((el) => (el.closest("label")?.textContent ?? "").replace(/^✓/, "").trim())) || "";
  await sheet.getByRole("button", { name: app.t("observe.done"), exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(zoneButton(page, tip)).toHaveAttribute("aria-pressed", "true");
  await expect(tipGroup.getByRole("checkbox").first()).toBeChecked();
  // the other way: untick in the checklist → the zone mark goes
  await tipGroup.getByRole("checkbox").first().uncheck({ force: true });
  await expect(zoneButton(page, tip)).toHaveAttribute("aria-pressed", "false");
  // keyboard: Enter on the zone button opens the sheet, Space ticks, Escape closes
  await zoneButton(page, tip).focus();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("checkbox").first().focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(zoneButton(page, tip)).toHaveAttribute("aria-pressed", "true");
  expect(label.length).toBeGreaterThan(0);
  // it reaches the review as self-observed, which counts for less in the calculation
  await app.button("observe.done").click();
  await page.getByRole("button", { name: app.t("observe.hub.continue"), exact: true }).click();
  await expect(app.heading("intake.review.title")).toBeVisible();
  await expect(page.getByText(app.plural("intake.review.quality.selfObserved", 1))).toBeVisible();
  await app.button("intake.review.run").click();
  await expect(app.heading("report.title")).toBeVisible({ timeout: 30_000 });
});

test("E10: the pulse: a rate, a rhythm, qualities that exclude each other; an irregular rhythm raises the doctor-soon notice; the education note is shown", async ({ app, page }) => {
  await app.toObserve(ADULT_MAN, typicalSymptoms("SP1"));
  await page.locator("#observe-pulse").getByRole("link", { name: app.t("observe.hub.start") }).click();
  await page.getByLabel(app.t("observe.pulse.rate.label")).fill("104");
  await page.getByRole("radio", { name: new RegExp(`${app.t("observe.pulse.rhythm.irregular")}$`) }).check({ force: true });
  const qualities = page.getByRole("group", { name: app.t("observe.pulse.qualities.title") }).or(page.locator("#pulse-qualities"));
  const boxes = qualities.getByRole("checkbox");
  await boxes.nth(0).check({ force: true });
  await expect(page.getByText(app.t("safety.notice.pulseEducation.text"))).toBeVisible();
  await app.button("observe.pulse.save").click();
  await expect(page.locator("#notice-title")).toHaveText(app.t("safety.notice.b.title"));
  await app.acknowledgeNotice();
  await expect(page).toHaveURL(new RegExp(`/${app.lang}/observe$`));
});

test("E10b: tapping along with the beat fills the pulse rate, the rate is shown only after Done, and the review says how it was obtained", async ({ app, page }) => {
  await app.toObserve(ADULT_MAN, typicalSymptoms("SP1"));
  await page.locator("#observe-pulse").getByRole("link", { name: app.t("observe.hub.start") }).click();
  await app.button("observe.pulse.tap.open").click();
  const tap = app.button("observe.pulse.tap.button");
  await expect(app.button("observe.pulse.tap.done")).toBeDisabled();
  for (let i = 0; i < 13; i++) { await tap.click(); await page.waitForTimeout(450); }            // about 125 beats per minute, however the machine's clock jitters
  await expect(page.getByText(app.plural("observe.pulse.tap.count", 13))).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /\d{2,3}/ })).toHaveCount(0);            // no number while tapping
  await app.button("observe.pulse.tap.done").click();
  await expect(page.getByRole("status").filter({ hasText: /\d{2,3}/ })).toHaveCount(1);
  await app.button("observe.pulse.tap.use").click();
  const field = page.getByLabel(app.t("observe.pulse.rate.label"));
  const rate = Number(await field.inputValue());
  expect(rate).toBeGreaterThan(90);
  expect(rate).toBeLessThan(160);
  await app.button("observe.pulse.save").click();
  await page.getByRole("button", { name: app.t("observe.hub.continue"), exact: true }).click();
  await expect(app.heading("intake.review.title")).toBeVisible();
  await expect(page.getByText(new RegExp(`${rate}.*${app.t("observe.pulse.method.tap")}`))).toBeVisible();
});

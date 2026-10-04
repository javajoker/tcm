// E17 — the dev profile: the badge, everything open, blocking notices still acknowledged, suppressed items annotated instead of removed (docs/test-plan.md §5.1; tech spec §6).
import { expect } from "@playwright/test";
import { ADULT_MAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

test("E17: the dev profile shows its badge, opens everything, still stops at a blocking notice, and marks what a rule would remove", async ({ app, page }) => {
  await app.start();
  await expect(page.getByText(/^DEV\b/)).toBeVisible();                                                  // the badge says this is not a release
  // a blocking notice is acknowledged in dev too
  await app.fillProfile({ ...ADULT_MAN, medications: { classes: ["anticoagulant"] } });
  await app.screen(["RF_A_CHEST_PAIN"]);
  await app.continueScreening();
  await expect(page.locator("#notice-title")).toHaveText(app.t("safety.notice.a.title"));
  await app.acknowledgeNotice();
  await app.inquiry(typicalSymptoms("SP1"));
  await app.toResult();
  await expect(page.getByText(app.t("report.advice.formulasNone"))).toHaveCount(0);                      // dev opens L3: the formulas are shown although the situation would limit them
  await expect(page.locator("#sec-advice").getByRole("heading", { level: 4 }).first()).toBeVisible();
  await expect(page.locator("#sec-advice")).toContainText(/anticoagulant|抗凝/i);                         // the item a rule would remove is annotated, not removed
  await page.locator("#sec-advice").getByRole("link", { name: /^(Open details|查看詳情)/ }).first().click();
  await expect(page.getByRole("columnheader", { name: app.t("formula.composition.col.amount") })).toBeVisible();   // dose references are open
  await expect(page.locator("main")).toContainText(/about \d+(\.\d+)? g|約 ?\d+(\.\d+)? ?克/);
  // the inspector is there
  await app.goto("/_dev");
  await expect(page.getByRole("heading", { level: 1, name: "Developer inspector" })).toBeVisible();
});

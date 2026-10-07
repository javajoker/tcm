// E36 (release) — a release build shows no personalised prescription: its levels stop at L1 and it carries neither the herb records nor the card (PM-41).
import { expect } from "@playwright/test";
import { ADULT_MAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { msg } from "./support/i18n.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

test("E36: a release result's formula page has no modifications for this person and no quantities", async ({ app, page }) => {
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  const details = page.locator("#sec-advice").getByRole("link", { name: /^(Open details|查看詳情|查看详情)/ }).first();
  if (await details.count() > 0) {
    await details.click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  for (const lang of ["en", "zh-Hant", "zh-Hans"] as const) await expect(page.getByText(msg(lang, "rx.title"))).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/\d+(\.\d+)? g\b|\d+(\.\d+)? ?克/);
});

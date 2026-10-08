// E36 (release) — a general reader of a release build sees no personalised prescription: the levels of the general reader stop at L1 and the general bundle carries neither the herb records nor
// the card (PM-41). The study reference — which a build shows to every reader by default, PD-30 — is E41's.
import { expect } from "@playwright/test";
import { ADULT_MAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { msg } from "./support/i18n.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

test("E36: a general reader's formula page has no modifications for this person and no quantities", async ({ app, page }) => {
  await app.generalReader();
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  const details = page.locator("#sec-advice").getByRole("link", { name: /^(Open details|查看詳情|查看详情)/ }).first();
  if (await details.count() > 0) {
    await details.click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  for (const lang of ["en", "zh-Hant", "zh-Hans"] as const) for (const key of ["rx.title", "rx.title.study"]) await expect(page.getByText(msg(lang, key))).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/\d+(\.\d+)? g\b|\d+(\.\d+)? ?克/);
});

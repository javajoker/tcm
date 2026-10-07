// E36 — the personalised prescription (PM-41; docs/post-mvp/design/prescription-model.md §7): in the development profile, a result's first formula carries the modifications
// for this person and their quantities, for a practitioner's judgement, on its page and in the practitioner summary; what made each quantity is said beside it.
import { expect } from "@playwright/test";
import { ADULT_MAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

test("E36: the formula page and the practitioner summary show the modifications for this person, with grams and what adjusted them, as made when the result was saved", async ({ app, page }) => {
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await page.locator("#sec-advice").getByRole("link", { name: /^(Open details|查看詳情)/ }).first().click();
  const card = page.getByRole("region", { name: app.t("rx.title") });
  await expect(card).toBeVisible();
  await expect(card).toContainText(app.t("rx.draft"));
  const table = card.getByRole("table", { name: app.t("rx.table.caption") });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row").nth(1)).toContainText(/\d+(\.\d+)? (g|克)/);
  await expect(card).toContainText(app.t("rx.footer"));
  // the practitioner summary holds the same section
  const id = /\/result\/([^/]+)\/formula\//.exec(page.url())![1]!;
  await app.goto(`/result/${id}/summary`);
  await expect(page.getByRole("region", { name: app.t("rx.summary.title") })).toBeVisible();
});

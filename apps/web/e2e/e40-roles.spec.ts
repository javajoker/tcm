// E40 — learners and practitioners (PM-53; docs/post-mvp/design/prescription-model.md §7.4) in the roles-mode build (`APP_DOSE_DISPLAY=roles`, PD-30; the `roles-*` projects), in every language. A general reader's session never asks for the
// reference; a learner declares the role with the safety policy's attestation, the reference comes once, and a whole assessment ends at L3 — the result says it was made for a
// learner, the formula page shows the amounts and the medication plan for study and clinical reference. Back to a general reader, the header says nothing more.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { ADULT_MAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

async function axeClean(page: Page, where: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${where}: ${v.id} (${v.impact}) — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), where).toEqual([]);
}

test("E40: a general reader never fetches the reference; a learner attests, reads at L3 with the amounts and the medication plan, and can go back", async ({ app, page }) => {
  const reference: string[] = [];
  page.on("request", (r) => { if (/\/kb\/(hans-)?reference\./.test(r.url())) reference.push(new URL(r.url()).pathname); });

  // a general reader: the offer on the landing page, the card in Settings — and no reference asked for
  await app.goto("/");
  await expect(page.getByRole("region", { name: app.t("common.role.offer.title") })).toBeVisible();
  await app.goto("/settings");
  const card = page.getByRole("region", { name: app.t("common.settings.role.title") });
  await expect(card.getByRole("radio", { name: app.t("common.settings.role.general") })).toBeChecked();
  expect(reference, "a general reader's session asks for no reference").toEqual([]);

  // the attestation, then the role
  await card.getByRole("radio", { name: app.t("common.settings.role.learner") }).click({ force: true });       // it stays unchecked until the person attests
  const dialog = page.getByRole("dialog", { name: app.t("safety.notice.role.title") });
  await expect(dialog).toContainText(app.t("safety.notice.role.body"));
  await axeClean(page, "the attestation");
  await dialog.getByRole("button", { name: app.t("common.settings.role.confirm") }).click();
  await expect(page.getByTestId("role-on")).toContainText(app.t("common.role.chip.learner"));
  await axeClean(page, "Settings with a role");
  await expect.poll(() => reference.filter((p) => p.includes("/reference.")).length).toBe(1);

  // a whole assessment, at L3 (the flow begins with a fresh page: the reference comes once for it, and not again on the way)
  const before = reference.filter((p) => p.includes("/reference.")).length;
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await expect(page.getByTestId("result-role")).toContainText(app.t("report.role.made"));
  await expect(page.getByTestId("amounts-note")).toHaveCount(0);
  await page.locator("#sec-advice").getByRole("link", { name: /^(Open details|查看詳情|查看详情)/ }).first().click();
  await expect(page.getByRole("columnheader", { name: app.t("formula.composition.col.amount") })).toBeVisible();
  const plan = page.getByRole("region", { name: app.t("rx.title.study") });
  await expect(plan).toBeVisible();
  await expect(plan.getByRole("row").nth(1)).toContainText(/\d+(\.\d+)? (g|克)/);
  await expect(page.getByTestId("amounts-note").first()).toContainText(app.t("safety.notice.amounts.text"));
  expect(reference.filter((p) => p.includes("/reference.")).length, "the reference came once for the page").toBe(before + 1);

  // back to a general reader
  await app.goto("/settings");
  await page.getByRole("region", { name: app.t("common.settings.role.title") }).getByRole("radio", { name: app.t("common.settings.role.general") }).click({ force: true });
  await expect(page.getByTestId("role-on")).toHaveCount(0);
});

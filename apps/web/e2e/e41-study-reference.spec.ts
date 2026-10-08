// E41 — the study reference is every reader's by default (PD-30; PM-54): in the closed beta as it ships, a reader who has chosen nothing sees reference quantities, the classical modifications
// and the medication plan — each with the note that they are for study and as an aid to a practitioner only. Choosing General reader stops it for the results made from then on; results already
// made stay as they were. The safety layer is the same for everyone.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { ADULT_MAN, ADULT_WOMAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

async function axeClean(page: Page, where: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${where}: ${v.id} (${v.impact}) — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), where).toEqual([]);
}

test("E41: by default a reader sees the study reference with its note; a Learn formula page too; General reader stops it for new results, old ones stay", async ({ app, page }) => {
  const reference: string[] = [];
  page.on("request", (r) => { if (/\/kb\/reference\./.test(r.url())) reference.push(new URL(r.url()).pathname); });
  const note = app.t("safety.notice.amounts.text");

  // nothing is offered or asked: no offer on the landing page, no chip, the Settings card says it is on
  await app.goto("/");
  await expect(page.getByRole("region", { name: app.t("common.role.offer.title") })).toHaveCount(0);
  await app.goto("/settings");
  const card = page.getByRole("region", { name: app.t("common.settings.role.title") });
  await expect(card).toContainText(app.t("common.settings.role.default"));
  await expect(card.getByRole("radio", { name: app.t("common.settings.role.learner") })).toBeChecked();
  await expect(page.getByTestId("role-on")).toHaveCount(0);
  await axeClean(page, "Settings, the default");

  // Learn: a formula's page has its quantities and the note, and a formula only the study reference reaches has its page, with its caution first
  await app.goto("/learn/formulas/F_GUIZHI");
  await expect(page.getByRole("columnheader", { name: app.t("formula.composition.col.amount") })).toBeVisible();
  await expect(page.getByText(note)).toBeVisible();
  await app.goto("/learn/formulas/F_MAHUANG");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("region", { name: app.t("learn.page.cautions") })).toBeVisible();

  // a whole assessment: the result says it was made with the study reference, the formula page has the quantities and the plan, each with the note
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await expect(page.getByTestId("result-role")).toContainText(app.t("report.role.made"));
  const resultUrl = page.url();
  await page.locator("#sec-advice").getByRole("link", { name: /^(Open details|查看詳情|查看详情)/ }).first().click();
  await expect(page.getByRole("columnheader", { name: app.t("formula.composition.col.amount") })).toBeVisible();
  await expect(page.getByTestId("amounts-note")).toHaveCount(2);
  for (const n of await page.getByTestId("amounts-note").all()) await expect(n).toContainText(note);
  const plan = page.getByRole("region", { name: app.t("rx.title.study") });
  await expect(plan).toBeVisible();
  await expect(plan.getByRole("row").nth(1)).toContainText(/\d+(\.\d+)? (g|克)/);
  await axeClean(page, "the formula page with the plan");
  // …and the practitioner summary opens its plan with the note
  const id = /\/result\/([^/]+)\/formula\//.exec(page.url())![1]!;
  await app.goto(`/result/${id}/summary`);
  await expect(page.getByRole("region", { name: app.t("rx.title.study") })).toContainText(note);
  expect(reference.length, "the reference came once for each page load").toBeGreaterThan(0);

  // General reader: one switch; the next result has no quantities and no plan; the first one stays as it was made
  await app.generalReader();
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await expect(page.getByTestId("result-role")).toHaveCount(0);
  await page.locator("#sec-advice").getByRole("link", { name: /^(Open details|查看詳情|查看详情)/ }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("amounts-note")).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: app.t("formula.composition.col.amount") })).toHaveCount(0);
  await expect(page.getByRole("region", { name: app.t("rx.title.study") })).toHaveCount(0);
  await app.goto(`/result/${/\/result\/([^/]+)$/.exec(resultUrl)![1]!}`);
  await expect(page.getByTestId("result-role")).toBeVisible();
});

test("E41: the safety layer is the same for every reader — a pregnant reader gets the blocking notice and no quantities, by default too", async ({ app, page }) => {
  await app.start();
  await app.fillProfile({ ...ADULT_WOMAN, pregnancy: "yes" });
  await app.screen();
  await app.continueScreening();
  await app.acknowledgeNotice();
  await app.inquiry(typicalSymptoms("SP1"));
  await app.toResult();
  // (a pregnant reader's result is at L0: it has no formula to open)
  const details = page.locator("#sec-advice").getByRole("link", { name: /^(Open details|查看詳情|查看详情)/ });
  expect(await details.count(), "no formula is offered to a pregnant reader").toBe(0);
  await expect(page.getByTestId("amounts-note")).toHaveCount(0);
  await expect(page.getByTestId("result-role")).toHaveCount(0);                                     // the study reference gave this result nothing: pregnancy holds it at L0 for every reader
  await expect(page.locator("main")).not.toContainText(/\d+(\.\d+)? g\b|\d+(\.\d+)? ?克/);
});

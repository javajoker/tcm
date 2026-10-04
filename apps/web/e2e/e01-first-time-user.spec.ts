// E1 — First-time user, healthy adult, no birth data, full flow to the result (docs/test-plan.md §5.1).
import { ADULT_WOMAN } from "./support/app.ts";
import { expect, test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

test("E1: a first-time user goes from the disclaimer to a result in the release build", async ({ app, page }) => {
  await app.flow(ADULT_WOMAN, typicalSymptoms("SP1"));
  // the disclaimer acknowledgement is stored with the version of its wording
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("tcm.prefs") ?? "{}") as { disclaimerAck?: { version: string } });
  expect(prefs.disclaimerAck?.version).toBeTruthy();
  // the result: its sections in the order the person reads them, the confidence stated, the evidence against listed
  const ids = (await app.sectionIds()).filter((id) => !id.endsWith("-title"));
  expect(ids.slice(0, 6)).toEqual(["sec-banner", "sec-summary", "sec-panel", "sec-why", "sec-transmission", "sec-advice"]);
  await expect(page.locator("#sec-summary")).toContainText(new RegExp(`${app.t("report.summary.confidence")}[:：]?\\s*(${["high", "medium", "low"].map((k) => app.t(`report.confidence.${k}`)).join("|")})`));
  await expect(page.locator("#sec-advice").getByText(app.t("report.formula.notMatches")).first()).toBeVisible();       // what speaks against each formula
  // only what level L1 allows: tier A formulas with no amounts, diet and points; the draft label of a closed beta; no dev furniture
  await expect(page.locator("#sec-banner")).toContainText(app.t("safety.notice.draft.text"));
  await expect(page.locator("main")).not.toContainText(/about \d+(\.\d+)? g\b|約 ?\d+(\.\d+)? ?克/);
  await expect(page.getByText(/^DEV\b/)).toHaveCount(0);
  await expect(page.locator("#sec-advice").getByRole("heading", { name: app.t("report.advice.study") })).toHaveCount(0);
});

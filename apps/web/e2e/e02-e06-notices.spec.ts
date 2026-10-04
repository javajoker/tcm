// E2–E6 — the safety notices and what they take away from the result (docs/test-plan.md §5.1; safety policy §2).
import { ADULT_MAN, ADULT_WOMAN } from "./support/app.ts";
import { expect, test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

test("E2: an emergency sign gets a blocking notice, the flow continues, the result is limited to L0 and the notice stays on the result", async ({ app, page }) => {
  await app.start();
  await app.fillProfile(ADULT_MAN);
  await app.screen(["RF_A_CHEST_PAIN"]);
  await app.continueScreening();
  const title = page.locator("#notice-title");
  await expect(title).toHaveText(app.t("safety.notice.a.title"));
  await expect(title).toBeFocused();                                                  // a blocking notice takes focus (UX spec §8)
  await app.button("safety.action.showNumbers").click();
  await expect(page.getByText(/119/).first()).toBeVisible();                          // the default region's emergency number
  await app.acknowledgeNotice();
  await expect(page).toHaveURL(new RegExp(`/${app.lang}/inquiry$`));
  await app.inquiry(typicalSymptoms("SP1"));
  await app.toResult();
  const banner = page.locator("#sec-banner");
  await expect(banner).toContainText(app.t("safety.notice.a.title"));                  // recorded and collapsed on the result
  await expect(page.locator("#sec-advice")).toContainText(app.t("report.advice.formulasNone"));
  await expect(page.getByRole("heading", { name: app.t("report.advice.diet") })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: app.t("report.advice.points") })).toHaveCount(0);
  await expect(page.locator("#sec-advice")).toContainText(app.t("report.advice.lifestyle"));
});

test("E3: a doctor-soon sign and a minor give one merged notice, the more severe first, and L0", async ({ app, page }) => {
  await app.start();
  await app.fillProfile({ ...ADULT_MAN, age: 16 });
  await app.screen(["RF_B_HIGH_FEVER"]);
  await app.continueScreening();
  await expect(page.locator("#notice-title")).toHaveText(app.t("safety.notice.b.title"));
  const second = page.getByRole("heading", { name: app.t("safety.notice.minor.title") });
  await expect(second).toBeVisible();
  expect(await page.locator("#notice-title").boundingBox().then((b) => b!.y)).toBeLessThan(await second.boundingBox().then((b) => b!.y));
  await app.acknowledgeNotice();
  await app.inquiry(typicalSymptoms("SP1"));
  await app.toResult();
  await expect(page.locator("#sec-advice")).toContainText(app.t("report.advice.formulasNone"));
});

test("E4: pregnancy gets a notice and L0: no formulas, no points, gentle lifestyle content", async ({ app, page }) => {
  await app.start();
  await app.fillProfile({ ...ADULT_WOMAN, pregnancy: "yes" });
  await expect(app.page.getByText(app.t("intake.screen.title"))).toBeVisible();
  await app.screen();
  await expect(page.locator("#screen-C")).toContainText(/Pregnant|懷孕/);                // the profile's situation is shown, not asked again
  await app.continueScreening();
  await expect(page.locator("#notice-title")).toHaveText(app.t("safety.notice.pregnancy.title"));
  await app.acknowledgeNotice();
  await app.inquiry(typicalSymptoms("SP1"));
  await app.toResult();
  const advice = page.locator("#sec-advice");
  await expect(advice).toContainText(app.t("report.advice.formulasNone"));
  await expect(page.getByRole("heading", { name: app.t("report.advice.points") })).toHaveCount(0);
  await expect(advice).toContainText(app.t("report.advice.lifestyle"));
});

test("E5: an anticoagulant gives an inline notice and the formulas with activating herbs are suppressed, with the reason listed", async ({ app, page }) => {
  await app.start();
  await app.fillProfile({ ...ADULT_MAN, medications: { classes: ["anticoagulant"] } });
  await app.screen();
  await app.continueScreening();
  await expect(page.locator("#notice-title")).toHaveCount(0);                          // inline, not blocking: the flow goes straight on
  await expect(page).toHaveURL(new RegExp(`/${app.lang}/inquiry$`));
  await app.inquiry(typicalSymptoms("SP1"));
  await app.toResult();
  await expect(page.locator("#sec-banner")).toContainText(app.t("safety.notice.medication.text", { class: app.t("intake.profile.meds.anticoagulant"), removed_or_marked: app.t("safety.value.removed") }));
  await page.locator("#sec-banner").getByRole("button", { name: app.t("report.banner.why") }).click();
  await expect(page.locator("#sec-banner").getByRole("listitem").filter({ hasText: /Shen Ling|參苓白朮散|Sijunzi|四君子湯/ }).first()).toBeVisible();
  await expect(page.locator("#sec-advice").getByRole("heading", { name: /Shen Ling|參苓白朮散/ })).toHaveCount(0);
});

test("E6: an allergy that matches suppresses the item with its reason; one we do not know shows the cannot-confirm notice", async ({ app, page }) => {
  await app.start();
  await app.fillProfile({ ...ADULT_MAN, allergies: { names: ["人參", "xyzzy-nut"] } });
  await app.screen();
  await app.continueScreening();
  await app.inquiry(typicalSymptoms("SP1"));
  await app.toResult();
  const banner = page.locator("#sec-banner");
  await expect(banner).toContainText(app.t("safety.notice.allergyUnknown.text", { text: "xyzzy-nut" }));    // xyzzy-nut: we cannot check it
  await banner.getByRole("button", { name: app.t("report.banner.why") }).click();
  await expect(banner.getByRole("listitem").filter({ hasText: /人參|ginseng|Ginseng|參苓白朮散|四君子湯/ }).first()).toBeVisible();     // 人參 matches formulas that contain it
  await expect(page.locator("#sec-advice").getByRole("heading", { name: /Sijunzi|四君子湯/ })).toHaveCount(0);
});

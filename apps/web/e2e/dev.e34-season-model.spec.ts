// E34 the season model, declared — the development profile (docs/post-mvp/design/five-phase-extensions.md §7; task PM-29): Settings → Seasons has a switch to try the other model; a result made with it says so in
// its own words, is stamped, and its parameter stamp ends "+tuwang18" so that it starts a series of its own; the summary says the same at its foot; and switching back makes the declared model again.
import { expect, type Page } from "@playwright/test";
import { ADULT_MAN, type App } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";
import { idbRecords } from "./support/storage.ts";

test.setTimeout(300_000);

const choose = async (app: App, page: Page, model: "changxia" | "tuwang18"): Promise<void> => {
  await app.goto("/settings");
  await page.getByRole("group", { name: "DEV · Season model" }).getByRole("radio", { name: new RegExp(`^✓?\\s*${model}`) }).check({ force: true });
};
const records = async (page: Page) => (await idbRecords(page, "assessments")).map(([, v]) => (v as { data: { createdAt: number; seasonModel: string; paramsFingerprint: string } }).data).sort((a, b) => a.createdAt - b.createdAt);

test("E34 (dev): the other model is one switch away, says so on the result and the summary, and is stamped; switching back makes the declared one", async ({ app, page }) => {
  await choose(app, page, "tuwang18");
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await expect(page.locator("#season-model")).toContainText(app.t("report.season.model.tuwang18", { zh: "土旺" }));
  const id = new URL(page.url()).pathname.split("/").pop()!;
  await app.goto(`/result/${id}/summary`);
  await expect(page.locator("footer").first()).toContainText(app.t("report.footer.seasons.north", { model: app.t("report.season.model.short.tuwang18") }));

  await choose(app, page, "changxia");
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await expect(page.locator("#season-model")).toContainText(app.t("report.season.model.changxia", { zh: "長夏" }));

  const [first, second] = await records(page);
  expect([first!.seasonModel, second!.seasonModel]).toEqual(["tuwang18", "changxia"]);
  expect(first!.paramsFingerprint).toBe(`${second!.paramsFingerprint}+tuwang18`);
});

// E34 the season model, declared (docs/post-mvp/design/five-phase-extensions.md §7; task PM-29), in the release build, in real browsers: every result says in one line which school's reading of the year stands
// behind its season, with a plain explanation one click away; the Settings card has no switch for it (the release declares one model and offers no other); and the practitioner summary says at its foot how the
// season was counted. In a Simplified page nothing is in the data's own script. The switch of the development profile is in dev.e34-season-model.spec.ts.
import { expect } from "@playwright/test";
import { ADULT_MAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

test.setTimeout(300_000);

test("E34: the result declares the model in a line with an explanation behind it, the release has no switch, and the summary says how the season was counted", async ({ app, page, lang }) => {
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  const line = page.locator("#season-model");
  await expect(line).toBeVisible();
  await expect(line).toContainText(app.t("report.season.model.changxia", { zh: lang === "zh-Hans" ? "长夏" : "長夏" }));
  const explanation = line.locator("details");
  await expect(explanation).not.toHaveAttribute("open", "");
  await line.getByText(app.t("report.season.model.more"), { exact: true }).click();
  await expect(explanation).toHaveAttribute("open", "");
  await expect(explanation).toContainText(app.t("report.season.model.explain.changxia"));
  await app.simplified("result with the season model");

  const id = new URL(page.url()).pathname.split("/").pop()!;
  await app.goto("/settings");
  await expect(page.getByRole("region", { name: app.t("common.settings.seasons.title"), exact: true })).toBeVisible();
  await expect(page.getByText("DEV · Season model")).toHaveCount(0);                                         // no switch in a release
  await expect(page.getByRole("radio", { name: /tuwang18/ })).toHaveCount(0);

  await app.goto(`/result/${id}/summary`);
  await expect(page.locator("footer").first()).toContainText(app.t("report.footer.seasons.north", { model: app.t("report.season.model.short.changxia") }));
  await app.simplified("practitioner summary");
});

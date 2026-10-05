// axe (WCAG 2.1 A/AA) in a real browser on every screen of the flow, light and dark — including colour contrast, which the jsdom sweep cannot measure (docs/test-plan.md §5.2).
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { ADULT_WOMAN, type App } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

async function clean(page: Page, where: string, app?: App): Promise<void> {
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${where}: ${v.id} (${v.impact}) — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), where).toEqual([]);
  await app?.simplified(where);          // in a Simplified page nothing may be in the data's own script
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test(`every screen of the flow has no violations (${scheme})`, async ({ app, page }) => {
      await app.goto("/");
      await clean(page, "landing", app);
      await app.start();
      await clean(page, "profile", app);
      await app.fillProfile({ ...ADULT_WOMAN, birth: { date: "1990-05-12", time: "14:30", city: "Taipei" } });
      await clean(page, "screening", app);
      await app.screen();
      await app.continueScreening();
      await clean(page, "inquiry: module chooser", app);
      await app.inquiry(typicalSymptoms("SP1"), { stopAfter: 2 });
      await clean(page, "inquiry: a question", app);
      await app.inquiry(typicalSymptoms("SP1"));
      await clean(page, "observe hub", app);
      await page.locator("#observe-tongue").getByRole("link", { name: app.t("observe.hub.start") }).click();
      for (let step = 0; step < 4; step++) { await clean(page, `tongue step ${step + 1}`, app); await app.button("observe.next").click(); }
      await clean(page, "tongue zones", app);
      await app.button("observe.done").click();
      await page.locator("#observe-pulse").getByRole("link", { name: app.t("observe.hub.start") }).click();
      await clean(page, "pulse", app);
      await app.goto("/observe");
      await app.reviewAndRun().catch(async () => { await page.getByRole("button", { name: new RegExp(`^(${app.t("observe.hub.skip")}|${app.t("observe.hub.continue")})$`) }).click(); });
      await clean(page, "result", app);
      await app.goto("/history");
      await clean(page, "history", app);
      await app.goto("/settings");
      await clean(page, "settings", app);
      await app.goto("/sources");
      await clean(page, "sources", app);
    });
  });
}

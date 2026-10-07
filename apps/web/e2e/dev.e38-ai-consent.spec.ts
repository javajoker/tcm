// E38 — AI help's consent (PM-46; docs/post-mvp/design/ai-assisted-intake.md §5, privacy §2): in the development build, with the mock gateway that Playwright starts, AI help is off until
// the person agrees, and nothing goes to the gateway before; after agreeing, the app asks the gateway whether the conversation is on and the header says AI help is on; one switch
// turns it off, and nothing more is sent.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { test } from "./support/fixtures.ts";

const GATEWAY = "http://127.0.0.1:8787";

async function axeClean(page: Page, where: string): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${where}: ${v.id} (${v.impact}) — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), where).toEqual([]);
}

test("E38: no request to the gateway before consent; after it, the service's state and the indicator; one switch withdraws it", async ({ app, page }) => {
  const sent: string[] = [];
  page.on("request", (r) => { if (r.url().startsWith(GATEWAY)) sent.push(`${r.method()} ${new URL(r.url()).pathname}`); });

  await app.goto("/settings");
  const card = page.getByRole("region", { name: app.t("ai.settings.title") });
  await expect(card).toBeVisible();
  const box = card.getByRole("checkbox", { name: new RegExp(app.t("ai.settings.conversation")) });
  await expect(box).not.toBeChecked();
  await expect(page.getByTestId("ai-on")).toHaveCount(0);

  // asked first (the switch opens the statement and stays off until the person agrees); not agreeing changes nothing
  await box.click({ force: true });
  const dialog = page.getByRole("dialog", { name: app.t("ai.consent.title") });
  await expect(dialog).toContainText(app.t("ai.consent.never"));
  await axeClean(page, "the consent statement");
  await dialog.getByRole("button", { name: app.t("ai.consent.cancel") }).click();
  await expect(box).not.toBeChecked();
  expect(sent, "nothing is sent before consent").toEqual([]);

  // agreeing: the service is asked, and only now
  await box.click({ force: true });
  await page.getByRole("dialog", { name: app.t("ai.consent.title") }).getByRole("button", { name: app.t("ai.consent.confirm") }).click();
  await expect(card.getByTestId("ai-service")).toHaveText(app.t("ai.settings.status.on"));
  expect(sent).toEqual(["GET /v1/config"]);
  await expect(page.getByTestId("ai-on")).toBeVisible();
  await axeClean(page, "Settings with AI help on");

  // remembered on this device
  await page.reload();
  await expect(page.getByTestId("ai-on")).toBeVisible();

  // one switch withdraws it; nothing more is sent
  const before = sent.length;
  await page.getByRole("region", { name: app.t("ai.settings.title") }).getByRole("checkbox", { name: new RegExp(app.t("ai.settings.conversation")) }).click({ force: true });
  await expect(page.getByRole("region", { name: app.t("ai.settings.title") })).toContainText(app.t("ai.settings.off"));
  await expect(page.getByTestId("ai-on")).toHaveCount(0);
  await app.goto("/");
  expect(sent.length).toBe(before);
});

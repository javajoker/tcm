// E32 how seasons are counted (docs/post-mvp/design/five-phase-extensions.md §4.2; task PM-26): a device in a southern time zone gets the southern calendar as a suggestion — the Settings card says it is only
// that — and the season of its result is the one lived there; a northern device can choose the southern calendar or no seasons at all, the next result follows the choice, and a result already saved keeps the
// basis it was made on. The clock is fixed on 20 March, when the two hemispheres are as far apart as they get: spring in the north, autumn in the south.
import { expect, type Page } from "@playwright/test";
import { ADULT_WOMAN, type App } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

test.setTimeout(300_000);
const MARCH = new Date("2026-03-20T12:00:00Z");

const seasonsCard = (app: App, page: Page) => page.getByRole("region", { name: app.t("common.settings.seasons.title"), exact: true });
const choose = async (app: App, page: Page, basis: "north" | "south" | "off"): Promise<void> => {
  await app.goto("/settings");
  await seasonsCard(app, page).getByRole("radio", { name: app.t(`common.settings.seasons.${basis}`), exact: true }).check({ force: true });
};

test.describe("a device in a southern time zone", () => {
  test.use({ timezoneId: "Australia/Sydney" });

  test("E32: the southern calendar is suggested and says so, the result's season is the one lived there, and its link leads to the choice", async ({ app, page }) => {
    await page.clock.setFixedTime(MARCH);
    await app.goto("/settings");
    const card = seasonsCard(app, page);
    await expect(card.getByRole("radio", { name: app.t("common.settings.seasons.south"), exact: true })).toBeChecked();
    await expect(card.getByText(app.t("common.settings.seasons.suggested", { basis: app.t("common.settings.seasons.basis.south") }), { exact: true })).toBeVisible();
    await app.simplified("settings, seasons");

    await app.flow(ADULT_WOMAN, typicalSymptoms("SP1"));
    const line = page.locator("#season-basis");
    await expect(line).toContainText(app.t("report.season.basis.south", { season: app.t("report.season.autumn") }));
    await app.simplified("result with its season");
    await line.getByRole("link", { name: app.t("report.season.basis.link"), exact: true }).click();
    await expect(page).toHaveURL(/\/settings#settings-seasons$/);
    await expect(page.locator("#settings-seasons")).toBeFocused();
  });
});

test.describe("a device in a northern time zone", () => {
  test.use({ timezoneId: "Asia/Taipei" });

  test("E32: the northern calendar by default; the southern one for the next result and not the one saved; no seasons leaves them out", async ({ app, page }) => {
    await page.clock.setFixedTime(MARCH);
    await app.flow(ADULT_WOMAN, typicalSymptoms("SP1"));
    const line = page.locator("#season-basis");
    await expect(line).toContainText(app.t("report.season.basis.north", { season: app.t("report.season.spring") }));
    const first = page.url();

    // the southern calendar: the next result follows the choice, and the card no longer calls it a suggestion
    await choose(app, page, "south");
    await expect(seasonsCard(app, page).getByText(app.t("common.settings.seasons.suggested", { basis: app.t("common.settings.seasons.basis.north") }), { exact: true })).toHaveCount(0);
    await app.flow(ADULT_WOMAN, typicalSymptoms("SP1"));
    await expect(line).toContainText(app.t("report.season.basis.south", { season: app.t("report.season.autumn") }));
    await expect(page.getByRole("heading", { name: app.t("report.transmission.forecast"), level: 3 })).toBeVisible();

    // a result already saved says what it was made on
    await page.goto(first);
    await expect(line).toContainText(app.t("report.season.basis.north", { season: app.t("report.season.spring") }));
    await app.simplified("the first result, as it was made");

    // no seasons: the next result leaves them out — no season line of a season, no season block, no coming seasons
    await choose(app, page, "off");
    await app.flow(ADULT_WOMAN, typicalSymptoms("SP1"));
    await expect(line).toContainText(app.t("report.season.basis.off"));
    await expect(page.getByText(app.t("report.panel.block.season"), { exact: false })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: app.t("report.transmission.forecast"), level: 3 })).toHaveCount(0);
    await app.simplified("result without seasons");

    // History keeps all three, each its own season line
    await app.goto("/history");
    await expect(page.getByRole("checkbox")).toHaveCount(3);
  });

  test("E32: the choice is kept across a reload and is a native control the keyboard can use", async ({ app, page }) => {
    await choose(app, page, "south");
    await page.reload();
    const card = seasonsCard(app, page);
    await expect(card.getByRole("radio", { name: app.t("common.settings.seasons.south"), exact: true })).toBeChecked();
    await card.getByRole("radio", { name: app.t("common.settings.seasons.south"), exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(card.getByRole("radio", { name: app.t("common.settings.seasons.off"), exact: true })).toBeChecked();
    await page.reload();
    await expect(card.getByRole("radio", { name: app.t("common.settings.seasons.off"), exact: true })).toBeChecked();
    await expect(card.getByText(app.t("common.settings.seasons.off.hint"), { exact: true })).toBeVisible();
  });
});

// E26 Learn (docs/post-mvp/design/knowledge-browser.md §10): hub → search → a page → back; a deep link opens a page in a fresh browser; a list filters; every page is axe-clean in both colour
// schemes, and in a Simplified page nothing is in the data's own script.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { test } from "./support/fixtures.ts";

const QUERY = { en: "yin yang", "zh-Hant": "陰陽", "zh-Hans": "阴阳" } as const;

async function clean(page: Page, where: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${where}: ${v.id} (${v.impact}) — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), where).toEqual([]);
}

test("E26: the hub finds a term in the page's own script, the result is a page, and Back returns to the hub", async ({ app, page, lang }) => {
  await app.goto("/learn");
  await expect(app.heading("learn.title")).toBeVisible();
  await app.simplified("hub");
  const box = page.getByRole("combobox", { name: app.t("learn.search.label") });
  await box.fill(QUERY[lang]);
  const option = page.getByRole("listbox").getByRole("option").first();
  await expect(option).toBeVisible();
  await expect(option).toHaveAttribute("href", `/${lang}/learn/terms/yin-yang`);
  await app.simplified("hub with results");
  await option.click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/terms/yin-yang$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(lang === "en" ? "yin and yang" : lang === "zh-Hans" ? "阴阳" : "陰陽");
  await expect(page.getByRole("region", { name: app.t("learn.term.meaning") })).toContainText("yīn yáng");
  await expect(page.getByRole("region", { name: app.t("learn.page.sources") })).toContainText(app.t("learn.review.needs-review"));
  await app.simplified("term page");
  await page.goBack();
  await expect(app.heading("learn.title")).toBeVisible();
});

test("E26: the keyboard alone searches, picks and opens", async ({ app, page, lang }) => {
  await app.goto("/learn");
  await page.getByRole("combobox", { name: app.t("learn.search.label") }).fill(QUERY[lang]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/terms/`));
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
});

test("E26: a deep link opens a page in a fresh browser, and an unknown one says so", async ({ browser, baseURL, lang }) => {
  const context = await browser.newContext({ baseURL: baseURL ?? "", locale: lang === "en" ? "en-US" : lang === "zh-Hans" ? "zh-CN" : "zh-TW" });
  const page = await context.newPage();
  await page.goto(`/${lang}/learn/quotations/shanghan-035`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("傷寒論".replace("傷寒論", lang === "zh-Hans" ? "伤寒论" : "傷寒論"));
  await expect(page.locator("blockquote")).toBeVisible();
  await page.goto(`/${lang}/learn/terms/no-such-term`);
  await expect(page.getByRole("alert")).toContainText(lang === "en" ? "This page is not in the Learn section" : lang === "zh-Hans" ? "学习内容中没有这一页" : "學習內容中沒有這一頁");
  await context.close();
});

test("E26: a pattern page shows its features in bands, from the list, and the page of another pattern of its group is one link away", async ({ app, page, lang }) => {
  await app.goto("/learn/patterns");
  const link = page.locator("main a[href$='/learn/patterns/EX1']");
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/patterns/EX1$`));
  const features = page.getByRole("region", { name: app.t("learn.pattern.features") });
  await expect(features.getByRole("heading", { level: 3, name: app.t("learn.band.key") })).toBeVisible();
  await expect(features.getByRole("heading", { level: 3, name: app.t("learn.band.against") })).toBeVisible();
  await expect(page.getByRole("region", { name: app.t("learn.page.sources") })).toBeVisible();
  await app.simplified("pattern page");
  const related = page.getByRole("region", { name: app.t("learn.page.related") }).getByRole("link").first();
  await related.click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/patterns/EX[0-9]+$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("E26: from a pattern page to a comparison and back; a comparison is real tables with topics rather than questions, and the chooser makes the same address", async ({ app, page, lang }) => {
  await app.goto("/learn/patterns/EX2");
  await page.locator("main a[href$='/learn/compare?ids=EX2,EX4']").click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/compare\\?ids=EX2,EX4$`));
  await expect(app.heading("learn.compare.title")).toBeVisible();
  const differ = page.getByRole("region", { name: app.t("learn.compare.differ") });
  await expect(differ.getByRole("table")).toBeVisible();
  expect(await differ.getByRole("rowheader").count()).toBeGreaterThan(2);
  expect(await differ.getByRole("columnheader").count()).toBe(3);
  const topics = page.getByRole("region", { name: app.t("learn.compare.questions") });
  await expect(topics.getByRole("heading", { level: 3 })).toHaveCount(3);
  await app.simplified("comparison");
  // the chooser at the foot: change the second pattern and compare again
  await page.getByRole("combobox").nth(1).selectOption("LG1");
  await page.getByRole("button", { name: app.t("learn.compare.go"), exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/compare\\?ids=EX2,LG1$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/compare\\?ids=EX2,EX4$`));
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/patterns/EX2$`));
  // from the hub, with nothing chosen, two choices make a comparison
  await app.goto("/learn");
  await page.getByRole("link", { name: app.t("learn.compare.title") }).first().click();
  await page.getByRole("combobox").nth(0).selectOption("SP1");
  await page.getByRole("button", { name: app.t("learn.compare.go"), exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(app.t("learn.compare.needTwo"));
  await page.getByRole("combobox").nth(1).selectOption("SP2");
  await page.getByRole("button", { name: app.t("learn.compare.go"), exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/compare\\?ids=SP1,SP2$`));
});

test("E26: a page about something a person might use puts its cautions first, in the release too, and the release holds only its own formulas", async ({ app, page }) => {
  await app.goto("/learn/formulas/F_GUIZHI");
  const cautions = page.getByRole("region", { name: app.t("learn.page.cautions") });
  await expect(cautions).toBeVisible();
  await expect(cautions).toContainText(app.t("formula.cautions.pregnancy.caution"));
  await expect(cautions).toContainText(app.t("learn.formula.allergy"));
  await expect(cautions).toContainText(app.t("formula.interaction.bp-raising"));
  await app.simplified("formula page");
  // the cautions are the first section of the article, above everything that describes the formula
  expect(await page.locator("article > section").first().getAttribute("id")).toBe("learn-cautions-section");
  expect(await page.locator("article section").count()).toBeGreaterThan(3);
  // a release bundle has tier-A formulas without amounts: the composition table has no amount column, and a formula of another tier is not there at all
  await expect(page.getByRole("columnheader", { name: app.t("formula.composition.col.amount") })).toHaveCount(0);
  await app.goto("/learn/formulas/F_MAHUANG");
  await expect(page.getByRole("alert")).toContainText(app.t("learn.notFound.title"));
  await app.goto("/learn/points/SP6");
  await expect(page.getByRole("region", { name: app.t("learn.page.cautions") })).toContainText(app.t("learn.point.pregnancy"));
  await app.simplified("point page");
  await app.goto("/learn/foods/foshou");
  await expect(page.getByRole("region", { name: app.t("learn.page.cautions") })).toContainText(app.t("learn.food.allergy"));
  await app.simplified("food page");
});

test("E26: a list filters, announces the count and keeps what the search sent", async ({ app, page, lang }) => {
  await app.goto("/learn/terms?q=" + encodeURIComponent(QUERY[lang]));
  await expect(page.getByRole("searchbox", { name: app.t("learn.list.filter") })).toHaveValue(QUERY[lang]);
  await expect(page.getByRole("status").filter({ hasText: /\d/ }).first()).toBeVisible();
  const links = page.locator("main a[href*='/learn/terms/']");
  await expect(links.first()).toBeVisible();
  expect(await links.count()).toBeGreaterThan(0);
  await app.simplified("terms list");
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test(`the hub (with results), a list, a term, a quotation (${scheme})`, async ({ app, page, lang }) => {
      await app.goto("/learn");
      await page.getByRole("combobox", { name: app.t("learn.search.label") }).fill(QUERY[lang]);
      await expect(page.getByRole("listbox").getByRole("option").first()).toBeVisible();
      await clean(page, "hub");
      for (const path of ["/learn/terms", "/learn/terms/yin-yang", "/learn/quotations", "/learn/quotations/shanghan-035", "/learn/patterns", "/learn/patterns/EX1", "/learn/constitutions", "/learn/constitutions/C_YINXU", "/learn/formulas", "/learn/formulas/F_GUIZHI", "/learn/points", "/learn/points/SP6", "/learn/foods", "/learn/foods/foshou", "/learn/compare", "/learn/compare?ids=EX2,EX4", "/learn/compare?ids=EX1,SP1,LV1"]) {
        await app.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await clean(page, path);
        await app.simplified(path);
      }
    });
  });
}

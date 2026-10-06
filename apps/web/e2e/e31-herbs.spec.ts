// E31 the herb pages (PM-25; docs/post-mvp/design/knowledge-browser.md §7.1), in real browsers: the list asks for the browse index when it opens, filters by name and by nature and announces the count; a herb page puts
// the record's flags first and says where the herb comes from and how far it has been checked; a deep link needs one shard and never the index; a fetch that fails says so and is tried again; the keyboard alone does it
// all; and every page is axe-clean in both colour schemes, with contrast measured. In a Simplified page nothing is in the data's own script.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { test } from "./support/fixtures.ts";

/** A herb whose name differs between the scripts, found by its Latin name in English and by its name in Chinese. */
const FIND = { en: "angelica sinensis", "zh-Hant": "當歸", "zh-Hans": "当归" } as const;
const NAME = { en: "當歸", "zh-Hant": "當歸", "zh-Hans": "当归" } as const;
/** What 冰糖 is for, as its page shows it in each script (the one hand-added herb whose functions and caution were once filed together). */
const FUNCTION = { en: "潤肺和胃", "zh-Hant": "潤肺和胃", "zh-Hans": "润肺和胃" } as const;

async function clean(page: Page, where: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${where}: ${v.id} (${v.impact}) — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), where).toEqual([]);
}

test("E31: the list loads on demand, filters by name, announces how many are left, and a herb page opens from it and goes back", async ({ app, page, lang }) => {
  await app.goto("/learn/herbs");
  await expect(app.heading("learn.type.herb.title")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /\d{3}/ }).last()).toBeVisible();          // the whole list: hundreds of herbs
  await expect(page.getByRole("heading", { level: 2 }).first()).toBeVisible();
  await app.simplified("herb list");
  await page.getByRole("searchbox", { name: app.t("learn.list.filter") }).fill(FIND[lang]);
  await expect(page.getByRole("status").filter({ hasText: app.plural("learn.list.count", 1) })).toBeVisible();
  await app.simplified("herb list, filtered");
  const link = page.locator("main a[href$='/learn/herbs/danggui']");
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/herbs/danggui$`));
  await expect(page.getByRole("heading", { level: 1 })).toContainText(NAME[lang]);
  await app.simplified("herb page");
  await page.goBack();
  await expect(app.heading("learn.type.herb.title")).toBeVisible();
});

test("E31: a herb page puts the record's flags first, then what the herb is, where it comes from and how far it has been checked", async ({ app, page, lang }) => {
  await app.goto("/learn/herbs/danggui");
  const cautions = page.getByRole("region", { name: app.t("learn.page.cautions") });
  await expect(cautions).toBeVisible();
  await expect(cautions).toContainText(app.t("learn.herb.allergy"));
  await expect(cautions).toContainText(app.t("learn.herb.practitioner"));
  await expect(cautions).toContainText(app.t("formula.interaction.anticoagulant"));          // the stored interaction, in the page's words
  // the cautions are the first section of the article, above everything that describes the herb (R1)
  expect(await page.locator("article > section").first().getAttribute("id")).toBe("learn-cautions-section");
  await expect(page.getByRole("region", { name: app.t("learn.herb.overview") })).toBeVisible();
  await expect(page.getByRole("region", { name: app.t("learn.herb.functions") })).toBeVisible();
  const sources = page.getByRole("region", { name: app.t("learn.page.sources") });
  await expect(sources).toContainText("danggui_001");
  await expect(sources).toContainText(app.t("learn.review.curated-draft"));          // 當歸 is one of the curated herbs
  await expect(page.getByText(app.t("learn.herb.draft.curated"))).toBeVisible();
  await expect(page.getByRole("link", { name: app.t("learn.page.foot.link") })).toHaveCount(1);          // R5: the one neutral link to the assessment
  // a herb derived from its source entry by rules says that instead
  await app.goto("/learn/herbs/aidicha");
  await expect(page.getByRole("region", { name: app.t("learn.page.sources") })).toContainText(app.t("learn.review.derived"));
  await expect(page.getByText(app.t("learn.herb.draft.derived"))).toBeVisible();
  // a herb added by hand says so, and the page holds a caution and the functions apart
  await app.goto("/learn/herbs/bingtang");
  await expect(page.getByRole("region", { name: app.t("learn.page.sources") })).toContainText(app.t("learn.herb.source.byHand"));
  await expect(page.getByRole("region", { name: app.t("learn.page.cautions") })).toContainText("糖尿病者慎用");
  await expect(page.getByRole("region", { name: app.t("learn.herb.functions") })).toContainText(FUNCTION[lang]);
  await expect(page.getByRole("region", { name: app.t("learn.page.cautions") })).not.toContainText(FUNCTION[lang]);
});

test("E31: a deep link needs one shard and never the index; an unknown herb says so", async ({ browser, baseURL, lang }) => {
  const context = await browser.newContext({ baseURL: baseURL ?? "", locale: lang === "en" ? "en-US" : lang === "zh-Hans" ? "zh-CN" : "zh-TW", serviceWorkers: "block" });
  const page = await context.newPage();
  const asked: string[] = [];
  page.on("request", (r) => { const m = /\/kb\/((?:hans-)?herbs-[^/]+)$/.exec(r.url()); if (m) asked.push(m[1]!); });
  await page.goto(`/${lang}/learn/herbs/danggui`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(NAME[lang]);
  const files = asked.filter((f) => f.startsWith("herbs-"));
  expect(files, "one shard").toHaveLength(1);
  expect(files[0]).toMatch(/^herbs-[0-9a-f]\.[0-9a-f]{10}\.json$/);
  expect(asked.filter((f) => f.startsWith("hans-herbs-")), lang === "zh-Hans" ? "its Simplified list" : "no Simplified list").toHaveLength(lang === "zh-Hans" ? 1 : 0);
  await page.goto(`/${lang}/learn/herbs/no-such-herb`);
  await expect(page.getByRole("alert")).toContainText(lang === "en" ? "This page is not in the Learn section" : lang === "zh-Hans" ? "学习内容中没有这一页" : "學習內容中沒有這一頁");
  await context.close();
});

test("E31: a fetch that fails says so, offers to try again, and the page comes when it can", async ({ app, page }) => {
  await page.route("**/kb/herbs-*.json", (route) => route.abort());
  await app.goto("/learn/herbs/danggui");
  await expect(page.getByRole("alert")).toContainText(app.t("learn.herb.error.page"));
  await page.unroute("**/kb/herbs-*.json");
  await page.getByRole("button", { name: app.t("learn.herb.retry") }).click();
  await expect(page.getByRole("region", { name: app.t("learn.page.cautions") })).toBeVisible();
  // the same for the list
  await page.route("**/kb/herbs-index.*.json", (route) => route.abort());
  await app.goto("/learn/herbs");
  await expect(page.getByRole("alert")).toContainText(app.t("learn.herb.error"));
  await page.unroute("**/kb/herbs-index.*.json");
  await page.getByRole("button", { name: app.t("learn.herb.retry") }).click();
  await expect(page.getByRole("searchbox", { name: app.t("learn.list.filter") })).toBeVisible();
});

test("E31: the keyboard alone filters by nature and by name, and opens a herb", async ({ app, page, lang }) => {
  await app.goto("/learn/herbs");
  const filter = page.getByRole("searchbox", { name: app.t("learn.list.filter") });
  await expect(filter).toBeVisible();
  const before = await page.getByRole("status").filter({ hasText: /\d{3}/ }).last().innerText();
  await filter.focus();
  await page.keyboard.press("Tab");
  const nature = page.getByRole("combobox", { name: app.t("learn.herb.filter.nature") });
  await expect(nature).toBeFocused();
  await nature.selectOption("溫");
  await expect(page.getByRole("status").filter({ hasText: /\d+/ }).last()).not.toHaveText(before);
  await filter.fill(FIND[lang]);
  await expect(page.getByRole("status").filter({ hasText: app.plural("learn.list.count", 1) })).toBeVisible();
  await page.locator("main a[href$='/learn/herbs/danggui']").focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/herbs/danggui$`));
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test(`the herb list and a herb page (${scheme})`, async ({ app, page }) => {
      await app.goto("/learn/herbs");
      await expect(page.getByRole("status").filter({ hasText: /\d{3}/ }).last()).toBeVisible();
      await clean(page, `herb list (${scheme})`);
      await app.goto("/learn/herbs/danggui");
      await expect(page.getByRole("region", { name: app.t("learn.page.cautions") })).toBeVisible();
      await clean(page, `herb page (${scheme})`);
    });
  });
}

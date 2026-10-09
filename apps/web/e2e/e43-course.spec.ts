// E43 the course and its textbook (PM-60; docs/post-mvp/design/knowledge-browser.md §7.4), in real browsers: the hub lists it after the book; nothing of it comes with the knowledge base —
// the contents ask for its index, a page for its own file, each once — in Traditional Chinese whatever the interface (English says so above the text); page after page and back, with its
// sub-sections and bullets inside an item; a quotation opens its page; a deep link opens a page in a fresh browser; a fetch that fails says so and is tried again; the offline copy holds
// none of it. A Simplified page holds no Traditional text: it says where the course is, leads there, and asks for nothing. Every page is axe-clean in both colour schemes.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { test } from "./support/fixtures.ts";

const CONTENTS = "中醫學系統課程——教科書";
/** A chapter's title holds an ideographic space between its number and its name. */
const title = (number: string, name: string): RegExp => new RegExp(`^${number}.${name}$`);

async function clean(page: Page, where: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${where}: ${v.id} (${v.impact}) — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), where).toEqual([]);
}
/** The course files a page asks for. */
function courseRequests(page: Page): string[] {
  const asked: string[] = [];
  page.on("request", (r) => { const m = /\/kb\/(course-[^/]+)$/.exec(r.url()); if (m) asked.push(m[1]!); });
  return asked;
}

test("E43: the hub lists the course; its index comes when it is opened and each page when it is read, once; page after page, and back to the contents", async ({ app, page, lang }) => {
  const asked = courseRequests(page);
  await app.goto("/learn");
  const card = page.locator("main a[href$='/learn/course']");
  await expect(card).toContainText(app.t("learn.course.title"));
  await expect(card).toContainText(app.plural("learn.course.count", 22));
  await app.simplified("hub with the course");
  expect(asked, "nothing of the course with the knowledge base").toEqual([]);
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/course$`));
  if (lang === "zh-Hans") {
    // no Traditional text on a Simplified page: where the course is, and the way to it
    await expect(app.heading("learn.course.title")).toBeVisible();
    await expect(page.getByText(app.t("learn.course.language"))).toBeVisible();
    await app.simplified("the course's page");
    expect(asked, "a Simplified page never asks for the course").toEqual([]);
    await app.link("learn.course.language.read").click();
    await expect(page).toHaveURL(/\/zh-Hant\/learn\/course$/);
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(CONTENTS);
  expect(asked).toEqual([expect.stringMatching(/^course-index\.[0-9a-f]{10}\.json$/)]);
  if (lang === "en") await expect(page.getByText(app.t("learn.course.language"))).toBeVisible();
  await page.locator("main a[href$='/learn/course/zangxiang']").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title("第五章", "藏象學說"));
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  expect(await page.locator("main h3").count()).toBeGreaterThan(5);
  await expect(page.locator("main li > ul > li").first()).toContainText("調暢情志");
  await page.locator("main nav a[rel='next']").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title("第六章", "精氣血津液與營衛"));
  await page.locator("main nav a[rel='prev']").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title("第五章", "藏象學說"));
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title("第六章", "精氣血津液與營衛"));
  await page.locator("main nav a[href$='/learn/course']").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(CONTENTS);
  expect(asked.filter((f) => f.startsWith("course-index.")), "the index once").toHaveLength(1);
  expect(asked.filter((f) => !f.startsWith("course-index.")).map((f) => f.split(".")[0]), "each page once").toEqual(["course-zangxiang", "course-qi-blood-fluids"]);
});

test("E43: a quotation opens its page among the quotations; the contents lead to the book the course goes with", async ({ app, page, lang }) => {
  test.skip(lang === "zh-Hans", "a Simplified page shows none of the course");
  await app.goto("/learn/course/yinyang");
  const source = page.locator("main figure figcaption a").first();
  await expect(source).toBeVisible();
  await source.click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/quotations/[a-z0-9-]+$`));
  await expect(page.locator("main blockquote").first()).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title("第三章", "陰陽學說"));
  await app.goto("/learn/course");
  await page.locator("main a[href$='/learn/book']").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("以模型讀中醫——這個 App 怎麼想");
});

test("E43: a deep link opens a page in a fresh browser; a page the course does not have says so", async ({ browser, baseURL, lang }) => {
  const context = await browser.newContext({ baseURL: baseURL ?? "", locale: lang === "en" ? "en-US" : lang === "zh-Hans" ? "zh-CN" : "zh-TW", serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto(`/${lang}/learn/course/answers`);
  if (lang === "zh-Hans") await expect(page.getByRole("link", { name: "改用繁体中文阅读" })).toHaveAttribute("href", "/zh-Hant/learn/course/answers");
  else await expect(page.getByRole("heading", { level: 1 })).toHaveText("習題解答");
  await page.goto(`/${lang}/learn/course/no-such-page`);
  await expect(page.getByRole("alert")).toContainText(lang === "en" ? "This page is not in the Learn section" : lang === "zh-Hans" ? "学习内容中没有这一页" : "學習內容中沒有這一頁");
  await context.close();
});

test("E43: a page that cannot be fetched says so — the course is not in the offline copy — offers to try again, and comes when it can", async ({ app, page, lang }) => {
  test.skip(lang === "zh-Hans", "a Simplified page never asks for the course");
  await page.route("**/kb/course-*.json", (route) => route.abort());
  await app.goto("/learn/course/introduction");
  await expect(page.getByRole("alert")).toContainText(app.t("learn.course.error"));
  await page.unroute("**/kb/course-*.json");
  await page.getByRole("button", { name: app.t("learn.herb.retry") }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title("第一章", "導論：中醫學的思維方式與學習方法"));
  const worker = await (await page.request.get("/sw.js")).text();
  expect(worker, "the worker's lists name no course file").not.toContain("course-");
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test(`the course's contents and a chapter (${scheme})`, async ({ app, page }) => {
      await app.goto("/learn/course");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await clean(page, `course contents (${scheme})`);
      await app.goto("/learn/course/zangxiang");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await clean(page, `course chapter (${scheme})`);
    });
  });
}

// E37 the learning book (PM-43; docs/post-mvp/design/knowledge-browser.md §7.3), in real browsers: the hub lists it; the book comes in one file when it is first opened — never with the
// knowledge base — in Traditional Chinese whatever the interface (English says so above the text); chapter after chapter and back; a quotation opens its page; a deep link opens a chapter in a
// fresh browser; a fetch that fails says so and is tried again. A Simplified page holds no Traditional text: it says where the book is, leads there, and never asks for the file. Every page
// is axe-clean in both colour schemes.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { test } from "./support/fixtures.ts";

const CONTENTS = "以模型讀中醫——這個 App 怎麼想";

async function clean(page: Page, where: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${where}: ${v.id} (${v.impact}) — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), where).toEqual([]);
}
/** The book files a page asks for. */
function bookRequests(page: Page): string[] {
  const asked: string[] = [];
  page.on("request", (r) => { const m = /\/kb\/(book\.[^/]+)$/.exec(r.url()); if (m) asked.push(m[1]!); });
  return asked;
}

test("E37: the hub lists the book; it comes in one file when opened, never before; chapter after chapter, and back to the contents", async ({ app, page, lang }) => {
  const asked = bookRequests(page);
  await app.goto("/learn");
  const card = page.locator("main a[href$='/learn/book']");
  await expect(card).toContainText(app.t("learn.book.title"));
  await expect(card).toContainText(app.plural("learn.book.count", 12));
  await app.simplified("hub with the book");
  await card.click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/book$`));
  if (lang === "zh-Hans") {
    // no Traditional text on a Simplified page: where the book is, and the way to it
    await expect(app.heading("learn.book.title")).toBeVisible();
    await expect(page.getByText(app.t("learn.book.language"))).toBeVisible();
    await app.simplified("the book's page");
    expect(asked, "a Simplified page never asks for the book").toEqual([]);
    await app.link("learn.book.language.read").click();
    await expect(page).toHaveURL(/\/zh-Hant\/learn\/book$/);
  }
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(CONTENTS);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toMatch(/^book\.[0-9a-f]{10}\.json$/);
  if (lang === "en") await expect(page.getByText(app.t("learn.book.language"))).toBeVisible();
  await page.locator("main a[href$='/learn/book/system']").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("二、系統：平衡與回饋");
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await expect(page.locator("main figure blockquote").nth(1)).toContainText("八字而已");
  await page.locator("main nav a[rel='next']").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("三、狀態：人體的帳本");
  await page.locator("main nav a[rel='prev']").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("二、系統：平衡與回饋");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("三、狀態：人體的帳本");
  await page.locator("main nav a[href$='/learn/book']").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(CONTENTS);
  expect(asked, "the file once").toHaveLength(1);
});

test("E37: a quotation opens its page among the quotations, with the original and how far it has been checked", async ({ app, page, lang }) => {
  test.skip(lang === "zh-Hans", "a Simplified page shows none of the book");
  await app.goto("/learn/book/person");
  const source = page.locator("main figure figcaption a").filter({ hasText: "《素問·六元正紀大論》" }).last();
  await expect(source).toBeVisible();
  await source.click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/learn/quotations/suwen-071-4$`));
  await expect(page.locator("main blockquote")).toContainText("發表不遠熱，攻裡不遠寒");
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("十、個人：同病異治");
});

test("E37: a deep link opens a chapter in a fresh browser; a chapter the book does not have says so", async ({ browser, baseURL, lang }) => {
  const context = await browser.newContext({ baseURL: baseURL ?? "", locale: lang === "en" ? "en-US" : lang === "zh-Hans" ? "zh-CN" : "zh-TW", serviceWorkers: "block" });
  const page = await context.newPage();
  await page.goto(`/${lang}/learn/book/herbs`);
  if (lang === "zh-Hans") await expect(page.getByRole("link", { name: "改用繁体中文阅读" })).toHaveAttribute("href", "/zh-Hant/learn/book/herbs");
  else await expect(page.getByRole("heading", { level: 1 })).toHaveText("八、本草：一味藥的座標");
  await page.goto(`/${lang}/learn/book/no-such-chapter`);
  await expect(page.getByRole("alert")).toContainText(lang === "en" ? "This page is not in the Learn section" : lang === "zh-Hans" ? "学习内容中没有这一页" : "學習內容中沒有這一頁");
  await context.close();
});

test("E37: a fetch that fails says so, offers to try again, and the book comes when it can", async ({ app, page, lang }) => {
  test.skip(lang === "zh-Hans", "a Simplified page never asks for the book");
  await page.route("**/kb/book.*.json", (route) => route.abort());
  await app.goto("/learn/book/model");
  await expect(page.getByRole("alert")).toContainText(app.t("learn.book.error"));
  await page.unroute("**/kb/book.*.json");
  await page.getByRole("button", { name: app.t("learn.herb.retry") }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("一、以模型讀中醫");
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test(`the book's contents and a chapter (${scheme})`, async ({ app, page }) => {
      await app.goto("/learn/book");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await clean(page, `book contents (${scheme})`);
      await app.goto("/learn/book/person");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await clean(page, `book chapter (${scheme})`);
    });
  });
}

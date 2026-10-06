// E29 trends (docs/post-mvp/design/export-follow-up-trends.md §5; task PM-19): three assessments of one version make a Trends tab in History — band marks that open their results, a table twin, what moved
// between bands in neutral words — and a result made with other parameters takes the tab away with a plain explanation rather than being compared silently.
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { ADULT_MAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";
import { idbPut, idbRecords } from "./support/storage.ts";

test.setTimeout(240_000);

test("E29: three results make a trend of bands, with a table and neutral words; a result of other parameters is not compared silently", async ({ app, page, lang }) => {
  for (const id of ["SP1", "LG1", "KD1"]) await app.flow(ADULT_MAN, typicalSymptoms(id));
  await app.goto("/history");
  await expect(page.getByRole("checkbox")).toHaveCount(3);
  const tabs = page.getByRole("tablist", { name: app.t("trends.tabs.label") });
  await expect(tabs.getByRole("tab")).toHaveCount(2);
  await tabs.getByRole("tab", { name: app.t("trends.tabs.trends"), exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: app.t("trends.title"), exact: true })).toBeVisible();
  await app.simplified("trends");
  const figure = page.getByRole("group", { name: app.t("trends.figure.title") });
  await expect(figure.getByRole("link")).toHaveCount(7 * 3);
  await expect(page.getByText(app.t("trends.note"), { exact: true })).toBeVisible();

  // the table twin: seven rows, a column for each result, the band in words and the number beside it
  await page.locator("summary").filter({ hasText: app.t("report.figure.viewTable") }).first().click();
  const table = page.getByRole("table", { name: app.t("trends.table.caption"), exact: true });
  await expect(table.getByRole("rowheader")).toHaveCount(7);
  await expect(table.getByRole("columnheader")).toHaveCount(4);
  await expect(table.getByRole("cell").first()).toContainText(/\(.*\d.*\)/);

  // no judgement in what the app writes (the names of symptoms are the knowledge base's own words, and are not scanned)
  const text = [await page.getByRole("tabpanel").getByText(app.t("trends.intro"), { exact: true }).innerText(), await page.getByText(app.t("trends.note"), { exact: true }).innerText(), await page.locator("#trends-changes").innerText(), await page.getByText(app.t("trends.figure.summary"), { exact: true }).innerText()].join(" ").toLowerCase();
  for (const word of lang === "en" ? ["better", "worse", "improve", "recover", "progress", " score"] : ["變好", "變差", "好轉", "惡化", "改善", "進步", "康復", "分數", "变好", "变差", "恶化", "改善", "进步", "康复", "分数"]) expect(text, word).not.toContain(word);

  // axe, light and dark, with the figure and the table in view
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`), `trends ${scheme}`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: "light" });

  // a mark opens its result
  await figure.getByRole("link").first().click();
  await expect(page).toHaveURL(new RegExp(`/${lang}/result/[^/]+$`));
  await expect(app.heading("report.title")).toBeVisible();

  // one result made with other parameters: three results, but not of one version — no tab, and the reason is given
  const [id, record] = (await idbRecords(page, "assessments")).sort(([, a], [, b]) => (a as { data: { createdAt: number } }).data.createdAt - (b as { data: { createdAt: number } }).data.createdAt).at(-1)! as [string, { v: number; data: Record<string, unknown> }];
  await idbPut(page, "assessments", id, { ...record, data: { ...record.data, paramsFingerprint: "another-version" } });
  await app.goto("/history");
  await expect(page.getByRole("checkbox")).toHaveCount(3);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByText(app.plural("trends.need", 2).replace("{n}", "2"))).toBeVisible();
});

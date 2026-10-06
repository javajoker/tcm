// E27 the practitioner summary as a file (docs/post-mvp/design/export-follow-up-trends.md §3; task PM-17): after a whole assessment the summary page saves a structured file of what is on the page, with
// the sections the person left on, in a release build (no amounts, tier-A formulas only); the print media shows the versions and the notice in the footer of every page and no controls.
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ADULT_WOMAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

test("E27: make the file from a finished assessment: the envelope, the sections left on, the labels in both languages, and a release's limits", async ({ app, page, lang }) => {
  await app.flow({ ...ADULT_WOMAN, medications: { classes: ["anticoagulant"] }, allergies: { names: ["花生"] } }, typicalSymptoms("SP1"));
  await app.goto("/history");
  await expect(page.getByRole("checkbox")).toHaveCount(1);                                    // the list loads from the device
  const id = (await page.getByRole("link", { name: /./ }).evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))).filter((h) => new RegExp(`^/${lang}/result/[^/]+$`).test(h))[0]!.split("/").pop()!;
  await app.goto(`/result/${id}/summary`);
  await expect(app.heading("report.pract.title")).toBeVisible();
  await app.simplified("summary page");
  await page.getByRole("button", { name: app.t("report.pract.file.make"), exact: true }).click();
  const dialog = page.getByRole("dialog", { name: app.t("report.pract.file.title") });
  await expect(dialog.getByText(app.t("report.pract.file.warning"))).toBeVisible();
  await app.simplified("summary file dialog");
  for (const s of ["person", "safety", "findings", "observations", "constitution", "panel", "patterns", "recommendations"]) await expect(dialog.getByRole("checkbox", { name: app.t(`report.pract.file.section.${s}`) })).toBeChecked();
  await dialog.getByRole("checkbox", { name: app.t("report.pract.file.section.constitution") }).uncheck({ force: true });
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: app.t("report.pract.file.download"), exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/^tcm-summary-\d{4}-\d{2}-\d{2}\.json$/);
  const doc = JSON.parse(readFileSync((await download.path())!, "utf8")) as Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(doc).toMatchObject({ format: "tcm-summary", version: 1, language: lang });
  expect(doc.exportedFrom.profile).toBe("release");
  expect(Object.keys(doc)).not.toContain("constitution");
  expect(doc.safety.medications.classes.map((c: { id: string }) => c.id)).toEqual(["anticoagulant"]);
  expect(doc.safety.allergies).toEqual({ status: "some", items: ["花生"] });
  expect(doc.findings.length).toBeGreaterThan(3);
  for (const f of doc.findings) { expect(f.label["zh-Hant"]).toBeTruthy(); expect(f.label.en).toBeTruthy(); }
  expect(doc.patterns.items[0].id).toBe("SP1");
  expect(doc.patterns.items[0].label.en).toBeTruthy();
  for (const f of doc.recommendations.formulas) expect(f.tier).toBe("A");
  expect(JSON.stringify(doc)).not.toMatch(/typical_g|classical_amount|effective_weight/);
  expect(doc.notice.en).toContain("not a medical diagnosis");
  // what the file says is on the page: the leading pattern's name in the page language
  await dialog.getByRole("button", { name: app.t("report.pract.file.cancel"), exact: true }).click();
  const pattern = lang === "en" ? doc.patterns.items[0].label.en : doc.patterns.items[0].label["zh-Hant"];
  if (lang !== "zh-Hans") await expect(page.locator("main")).toContainText(pattern);
});

test("E27: the print media keeps the versions and the notice in the footer of every page, hides the controls, and keeps a table together", async ({ app, page }) => {
  await app.flow(ADULT_WOMAN, typicalSymptoms("SP1"));
  await app.goto("/history");
  await expect(page.getByRole("checkbox")).toHaveCount(1);                                    // the list loads from the device
  const id = (await page.getByRole("link", { name: /./ }).evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))).filter((h) => /\/result\/[^/]+$/.test(h))[0]!.split("/").pop()!;
  await app.goto(`/result/${id}/summary`);
  await expect(app.heading("report.pract.title")).toBeVisible();
  const versions = page.getByText(/^.*(Computed|計算於|计算于).*$/);
  const visible = async (): Promise<number> => { let n = 0; for (const el of await versions.all()) if (await el.isVisible()) n += 1; return n; };
  expect(await visible(), "on screen: the line at the end of the page").toBe(1);
  await page.emulateMedia({ media: "print" });
  expect(await visible(), "on paper: the fixed footer repeats it on every page, the line at the end is not printed twice").toBe(1);
  await expect(page.getByRole("button", { name: app.t("report.actions.print"), exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: app.t("report.pract.file.make"), exact: true })).toBeHidden();
  const breaks = await page.locator("table").first().evaluate((t) => getComputedStyle(t).breakInside);
  expect(breaks).toBe("avoid");
  const footer = page.locator("div[aria-hidden='true']").filter({ hasText: /./ }).last();
  expect(await footer.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
  await page.emulateMedia({ media: "screen" });
});

test("E27: the summary page and its preview have no axe violations in both colour schemes", async ({ app, page }) => {
  await app.flow(ADULT_WOMAN, typicalSymptoms("SP1"));
  await app.goto("/history");
  await expect(page.getByRole("checkbox")).toHaveCount(1);                                    // the list loads from the device
  const id = (await page.getByRole("link", { name: /./ }).evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))).filter((h) => /\/result\/[^/]+$/.test(h))[0]!.split("/").pop()!;
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await app.goto(`/result/${id}/summary`);
    await expect(app.heading("report.pract.title")).toBeVisible();
    let r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`), `summary ${scheme}`).toEqual([]);
    await page.getByRole("button", { name: app.t("report.pract.file.make"), exact: true }).click();
    await expect(page.getByRole("dialog", { name: app.t("report.pract.file.title") })).toBeVisible();
    r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`), `preview ${scheme}`).toEqual([]);
    await page.keyboard.press("Escape");
  }
});

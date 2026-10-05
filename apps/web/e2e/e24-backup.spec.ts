// E24 backup and restore (docs/post-mvp/design/backup-and-data-lock.md §7; task PM-08): a backup made in one browser is restored in another to an equal history — the same results, opened by the same
// address, saying the same thing — and a file that is not a backup is refused without changing anything.
import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ADULT_MAN, ADULT_WOMAN, App } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";

const summaryOf = async (page: Page): Promise<string> => (await page.locator("#sec-summary").innerText()).replace(/\s+/g, " ").trim();
const resultIds = async (page: Page, lang: string): Promise<string[]> => (await page.getByRole("link", { name: /./ }).evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))).filter((h) => new RegExp(`^/${lang}/result/[^/]+$`).test(h)).map((h) => h.split("/").pop()!);

test("E24: export in one browser, import in another: an equal history", async ({ app, page, browser, lang }, testInfo) => {
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await app.flow(ADULT_WOMAN, typicalSymptoms("LG1"));
  await app.goto("/history");
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  const ids = await resultIds(page, lang);
  expect(ids).toHaveLength(2);
  const summaries: Record<string, string> = {};
  for (const id of ids) { await app.goto(`/result/${id}`); await expect(app.heading("report.title")).toBeVisible(); summaries[id] = await summaryOf(page); }

  // make the backup
  await app.goto("/settings");
  await app.button("common.backup.card.make").click();
  const dialog = page.getByRole("dialog", { name: app.t("common.backup.make.title") });
  await expect(dialog.getByRole("checkbox", { name: app.t("common.backup.make.results.all", { n: 2 }) })).toBeChecked();
  await expect(dialog.getByText(app.t("common.backup.make.warning"))).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: app.t("common.backup.make.action"), exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/^tcm-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  const doc = JSON.parse(readFileSync(file, "utf8")) as { format: string; contents: { assessments: number }; payload: { assessments: { data: { id: string } }[] } };
  expect(doc).toMatchObject({ format: "tcm-backup", contents: { assessments: 2 } });
  expect(doc.payload.assessments.map((a) => a.data.id).sort()).toEqual([...ids].sort());
  await expect(dialog.getByRole("status")).toContainText("tcm-backup-");

  // another browser: nothing in it yet; restore the file
  const use = testInfo.project.use;
  const other = await browser.newContext({ baseURL: use.baseURL ?? "", locale: use.locale ?? "en-US", timezoneId: use.timezoneId ?? "Asia/Taipei", viewport: use.viewport ?? null, isMobile: use.isMobile ?? false, hasTouch: use.hasTouch ?? false, serviceWorkers: "block" });
  try {
    const page2 = await other.newPage();
    const app2 = new App(page2, lang);
    await app2.goto("/history");
    await expect(page2.getByRole("checkbox")).toHaveCount(0);
    await app2.goto("/settings");
    await app2.button("common.backup.card.restore").click();
    const restore = page2.getByRole("dialog", { name: app2.t("common.backup.restore.title") });
    await restore.getByLabel(app2.t("common.backup.restore.file")).setInputFiles(file);
    await expect(restore.getByText(app2.plural("common.backup.preview.counts", 2).replace("{n}", "2").replace("{added}", "2").replace("{same}", "0").replace("{differ}", "0"))).toBeVisible();
    await restore.getByRole("button", { name: app2.t("common.backup.preview.action"), exact: true }).click();
    await expect(restore.getByRole("status")).toContainText(app2.t("common.backup.done.text", { added: 2, replaced: 0, both: 0, skipped: 0 }));
    await restore.getByRole("link", { name: app2.t("common.backup.done.history"), exact: true }).click();
    await expect(page2).toHaveURL(new RegExp(`/${lang}/history$`));
    await expect(page2.getByRole("checkbox")).toHaveCount(2);
    expect((await resultIds(page2, lang)).sort()).toEqual([...ids].sort());
    for (const id of ids) { await app2.goto(`/result/${id}`); await expect(app2.heading("report.title")).toBeVisible(); expect(await summaryOf(page2), id).toBe(summaries[id]); }
    await app2.simplified("restored result");

    // restoring the same file again changes nothing: every result is already here
    await app2.goto("/settings");
    await app2.button("common.backup.card.restore").click();
    const again = page2.getByRole("dialog", { name: app2.t("common.backup.restore.title") });
    await again.getByLabel(app2.t("common.backup.restore.file")).setInputFiles(file);
    await expect(again.getByText(app2.t("common.backup.preview.nothing"))).toBeVisible();
    await expect(again.getByRole("button", { name: app2.t("common.backup.preview.action"), exact: true })).toBeDisabled();

    // a file that is not a backup is refused in plain words
    await again.getByRole("button", { name: app2.t("common.backup.preview.another"), exact: true }).click();
    await again.getByLabel(app2.t("common.backup.restore.file")).setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("this is not a backup") });
    await expect(again.getByRole("alert")).toContainText(app2.t("common.backup.error.not-json"));
  } finally {
    await other.close();
  }
});

test("E24b: a backup protected with a passphrase shows nothing inside, needs the passphrase, and restores to an equal history", async ({ app, page, browser, lang }, testInfo) => {
  const PASS = "correct horse 9 battery";
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await app.goto("/history");
  const [id] = await resultIds(page, lang);
  await app.goto(`/result/${id}`);
  await expect(app.heading("report.title")).toBeVisible();
  const summary = await summaryOf(page);

  await app.goto("/settings");
  await app.button("common.backup.card.make").click();
  const dialog = page.getByRole("dialog", { name: app.t("common.backup.make.title") });
  await dialog.getByRole("checkbox", { name: new RegExp(`^${app.t("common.backup.passphrase.toggle")}`) }).check({ force: true });
  await expect(dialog.getByText(app.t("common.backup.passphrase.warning"))).toBeVisible();
  const download = dialog.getByRole("button", { name: app.t("common.backup.make.action"), exact: true });
  await expect(download).toBeDisabled();
  await dialog.getByLabel(app.t("common.backup.passphrase.label"), { exact: true }).fill(PASS);
  await dialog.getByLabel(app.t("common.backup.passphrase.again"), { exact: true }).fill(PASS);
  const [saved] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(saved.suggestedFilename()).toMatch(/\.encrypted\.json$/);
  const file = await saved.path();
  const text = readFileSync(file, "utf8");
  expect(JSON.parse(text)).toMatchObject({ format: "tcm-backup-encrypted", kdf: { name: "PBKDF2-SHA-256", iterations: 600000 }, cipher: { name: "AES-256-GCM" } });
  for (const word of [id!, "assessments", "payload", "exportedFrom"]) expect(text.includes(word), word).toBe(false);

  const use = testInfo.project.use;
  const other = await browser.newContext({ baseURL: use.baseURL ?? "", locale: use.locale ?? "en-US", timezoneId: use.timezoneId ?? "Asia/Taipei", viewport: use.viewport ?? null, isMobile: use.isMobile ?? false, hasTouch: use.hasTouch ?? false, serviceWorkers: "block" });
  try {
    const page2 = await other.newPage();
    const app2 = new App(page2, lang);
    await app2.goto("/settings");
    await app2.button("common.backup.card.restore").click();
    const restore = page2.getByRole("dialog", { name: app2.t("common.backup.restore.title") });
    await restore.getByLabel(app2.t("common.backup.restore.file")).setInputFiles(file);
    await expect(restore.getByText(app2.t("common.backup.unlock.intro"))).toBeVisible();
    await restore.getByLabel(app2.t("common.backup.passphrase.label"), { exact: true }).fill("not the passphrase");
    await restore.getByRole("button", { name: app2.t("common.backup.unlock.action"), exact: true }).click();
    await expect(restore.getByRole("alert")).toContainText(app2.t("common.backup.error.wrong-passphrase"));
    await restore.getByLabel(app2.t("common.backup.passphrase.label"), { exact: true }).fill(PASS);
    await restore.getByRole("button", { name: app2.t("common.backup.unlock.action"), exact: true }).click();
    await expect(restore.getByRole("button", { name: app2.t("common.backup.preview.action"), exact: true })).toBeVisible();
    await restore.getByRole("button", { name: app2.t("common.backup.preview.action"), exact: true }).click();
    await expect(restore.getByRole("status")).toContainText(app2.t("common.backup.done.text", { added: 1, replaced: 0, both: 0, skipped: 0 }));
    await app2.goto(`/result/${id}`);
    await expect(app2.heading("report.title")).toBeVisible();
    expect(await summaryOf(page2)).toBe(summary);
  } finally {
    await other.close();
  }
});

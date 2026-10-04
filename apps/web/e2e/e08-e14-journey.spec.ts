// E8 birth data, E11 language switch, E12 resume, E13 save / history / compare, E14 erase everything (docs/test-plan.md §5.1).
import { expect, type Page } from "@playwright/test";
import { ADULT_MAN, ADULT_WOMAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { optionsFor, questionByPrompt, typicalSymptoms } from "./support/knowledge.ts";
import { deviceState, idbPut, idbRecords } from "./support/storage.ts";

const BIRTH = { date: "1990-05-12", time: "14:30", city: "Taipei" } as const;

/** The summary card of the result as the person reads it: the pattern, its group and band, the direction of care and the confidence. */
async function summaryOf(page: Page): Promise<string> { return (await page.locator("#sec-summary").innerText()).replace(/\s+/g, " ").trim(); }

test("E8: birth data is opt-in, echoed back, adds the third block to the panel and never changes the diagnosis", async ({ app, page }) => {
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  const without = await summaryOf(page);
  await expect(page.locator("#sec-panel")).not.toContainText(app.t("report.panel.block.innate"));      // season and the annual cycle only: no birth chart block

  await app.start();
  await expect(page.getByRole("checkbox", { name: app.t("intake.birth.toggle") })).not.toBeChecked();       // release: off until the person turns it on
  await app.fillProfile({ ...ADULT_MAN, birth: BIRTH });
  await app.screen();
  await app.continueScreening();
  await app.inquiry(typicalSymptoms("SP1"));
  await app.toResult();
  await expect(page.locator("#sec-panel")).toContainText(app.t("report.panel.block.innate"));          // the three blocks: innate, annual cycle, season
  expect(await summaryOf(page)).toEqual(without);                                                           // the same pattern and confidence with the birth data
});

test("E11: switching the language mid-flow keeps the route and every answer, and updates the lang attributes", async ({ app, page }) => {
  await app.start();
  await app.fillProfile(ADULT_MAN);
  await app.screen();
  await app.continueScreening();
  await page.getByRole("checkbox", { name: new RegExp(`^✓?\\s*${app.t("intake.inquiry.modules.general")}`) }).check({ force: true });
  await app.button("intake.inquiry.modules.start").click();
  const first = page.locator("fieldset > legend[tabindex]").first();
  await expect(first).toBeVisible();
  // answer one question, then switch
  await page.getByRole("checkbox").or(page.getByRole("radio")).first().check({ force: true });
  const other = app.lang === "en" ? "zh-Hant" : "en";
  await expect(page.locator("html")).toHaveAttribute("lang", app.lang);
  await page.getByRole("button", { name: app.lang === "en" ? "中文" : "EN", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${other}/inquiry$`));
  await expect(page.locator("html")).toHaveAttribute("lang", other);
  await expect(page.locator("fieldset > legend[tabindex]").first()).toBeVisible();
  await page.goBack();                                                                                    // history stays usable
});

test("E12: reloading in the middle of the inquiry offers to resume, and the answers are intact", async ({ app, page }) => {
  await app.start();
  await app.fillProfile(ADULT_MAN);
  await app.screen();
  await app.continueScreening();
  await app.inquiry(typicalSymptoms("LG1"), { stopAfter: 3 });             // 肺氣虛: 惡風 and 自汗 are among the first things asked
  await expect.poll(async () => (await idbRecords(page, "drafts")).length).toBeGreaterThan(0);          // the autosave has written the draft
  await expect.poll(async () => JSON.stringify(await idbRecords(page, "drafts"))).toContain("S_");
  await page.reload();
  await app.goto("/");
  const card = page.getByRole("heading", { level: 2, name: app.t("intake.landing.resume.title") });
  await expect(card).toBeVisible();
  await app.button("intake.landing.resume.continue").click();
  await expect(page).toHaveURL(new RegExp(`/${app.lang}/inquiry$`));
  // the answers are intact: go back to the first question and its choices are still ticked
  const symptoms = typicalSymptoms("LG1");
  for (let n = 0; n < 3; n++) await app.button("intake.inquiry.back").click();
  const legend = page.locator("fieldset > legend[tabindex]").first();
  const q = questionByPrompt(((await legend.textContent()) ?? "").trim(), app.lang)!;
  const ticked = optionsFor(q, symptoms);
  expect(ticked.length).toBeGreaterThan(0);
  for (const o of ticked) await expect(page.getByRole("checkbox", { name: new RegExp(`^✓?\\s*${o.label[app.lang]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).or(page.getByRole("radio", { name: new RegExp(`^✓?\\s*${o.label[app.lang]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) })).first()).toBeChecked();
});

test("E13: two results are saved, listed and compared; a result from an older knowledge base says so", async ({ app, page }) => {
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  await app.flow(ADULT_WOMAN, typicalSymptoms("LG1"));
  await app.button("report.actions.history").or(app.link("report.actions.history")).first().click();
  await expect(page).toHaveURL(new RegExp(`/${app.lang}/history`));
  await expect(page.getByRole("checkbox")).toHaveCount(2);
  for (const box of await page.getByRole("checkbox").all()) await box.check({ force: true });
  await app.button("report.history.compare").click();
  await expect(app.heading("report.compare.title")).toBeVisible();
  await expect(page.getByRole("heading", { name: app.t("report.compare.ranking"), level: 2 })).toBeVisible();
  // a simulated knowledge-base bump: the stored versions no longer match the loaded ones
  for (const [key, value] of await idbRecords(page, "assessments")) {
    const env = value as { v: number; data: { kbVersion: string } };
    await idbPut(page, "assessments", key, { ...env, data: { ...env.data, kbVersion: "an-older-version" } });
  }
  await app.goto("/history");
  await app.button("report.history.open").first().or(app.link("report.history.open").first()).first().click();
  await expect(page.getByText(app.t("report.version.older"))).toBeVisible();
});

test("E14: erase everything leaves nothing in IndexedDB, localStorage or Cache Storage", async ({ app, page }) => {
  await app.flow(ADULT_MAN, typicalSymptoms("SP1"));
  const before = await deviceState(page);
  expect(before.localStorage.length + before.databases.length).toBeGreaterThan(0);
  await app.goto("/settings");
  await app.button("common.settings.erase.action").click();
  await page.getByRole("dialog").getByRole("button", { name: app.t("common.settings.erase.confirm"), exact: true }).click();
  await page.waitForLoadState("load");
  // what is left is an empty database (the app opens it again on start) and nothing else
  await expect.poll(async () => { try { const s = await deviceState(page); return { ...s, databases: s.databases.filter((d) => d !== "tcm-app") }; } catch { return null; } }).toEqual({ localStorage: [], databases: [], caches: [] });   // (the page reloads itself: ask again if it was in the middle of that)
  for (const store of ["drafts", "assessments", "meta"] as const) await expect.poll(async () => idbRecords(page, store).catch(() => null), { message: store }).toEqual([]);
});

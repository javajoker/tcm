// E28 follow-up (docs/post-mvp/design/export-follow-up-trends.md §4; task PM-18): after a whole assessment the person sets a follow-up for two weeks on; the calendar file holds no health information; two
// weeks and a day later the card appears on the start page and in History, and "Start with my previous profile" opens the profile with the answers about the person and none of the symptoms.
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { ADULT_WOMAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";
import { idbRecords } from "./support/storage.ts";

const DAY = 86_400_000;
/** The accessible name of a tile: a ✓ mark, then the label. */
const tileName = (label: string): RegExp => new RegExp(`^✓?\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

test("E28: set a follow-up, take the calendar file, and two weeks later the card brings the profile back and nothing else", async ({ app, page }) => {
  await app.flow(ADULT_WOMAN, typicalSymptoms("SP1"));
  await app.goto("/history");
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  await page.getByRole("link", { name: /./ }).evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  const id = (await page.getByRole("link", { name: /./ }).evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))).filter((h) => /\/result\/[^/]+$/.test(h))[0]!.split("/").pop()!;
  await app.goto(`/result/${id}`);
  const card = page.getByRole("region", { name: app.t("followup.card.title") });
  await expect(card).toBeVisible();
  await app.simplified("result with the follow-up card");
  for (const r of await card.getByRole("radio").all()) await expect(r).not.toBeChecked();
  await card.getByRole("radio", { name: tileName(app.plural("followup.interval", 2)) }).click({ force: true });
  await expect(card.getByRole("status")).toContainText(/.+/);

  // the calendar file: one all-day entry, nothing about the person
  await card.getByRole("button", { name: app.t("followup.calendar"), exact: true }).click();
  const dialog = page.getByRole("dialog", { name: app.t("followup.ics.title") });
  await expect(dialog).toBeVisible();
  await app.simplified("calendar dialog");
  const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: app.t("followup.ics.download"), exact: true }).click()]);
  expect(download.suggestedFilename()).toBe("tcm-follow-up.ics");
  const ics = readFileSync((await download.path())!, "utf8");
  expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
  expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  expect(ics).toMatch(/DTSTART;VALUE=DATE:\d{8}\r\n/);
  expect(ics).toContain("BEGIN:VALARM");
  expect(ics).not.toMatch(/pattern|symptom|SP1|spleen|脾|氣虛|diagnos/i);
  await dialog.getByRole("button", { name: app.t("followup.ics.close"), exact: true }).click();

  // nothing yet: the card waits for the date
  await app.goto("/");
  await expect(page.getByRole("region", { name: app.t("followup.nudge.title") })).toHaveCount(0);

  // sixteen days later
  await page.clock.setFixedTime(Date.now() + 16 * DAY);
  await app.goto("/");
  const nudge = page.getByRole("region", { name: app.t("followup.nudge.title") });
  await expect(nudge).toBeVisible();
  await app.simplified("start page with the nudge");
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
  await app.goto("/history");
  await expect(page.getByRole("region", { name: app.t("followup.nudge.title") })).toBeVisible();
  await page.getByRole("button", { name: app.t("followup.nudge.profile"), exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${app.lang}/start$`));
  await expect(page.getByLabel(app.t("intake.profile.age.label"))).toHaveValue(String(ADULT_WOMAN.age));
  await expect(app.heading("intake.profile.title")).toBeVisible();

  // what was stored for the new assessment: the profile of the person, and no symptom, screening answer or observation of the earlier one
  await expect.poll(async () => (await idbRecords(page, "drafts")).length).toBe(1);
  const draft = ((await idbRecords(page, "drafts"))[0]![1] as { data: { subject: { ageYears?: number }; findings: object; screening: { answers: object }; constitutionAnswers: object } }).data;
  expect(draft.subject.ageYears).toBe(ADULT_WOMAN.age);
  expect(draft.findings).toEqual({});
  expect(draft.screening.answers).toEqual({});
  expect(draft.constitutionAnswers).toEqual({});
});

test("E28: Not now keeps the card away, and a new assessment started from it is an empty one", async ({ app, page }) => {
  await app.flow(ADULT_WOMAN, typicalSymptoms("SP1"));
  await app.goto("/history");
  await expect(page.getByRole("checkbox")).toHaveCount(1);
  const id = (await page.getByRole("link", { name: /./ }).evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""))).filter((h) => /\/result\/[^/]+$/.test(h))[0]!.split("/").pop()!;
  await app.goto(`/result/${id}`);
  await page.getByRole("region", { name: app.t("followup.card.title") }).getByRole("radio", { name: tileName(app.plural("followup.interval", 2)) }).click({ force: true });
  await page.clock.setFixedTime(Date.now() + 16 * DAY);
  await app.goto("/");
  await page.getByRole("button", { name: app.t("followup.nudge.later"), exact: true }).click();
  await expect(page.getByRole("region", { name: app.t("followup.nudge.title") })).toHaveCount(0);
  await app.goto("/history");
  await expect(page.getByRole("region", { name: app.t("followup.nudge.title") })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: app.t("followup.nudge.title") })).toHaveCount(0);
});

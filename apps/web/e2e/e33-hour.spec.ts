// E33 the choice of hour (docs/post-mvp/design/five-phase-extensions.md §5; task PM-27), in real browsers: a birth time within about 15 minutes of a change of hour — measured in true solar time, not on the clock —
// is asked about before it is used: the computed hour is kept unless the person says otherwise, the other hour and *I am not sure* are one click away, the question comes again when the time changes and is not asked
// for a time that is far from a change or an hour that is unknown; the result says which hour its birth chart was made from, and the saved record keeps that choice and not the time.
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { ADULT_MAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";
import { typicalSymptoms } from "./support/knowledge.ts";
import { idbRecords } from "./support/storage.ts";

test.setTimeout(300_000);

/** Taipei on 12 May 1990: true solar time is about ten minutes ahead of the clock, so 22:55 is 23:05 — five minutes into 子 — and 14:30 is nowhere near a change. */
const NEAR = { date: "1990-05-12", time: "22:55", city: "Taipei" } as const;
const FAR = { ...NEAR, time: "14:30" } as const;
const KEY = { computed: "primary", other: "alternative", unsure: "unknown" } as const;

for (const answer of ["computed", "other", "unsure"] as const) {
  test(`E33: ${answer} — the result says which hour its birth chart was made from, and the record keeps the choice and not the time`, async ({ app, page }) => {
    await app.flow({ ...ADULT_MAN, birth: { ...NEAR, hour: answer } }, typicalSymptoms("SP1"));
    await expect(page.locator("#sec-panel")).toContainText(app.t("report.panel.block.innate"));
    const note = page.locator("#hour-note");
    await expect(note).toContainText(app.t(`report.panel.hour.${KEY[answer]}`));
    await app.simplified("result with the hour note");
    const records = await idbRecords(page, "assessments");
    expect(records).toHaveLength(1);
    const saved = (records[0]![1] as { data: { hour?: string; input: { birth?: unknown }; result: { reference: { birth: { pillars: unknown; trueSolarTime: unknown } } } } }).data;
    expect(saved.hour).toBe(KEY[answer]);
    expect(saved.input.birth, "the birth data is not remembered unless the person says so").toBeUndefined();
    expect(saved.result.reference.birth.pillars).toBeNull();
    expect(saved.result.reference.birth.trueSolarTime).toBeNull();
    await page.reload();                                                                                    // the sentence is the record's own, not the page's memory
    await expect(page.locator("#hour-note")).toContainText(app.t(`report.panel.hour.${KEY[answer]}`));
  });
}

test("E33: the question is asked for a time near a change, put again when the time changes, and not asked for a time far from one or for an hour that is unknown", async ({ app, page }) => {
  await app.start();
  await app.chooseSex("male");
  await app.fillBirth(NEAR);
  const group = page.getByRole("group", { name: app.t("intake.birth.hour.title") });
  await expect(group).toBeVisible();
  await expect(group).toContainText(app.t("intake.birth.hour.body.day", { margin: 15, earlier: "亥", later: "子" }));          // the start of 子: the day moves with the hour
  await app.simplified("birth card with the question");
  const radio = (key: "computed" | "other" | "unsure") => group.getByRole("radio", { name: new RegExp(`^✓?\\s*${app.t(`intake.birth.hour.${key}`).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });
  await expect(radio("computed")).toBeChecked();
  await radio("other").check({ force: true });
  await expect(radio("other")).toBeChecked();
  // the answer was about this time: a change to it asks again, and a time far from a change is not asked about
  await page.getByLabel(app.t("intake.birth.time")).fill(FAR.time);
  await expect(group).toHaveCount(0);
  await page.getByLabel(app.t("intake.birth.time")).fill(NEAR.time);
  await expect(group).toBeVisible();
  await expect(radio("computed")).toBeChecked();
  // an hour that is not known has nothing to choose
  await page.getByRole("checkbox", { name: new RegExp(`^✓?\\s*${app.t("intake.birth.unknownHour")}`) }).check({ force: true });
  await expect(group).toHaveCount(0);
});

async function clean(page: Page, where: string): Promise<void> {
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(violations.map((v) => `${where}: ${v.id} (${v.impact}) — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`), where).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test(`the birth card with the question about the hour (${scheme})`, async ({ app, page }) => {
      await app.start();
      await app.chooseSex("male");
      await app.fillBirth(NEAR);
      await expect(page.getByRole("group", { name: app.t("intake.birth.hour.title") })).toBeVisible();
      await clean(page, `birth card, hour (${scheme})`);
    });
  });
}

// E39 — AI help's conversation (PM-47; docs/post-mvp/design/ai-assisted-intake.md §1, §4): in the development build with the mock gateway, in three languages. The consent; the
// profile and the screening as always; the conversation from the module chooser; proposals with the person's own words, one confirmed and one rejected; the next question; a red
// flag in the words sends the person back to that item of the screening without sending them; back in the conversation the words wait; then the questions, with what was
// confirmed recorded.
import { expect } from "@playwright/test";
import { ADULT_MAN } from "./support/app.ts";
import { test } from "./support/fixtures.ts";

const GATEWAY = "http://127.0.0.1:8787";
const WORDS = { en: "I have a very bad headache, my hands and feet are often icy cold", "zh-Hant": "最近頭很痛，手腳常常冰冷", "zh-Hans": "最近头很痛，手脚常常冰冷" } as const;
const FLAG = { en: "I also had chest pain with a cold sweat", "zh-Hant": "還有胸口痛，冒冷汗", "zh-Hans": "还有胸口痛，冒冷汗" } as const;

test("E39: the conversation proposes with the person's words, counts only what is confirmed, and sends a red flag back to the screening unsent", async ({ app, page, lang }) => {
  const turns: string[] = [];
  page.on("request", (r) => { if (r.url().startsWith(`${GATEWAY}/v1/intake/turn`) && r.method() === "POST") turns.push(r.postData() ?? ""); });

  await app.goto("/settings");
  const settings = page.getByRole("region", { name: app.t("ai.settings.title") });
  await settings.getByRole("checkbox", { name: new RegExp(app.t("ai.settings.conversation")) }).click({ force: true });
  await page.getByRole("dialog", { name: app.t("ai.consent.title") }).getByRole("button", { name: app.t("ai.consent.confirm") }).click();
  await expect(settings.getByTestId("ai-service")).toHaveText(app.t("ai.settings.status.on"));

  await app.start();
  await app.fillProfile(ADULT_MAN);
  await app.screen();
  await app.continueScreening();
  await page.getByRole("region", { name: app.t("ai.entry.title") }).getByRole("link", { name: app.t("ai.entry.start") }).click();
  await expect(page.getByRole("heading", { level: 1, name: app.t("ai.talk.title") })).toBeVisible();
  await expect(page.getByText(app.t("ai.talk.opening"))).toBeVisible();

  // the person's words: proposals, each with the words that support it
  const input = page.getByLabel(app.t("ai.talk.input"));
  await input.fill(WORDS[lang]);
  await page.getByRole("button", { name: app.t("ai.talk.send"), exact: true }).click();
  const items = page.getByRole("region", { name: app.t("ai.talk.proposals.title") }).getByTestId("ai-proposal");
  await expect(items).toHaveCount(2);
  expect(turns).toHaveLength(1);
  const sent = JSON.parse(turns[0]!) as { messages: { role: string; text: string }[]; lang: string };
  expect(sent.lang).toBe(lang);
  expect(sent.messages.at(-1)).toEqual({ role: "person", text: WORDS[lang] });
  for (const word of ["35", "male", "ageYears"]) expect(turns[0]).not.toContain(word);

  // one confirmed, one rejected: only the confirmed one counts
  await items.first().getByRole("button", { name: app.t("ai.talk.proposal.yes") }).click();
  await page.getByTestId("ai-proposal").first().getByRole("button", { name: app.t("ai.talk.proposal.no") }).click();
  await expect(page.getByTestId("ai-proposal")).toHaveCount(0);
  await expect(page.getByRole("region", { name: app.t("ai.talk.confirmed.title") }).getByTestId("ai-confirmed")).toHaveCount(1);

  // a red flag in the words: not sent; the screening asks that item again
  await input.fill(FLAG[lang]);
  await page.getByRole("button", { name: app.t("ai.talk.send"), exact: true }).click();
  await expect(page.getByTestId("ai-reopened")).toBeVisible();
  expect(app.path()).toBe("/screen");
  expect(turns).toHaveLength(1);
  await app.screen();
  await app.continueScreening();

  // back in the conversation, the words wait
  await page.getByRole("region", { name: app.t("ai.entry.title") }).getByRole("link", { name: app.t("ai.entry.resume") }).click();
  await expect(page.getByLabel(app.t("ai.talk.input"))).toHaveValue(FLAG[lang]);

  // then the questions: what was confirmed is recorded
  await page.getByRole("link", { name: app.t("ai.talk.continue") }).click();
  await page.getByRole("checkbox", { name: new RegExp(app.t("intake.inquiry.modules.general")) }).check({ force: true });
  await page.getByRole("button", { name: app.t("intake.inquiry.modules.start"), exact: true }).click();
  // (the rail of what is recorded is a desktop rail: on a phone it is in the page but not shown)
  await expect(page.getByRole("complementary", { name: app.t("intake.inquiry.rail.title"), includeHidden: true })).toContainText(app.t("intake.inquiry.dimension.head-body"));
});

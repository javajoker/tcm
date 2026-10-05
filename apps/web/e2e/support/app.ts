// The way a person moves through the app, as one object per page: every locator is found by the words on the screen in the page language, never by an implementation detail.
import { expect, type Locator, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { msg, plural, type Lang } from "./i18n.ts";
import { traditionalOnPage } from "./hans.ts";
import { optionsFor, questionByPrompt, shown } from "./knowledge.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const RED_FLAGS = (JSON.parse(readFileSync(join(REPO, "data/diagnosis/red-flags.json"), "utf8")) as { items: { id: string; text: Record<string, string> }[] }).items;

export interface Profile {
  readonly age: number;
  readonly sex: "female" | "male";
  readonly pregnancy?: "no" | "possible" | "yes";
  readonly lactating?: boolean;
  readonly medications?: "none" | "unsure" | { readonly classes: readonly string[] };
  readonly allergies?: "none" | { readonly names: readonly string[] };
  /** Ids of the conditions (`RF_C_KIDNEY`, …) or "none". */
  readonly conditions?: "none" | readonly string[];
  /** Birth data (optional, opt-in in release): date, time and a city of the list. */
  readonly birth?: { readonly date: string; readonly time: string; readonly city: string; readonly remember?: boolean };
}

export const ADULT_MAN: Profile = { age: 35, sex: "male", medications: "none", allergies: "none", conditions: "none" };
export const ADULT_WOMAN: Profile = { age: 35, sex: "female", pregnancy: "no", lactating: false, medications: "none", allergies: "none", conditions: "none" };

const esc = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The accessible name of a tile: a ✓ mark, then the label (and, for some, a description after it). */
const tile = (label: string, whole = true): RegExp => new RegExp(`^✓?\\s*${esc(label)}${whole ? "$" : ""}`);

export class App {
  readonly page: Page;
  readonly lang: Lang;
  constructor(page: Page, lang: Lang) { this.page = page; this.lang = lang; }

  readonly plural = (key: string, n: number): string => plural(this.lang, key, n);
  readonly t = (key: string, params?: Readonly<Record<string, string | number>>): string => msg(this.lang, key, params);
  readonly main = (): Locator => this.page.locator("main");
  readonly button = (key: string, params?: Readonly<Record<string, string | number>>): Locator => this.page.getByRole("button", { name: this.t(key, params), exact: true });
  readonly link = (key: string): Locator => this.page.getByRole("link", { name: this.t(key), exact: true });
  readonly heading = (key: string, level = 1): Locator => this.page.getByRole("heading", { level, name: this.t(key), exact: true });
  readonly group = (key: string): Locator => this.page.getByRole("group", { name: new RegExp(`^${this.t(key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });

  /** In a Simplified page: nothing on screen is in the data's own (Traditional) script — text, accessible names, title. A no-op in the other languages. */
  async simplified(where: string): Promise<void> {
    if (this.lang !== "zh-Hans") return;
    expect(await traditionalOnPage(this.page), `Traditional text on the ${where}`).toEqual([]);
  }

  async goto(path = "/"): Promise<void> { await this.page.goto(`/${this.lang}${path === "/" ? "/" : path}`); }
  path(): string { return new URL(this.page.url()).pathname.replace(new RegExp(`^/${this.lang}`), "") || "/"; }

  /** The landing page: tick the acknowledgement and start. */
  async start(): Promise<void> {
    await this.goto("/");
    await this.page.getByRole("checkbox", { name: this.t("intake.landing.ack.label") }).check();
    await this.button("intake.landing.start").click();
    await expect(this.heading("intake.profile.title")).toBeVisible();
  }

  /** The basic profile: every required answer, then Continue. */
  async fillProfile(p: Profile): Promise<void> {
    await this.page.getByLabel(this.t("intake.profile.age.label")).fill(String(p.age));
    await this.group("intake.profile.sex.legend").getByRole("radio", { name: tile(this.t(`intake.profile.sex.${p.sex}`)) }).check({ force: true });
    if (p.sex === "female") {
      await this.group("intake.profile.pregnancy.legend").getByRole("radio", { name: tile(this.t(`intake.profile.pregnancy.${p.pregnancy ?? "no"}`)) }).check({ force: true });
      await this.group("intake.profile.lactating.legend").getByRole("radio", { name: tile(this.t(`intake.profile.lactating.${p.lactating ? "yes" : "no"}`)) }).check({ force: true });
    }
    const meds = p.medications ?? "none";
    const medsGroup = this.group("intake.profile.meds.legend");
    if (meds === "none") await medsGroup.getByRole("radio", { name: tile(this.t("intake.profile.meds.none")) }).check({ force: true });
    else if (meds === "unsure") await medsGroup.getByRole("radio", { name: tile(this.t("intake.profile.meds.unsure")) }).check({ force: true });
    else {
      await medsGroup.getByRole("radio", { name: tile(this.t("intake.profile.meds.some")) }).check({ force: true });
      for (const c of meds.classes) await this.group("intake.profile.meds.classes.legend").getByRole("checkbox", { name: tile(this.t(`intake.profile.meds.${c}`), false) }).check({ force: true });
    }
    const allergies = p.allergies ?? "none";
    const allergyGroup = this.group("intake.profile.allergy.legend");
    if (allergies === "none") await allergyGroup.getByRole("radio", { name: tile(this.t("intake.profile.allergy.none")) }).check({ force: true });
    else {
      await allergyGroup.getByRole("radio", { name: tile(this.t("intake.profile.allergy.some")) }).check({ force: true });
      for (const n of allergies.names) {
        await this.page.getByLabel(this.t("intake.profile.allergy.label")).fill(n);
        await this.button("intake.profile.tag.add").first().click();
      }
    }
    const conditions = p.conditions ?? "none";
    const cg = this.group("intake.profile.conditions.legend");
    if (conditions === "none") await cg.getByRole("checkbox", { name: tile(this.t("intake.profile.conditions.none")) }).check({ force: true });
    else for (const c of conditions) await cg.getByRole("checkbox", { name: tile(this.t(`intake.profile.conditions.${c}`)) }).check({ force: true });
    if (p.birth) await this.fillBirth(p.birth);
    await this.button("intake.profile.continue").click();
    await expect(this.heading("intake.screen.title")).toBeVisible();
  }

  /** The birth card: turned on if it is off, date, time, a city from the list; optionally "remember on this device". */
  async fillBirth(b: NonNullable<Profile["birth"]>): Promise<void> {
    const { page } = this;
    const toggle = page.getByRole("checkbox", { name: tile(this.t("intake.birth.toggle")) });
    if (!(await toggle.isChecked())) await toggle.check({ force: true });
    await page.getByLabel(this.t("intake.birth.date")).fill(b.date);
    await page.getByLabel(this.t("intake.birth.time")).fill(b.time);
    await page.getByRole("combobox", { name: this.t("intake.birth.city.label") }).fill(b.city);
    await page.getByRole("option").first().click();
    await expect(page.getByRole("status").filter({ hasText: /°/ })).toBeVisible();                       // the echo of what will be used: longitude, zone, true solar time
    if (b.remember) await page.getByRole("checkbox", { name: tile(this.t("intake.birth.remember"), false) }).check({ force: true });
  }

  /** The safety screening: the named red flags answered Yes, every other item No. Does not continue. */
  async screen(yes: readonly string[] = [], unsure: readonly string[] = []): Promise<void> {
    for (const [ids, answer] of [[yes, "yes"], [unsure, "unsure"]] as const) {
      for (const id of ids) {
        const f = RED_FLAGS.find((x) => x.id === id);
        if (!f) throw new Error(`no red flag ${id}`);
        await this.page.getByRole("radiogroup", { name: shown(f.text, this.lang) }).or(this.page.getByRole("group", { name: shown(f.text, this.lang) })).getByRole("radio", { name: this.t(`intake.screen.answer.${answer}`), exact: true }).check({ force: true });
      }
    }
    for (const b of await this.button("intake.screen.noneOfThese").all()) await b.click();
    await this.simplified("screening");
  }

  async continueScreening(): Promise<void> { await this.page.getByRole("button", { name: this.t("intake.profile.continue"), exact: true }).last().click(); }

  /** The acknowledgement of a blocking notice: the heading takes focus, the button acknowledges. */
  async acknowledgeNotice(): Promise<void> {
    const ack = this.page.getByRole("button", { name: this.t("safety.action.acknowledge"), exact: true });
    await expect(ack).toBeVisible();
    await ack.click();
  }

  /** The adaptive inquiry, answered like a person with these symptoms, until it says it has enough (or everything is asked). */
  async inquiry(symptoms: ReadonlySet<string>, opts: { readonly maxSteps?: number; readonly skip?: readonly string[]; readonly stopAfter?: number } = {}): Promise<number> {
    const { page } = this;
    await expect(page).toHaveURL(new RegExp(`/${this.lang}/inquiry$`));
    const start = this.button("intake.inquiry.modules.start");
    await expect(start.or(page.locator("fieldset > legend[tabindex]")).first()).toBeVisible();
    if (await start.isVisible()) {
      await page.getByRole("checkbox", { name: tile(this.t("intake.inquiry.modules.general"), false) }).check({ force: true });
      await start.click();
    }
    let asked = 0;
    for (let step = 0; step < (opts.maxSteps ?? 70); step++) {
      const finish = this.button("intake.inquiry.end.continue");
      const legend = page.locator("fieldset > legend[tabindex]").first();
      await expect(finish.or(legend).first()).toBeVisible();
      if (await finish.isVisible()) { await finish.click(); return asked; }
      const prompt = (await legend.textContent())?.trim() ?? "";
      await this.simplified(`question "${prompt}"`);
      const q = questionByPrompt(prompt, this.lang);
      if (!q) throw new Error(`unknown question "${prompt}"`);
      const ticks = opts.skip?.includes(q.id) ? [] : optionsFor(q, symptoms);
      if (ticks.length === 0) await this.button("intake.inquiry.skip").click();          // a look-in-the-mirror question this person has no sign for
      else {
        for (const o of ticks) await page.locator("label").filter({ has: page.getByText(shown(o.label, this.lang), { exact: true }) }).first().click();
        // a single choice moves on by itself (unless it asks how strong); several choices need Next
        const graded = ticks.some((o) => o.symptoms.some((sym) => q.graded.includes(sym)));
        if (q.select === "many" || graded) {
          const next = this.button("intake.inquiry.next");
          await expect(next, `"${prompt}" — ticked: ${ticks.map((o) => o.id).join(", ")}`).toBeEnabled({ timeout: 4000 });
          await next.click();
        }
      }
      asked++;
      if (opts.stopAfter !== undefined && asked >= opts.stopAfter) { await this.settle(prompt, legend); return asked; }
      await this.settle(prompt, legend);
    }
    throw new Error("the inquiry did not end");
  }

  /** After an answer: wait until the next question (or the end, or a conflict) is shown, and resolve a conflict with "both are true". */
  private async settle(previous: string, legend: Locator): Promise<void> {
    const { page } = this;
    const both = page.getByRole("radio", { name: this.t("intake.inquiry.conflict.both") });
    const confirm = this.button("intake.inquiry.conflict.confirm");
    const finish = this.button("intake.inquiry.end.continue");
    await expect(async () => {
      if (await both.isVisible()) { await both.check({ force: true }); await confirm.click(); }
      const text = (await legend.textContent({ timeout: 500 }).catch(() => null))?.trim();
      if (!(await finish.isVisible()) && text === previous && !(await both.isVisible())) throw new Error("still on the same question");
    }).toPass({ timeout: 10_000 });
  }

  /** From the end of the inquiry to the result: skip the observation, run the review. */
  async toResult(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`/${this.lang}/observe$`));
    await this.button("observe.hub.skip").or(this.link("observe.hub.skip")).first().click();
    await expect(this.heading("intake.review.title")).toBeVisible();
    await this.simplified("review");
    await this.button("intake.review.run").click();
    await expect(this.heading("report.title")).toBeVisible({ timeout: 30_000 });
    await this.simplified("result");
  }

  /** From the landing page to the observation hub (profile, screening, inquiry), without looking at the tongue or the pulse. */
  async toObserve(profile: Profile, symptoms: ReadonlySet<string>, redFlags: { yes?: readonly string[]; unsure?: readonly string[] } = {}): Promise<void> {
    await this.start();
    await this.fillProfile(profile);
    await this.screen(redFlags.yes, redFlags.unsure);
    await this.continueScreening();
    if (await this.page.getByRole("button", { name: this.t("safety.action.acknowledge"), exact: true }).isVisible().catch(() => false)) await this.acknowledgeNotice();
    await this.inquiry(symptoms);
    await expect(this.page).toHaveURL(new RegExp(`/${this.lang}/observe$`));
  }

  /** The review and the result, from the observation hub. */
  async reviewAndRun(): Promise<void> {
    const { page } = this;
    await page.getByRole("button", { name: new RegExp(`^(${this.t("observe.hub.skip")}|${this.t("observe.hub.continue")})$`) }).click();
    await expect(this.heading("intake.review.title")).toBeVisible();
    await this.simplified("review");
    await this.button("intake.review.run").click();
    await expect(this.heading("report.title")).toBeVisible({ timeout: 30_000 });
    await this.simplified("result");
  }

  /** The whole way, from the landing page to the result. */
  async flow(profile: Profile, symptoms: ReadonlySet<string>, redFlags: { yes?: readonly string[]; unsure?: readonly string[] } = {}, inquiry: { skip?: readonly string[] } = {}): Promise<void> {
    await this.start();
    await this.fillProfile(profile);
    await this.screen(redFlags.yes, redFlags.unsure);
    await this.continueScreening();
    if (await this.page.getByRole("button", { name: this.t("safety.action.acknowledge"), exact: true }).isVisible().catch(() => false)) await this.acknowledgeNotice();
    await this.inquiry(symptoms, inquiry);
    await this.toResult();
  }

  /** The sections of the result in the order they appear on the page (the headings of its cards). */
  async sectionIds(): Promise<string[]> { return this.page.locator("main section[id^='sec-'], main [id^='sec-']").evaluateAll((els) => els.map((e) => e.id)); }
}

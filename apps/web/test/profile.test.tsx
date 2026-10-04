import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { catalogs } from "../src/i18n/catalogs.ts";
import { isPregnancyRelevant, MED_CLASSES, medicationClasses, missingItems, parseAge, SERIOUS_CONDITIONS, subjectOf } from "../src/screens/profile/model.ts";
import { newDraft } from "../src/storage/draft.ts";
import type { Draft } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";

const kb = indexKnowledgeBase(rawChunksFromDisk("release"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

const complete = (over: Partial<Draft> = {}): Draft => ({
  ...newDraft("d", 1), subject: { ageYears: 40, sex: "male" }, profile: { medications: "none", medicationText: [], allergies: "none", conditions: "none" }, ...over,
});

describe("profile model", () => {
  it("parseAge accepts whole numbers 0–120 only", () => {
    expect(parseAge("0")).toBe(0); expect(parseAge(" 34 ")).toBe(34); expect(parseAge("120")).toBe(120);
    for (const bad of ["", " ", "abc", "-1", "121", "3.5", "1e2", "٣٤", "0x10", "1 2"]) expect(parseAge(bad)).toBeNull();
  });

  it("pregnancy is asked of females aged 10–60 only", () => {
    expect(isPregnancyRelevant("female", 10)).toBe(true);
    expect(isPregnancyRelevant("female", 60)).toBe(true);
    expect(isPregnancyRelevant("female", 9)).toBe(false);
    expect(isPregnancyRelevant("female", 61)).toBe(false);
    expect(isPregnancyRelevant("male", 30)).toBe(false);
    expect(isPregnancyRelevant(undefined, 30)).toBe(false);
    expect(isPregnancyRelevant("female", undefined)).toBe(false);
  });

  it("silence is never read as 'no': every question must be answered", () => {
    expect(missingItems(newDraft("d", 1))).toEqual(["age", "sex", "medications", "allergies", "conditions"]);
    expect(missingItems(complete())).toEqual([]);
    const f = complete({ subject: { ageYears: 30, sex: "female" } });
    expect(missingItems(f)).toEqual(["pregnancy", "lactating"]);
    expect(missingItems({ ...f, subject: { ...f.subject, pregnancy: "not-applicable", lactating: false } })).toEqual(["pregnancy"]);
    expect(missingItems({ ...f, subject: { ...f.subject, pregnancy: "no", lactating: false } })).toEqual([]);
  });

  it("medication classes: ticked ones; 'not sure' and free text mean 'other'; 'none' means none", () => {
    const base = complete();
    expect(medicationClasses(base)).toEqual([]);
    expect(medicationClasses({ ...base, profile: { ...base.profile, medications: "unsure" } })).toEqual(["other"]);
    expect(medicationClasses({ ...base, subject: { ...base.subject, medications: ["diuretic", "anticoagulant"] }, profile: { ...base.profile, medications: "some" } })).toEqual(["anticoagulant", "diuretic"]);
    expect(medicationClasses({ ...base, profile: { ...base.profile, medications: "some", medicationText: ["x"] } })).toEqual(["other"]);
    expect(medicationClasses({ ...base, subject: { ...base.subject, medications: ["diuretic"] } })).toEqual([]);          // stale ticks without the "some" answer are ignored
  });

  it("subjectOf is null until complete, then engine-ready (not-applicable pregnancy for those not asked)", () => {
    expect(subjectOf(newDraft("d", 1))).toBeNull();
    expect(subjectOf(complete())).toEqual({ ageYears: 40, sex: "male", pregnancy: "not-applicable", lactating: false, medications: [], allergies: [], seriousChronicDisease: false });
    const f = complete({ subject: { ageYears: 30, sex: "female", pregnancy: "possible", lactating: true, allergies: ["花生"] }, profile: { medications: "none", medicationText: [], allergies: "some", conditions: "some" } });
    expect(subjectOf(f)).toMatchObject({ pregnancy: "possible", lactating: true, allergies: ["花生"], seriousChronicDisease: true });
    const male = complete({ subject: { ageYears: 30, sex: "male", pregnancy: "yes", lactating: true } });
    expect(subjectOf(male)).toMatchObject({ pregnancy: "not-applicable", lactating: false });                              // stale answers from a changed sex are ignored
    expect(subjectOf(complete({ subject: { ageYears: 40, sex: "male", allergies: ["x"] } }))?.allergies).toEqual([]);          // allergies "none" wins over stale entries
  });

  it("the Subject it builds drives the scope policy: pregnancy, minors, anticoagulants and serious conditions raise their notices", () => {
    const notices = (d: Draft): string[] => engine.assess(kb, { subject: subjectOf(d)!, redFlags: new Set(d.redFlags), findings: {}, options: { now: 0, birthModule: false } }).policy.notices.map((n) => n.id);
    expect(notices(complete())).toEqual(expect.not.arrayContaining(["N-PREG", "N-MINOR", "N-MED", "N-SERIOUS"]));
    expect(notices(complete({ subject: { ageYears: 30, sex: "female", pregnancy: "possible", lactating: false } }))).toContain("N-PREG");
    expect(notices(complete({ subject: { ageYears: 30, sex: "female", pregnancy: "no", lactating: true } }))).toContain("N-LACT");
    expect(notices(complete({ subject: { ageYears: 12, sex: "male" } }))).toContain("N-MINOR");
    expect(notices(complete({ subject: { ageYears: 50, sex: "male", medications: ["anticoagulant"] }, profile: { medications: "some", medicationText: [], allergies: "none", conditions: "none" } }))).toContain("N-MED");
    expect(notices(complete({ subject: { ageYears: 50, sex: "male" }, redFlags: ["RF_C_KIDNEY"], profile: { medications: "none", medicationText: [], allergies: "none", conditions: "some" } }))).toContain("N-SERIOUS");
  });

  it("the serious-condition wording equals the red-flag items of the knowledge base, in both languages", () => {
    const raw = JSON.parse(readFileSync(resolvePath(process.cwd(), "../../data/diagnosis/red-flags.json"), "utf8")) as { items: { id: string; text: { "zh-Hant": string; en: string } }[] };
    for (const id of SERIOUS_CONDITIONS) {
      const item = raw.items.find((i) => i.id === id)!;
      expect((catalogs["zh-Hant"] as Record<string, unknown>)[`intake.profile.conditions.${id}`]).toBe(item.text["zh-Hant"].replace("癌症治療中", "癌症治療中"));
      expect(typeof (catalogs.en as Record<string, unknown>)[`intake.profile.conditions.${id}`]).toBe("string");
    }
  });

  it("every medicine class has a label and an example line in both languages", () => {
    for (const c of MED_CLASSES) for (const lang of ["zh-Hant", "en"] as const) for (const key of [`intake.profile.meds.${c}`, `intake.profile.meds.${c}.eg`]) expect(typeof (catalogs[lang] as Record<string, unknown>)[key], `${lang} ${key}`).toBe("string");
  });
});

// ── the screen ───────────────────────────────────────────────────────────────

async function open(lang: "en" | "zh-Hant" = "en", opts: { acknowledged?: boolean; draft?: boolean; wait?: boolean } = {}): Promise<ReturnType<typeof renderApp>> {
  go(`/${lang}/start`);
  const env = fakeEnvironment();
  if (opts.acknowledged !== false) env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const { store } = testStore(env);
  if (opts.draft !== false) store.getState().startDraft();
  const view = renderApp(store, () => Promise.resolve(loaded));
  if (opts.wait !== false && opts.draft !== false && opts.acknowledged !== false) await screen.findByRole("heading", { level: 1 });      // the stored draft is read asynchronously
  return view;
}
const cont = (name = "Continue"): HTMLElement => screen.getByRole("button", { name });
const pick = (group: string | RegExp, option: string | RegExp): Promise<void> => {
  const g = within(screen.getByRole("group", { name: group }));
  return userEvent.click(g.queryByRole("radio", { name: option }) ?? g.getByRole("checkbox", { name: option }));
};

describe("Profile screen (S02)", () => {
  it("starts with every required answer missing, Continue disabled and the reason visible", async () => {
    const { store } = await open();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Basic profile");
    expect(cont()).toBeDisabled();
    expect(cont()).toHaveAccessibleDescription("Still needed: age, sex at birth, medicines, allergies, and health conditions");
    expect(store.getState().draft?.position.route).toBe("/start");
  });

  it("validates the age inline after leaving the field", async () => {
    await open();
    const age = screen.getByRole("textbox", { name: /Age \(years\)/ });
    await userEvent.click(age);
    await userEvent.tab();
    expect(screen.getByText("Enter your age.")).toBeInTheDocument();
    await userEvent.type(age, "abc");
    expect(screen.getByText("Age must be a whole number from 0 to 120.")).toBeInTheDocument();
    expect(age).toBeInvalid();
    await userEvent.clear(age);
    await userEvent.type(age, "34");
    expect(screen.queryByText(/Age must be|Enter your age/)).toBeNull();
    expect(age).toBeValid();
  });

  it("asks about pregnancy and breastfeeding only of females of child-bearing age", async () => {
    const { store } = await open();
    await userEvent.type(screen.getByRole("textbox", { name: /Age/ }), "34");
    await pick("Sex at birth", "Male");
    expect(screen.queryByRole("heading", { name: "Pregnancy and breastfeeding" })).toBeNull();
    await pick("Sex at birth", "Female");
    expect(screen.getByRole("heading", { name: "Pregnancy and breastfeeding" })).toBeInTheDocument();
    expect(cont()).toHaveAccessibleDescription(expect.stringContaining("pregnancy"));
    await pick(/Are you pregnant/, "Possibly");
    await pick(/Are you breastfeeding/, "No");
    expect(store.getState().draft?.subject).toMatchObject({ ageYears: 34, sex: "female", pregnancy: "possible", lactating: false });
    expect(screen.getByText("“Possibly” is handled as pregnant, to be safe.")).toBeInTheDocument();
  });

  it("a complete profile enables Continue, which goes to the screening; the answers are in the draft", async () => {
    const { store } = await open();
    await userEvent.type(screen.getByRole("textbox", { name: /Age/ }), "52");
    await pick("Sex at birth", "Male");
    await pick(/regularly take any medicines/, "No");
    await pick(/herb or food allergies/, "No");
    await pick(/Do any of these apply/, "None of these");
    expect(cont()).toBeEnabled();
    expect(screen.queryByText(/Still needed/)).toBeNull();
    await userEvent.click(cont());
    expect(window.location.pathname).toBe("/en/screen");
    const d = store.getState().draft!;
    expect(subjectOf(d)).toMatchObject({ ageYears: 52, sex: "male", medications: [], allergies: [], seriousChronicDisease: false });
  });

  it("medicines: classes appear on 'Yes', free text under 'Other', and switching to 'No' clears them", async () => {
    const { store } = await open();
    await pick(/regularly take any medicines/, "Yes — choose the classes");
    await pick(/Medicine classes/, /Anticoagulant/);
    await pick(/Medicine classes/, /Other, or not on this list/);
    const name = screen.getByRole("textbox", { name: "Medicine name (optional)" });
    await userEvent.type(name, "Foo{Enter}");
    await userEvent.type(name, "Foo");                                              // a duplicate is ignored
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Foo×"]);
    expect(store.getState().draft?.subject.medications).toEqual(["anticoagulant", "other"]);
    expect(store.getState().draft?.profile.medicationText).toEqual(["Foo"]);
    await userEvent.click(screen.getByRole("button", { name: "Remove Foo" }));
    expect(store.getState().draft?.profile.medicationText).toEqual([]);
    await pick(/regularly take any medicines/, "No");
    expect(screen.queryByRole("group", { name: /Medicine classes/ })).toBeNull();
    expect(store.getState().draft?.subject.medications).toBeUndefined();
  });

  it("'Not sure' about medicines is handled conservatively and says so", async () => {
    const { store } = await open();
    await pick(/regularly take any medicines/, "Not sure");
    expect(screen.getByText(/we assume you may take a medicine that can interact/)).toBeInTheDocument();
    expect(medicationClasses(store.getState().draft!)).toEqual(["other"]);
  });

  it("allergies: names are added with Enter, suggested from the knowledge base once loaded, and removable", async () => {
    const { store } = await open();
    await pick(/herb or food allergies/, "Yes");
    const input = screen.getByLabelText("Allergen (herb or food)");
    await userEvent.type(input, "peanut{Enter}");
    expect(store.getState().draft?.subject.allergies).toEqual(["peanut"]);
    await waitFor(() => expect(document.querySelectorAll("datalist option").length).toBeGreaterThan(10));
    await userEvent.click(screen.getByRole("button", { name: "Remove peanut" }));
    expect(store.getState().draft?.subject.allergies).toEqual([]);
    await pick(/herb or food allergies/, "No");
    expect(screen.queryByLabelText("Allergen (herb or food)")).toBeNull();
  });

  it("serious conditions go to the red flags; 'None of these' is exclusive", async () => {
    const { store } = await open();
    await pick(/Do any of these apply/, "Dialysis or kidney failure");
    await pick(/Do any of these apply/, "Currently being treated for cancer");
    expect(store.getState().draft?.redFlags).toEqual(["RF_C_KIDNEY", "RF_C_CANCER_TREATMENT"]);
    expect(store.getState().draft?.profile.conditions).toBe("some");
    await pick(/Do any of these apply/, "None of these");
    expect(store.getState().draft?.redFlags).toEqual([]);
    expect(store.getState().draft?.profile.conditions).toBe("none");
    await pick(/Do any of these apply/, "After an organ transplant");
    expect(store.getState().draft?.redFlags).toEqual(["RF_C_TRANSPLANT"]);
    expect(within(screen.getByRole("group", { name: /Do any of these apply/ })).getByRole("checkbox", { name: "None of these" })).not.toBeChecked();
    await pick(/Do any of these apply/, "After an organ transplant");               // untick the last one: unanswered again
    expect(store.getState().draft?.profile.conditions).toBeUndefined();
  });

  it("a stored draft is shown filled in after a reload", async () => {
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang: "en" }));
    const a = testStore(env);
    a.store.getState().startDraft();
    a.store.getState().updateDraft((d) => ({ ...d, subject: { ageYears: 29, sex: "female", pregnancy: "no", lactating: false }, profile: { ...d.profile, medications: "none" } }));
    await a.store.flush();
    go("/en/start");
    renderApp(testStore(env).store);
    expect(await screen.findByRole("textbox", { name: /Age/ })).toHaveValue("29");
    expect(screen.getByRole("radio", { name: "Female" })).toBeChecked();
    expect(within(screen.getByRole("group", { name: /Are you pregnant/ })).getByRole("radio", { name: "No" })).toBeChecked();
  });

  it("opening it directly: without the acknowledgement go to the landing page; with it, start a draft", async () => {
    const first = await open("en", { acknowledged: false, draft: false, wait: false });
    await waitFor(() => expect(window.location.pathname).toBe("/en/"));
    first.unmount();
    const { store } = await open("en", { acknowledged: true, draft: false });
    await waitFor(() => expect(store.getState().draft).not.toBeNull());
    expect(await screen.findByRole("textbox", { name: /Age/ })).toBeInTheDocument();
  });

  it("is in Traditional Chinese on the zh-Hant route", async () => {
    await open("zh-Hant");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("基本資料");
    expect(cont("繼續")).toHaveAccessibleDescription("還需要填寫：年齡、出生時的性別、用藥情況、過敏情況和健康狀況");
  });

  it.each(["en", "zh-Hant"] as const)("has no axe violations with every section open (%s)", async (lang) => {
    const { store, container } = await open(lang);
    store.getState().updateDraft((d) => ({ ...d, subject: { ageYears: 30, sex: "female", medications: ["other"], allergies: ["x"] }, profile: { medications: "some", medicationText: ["y"], allergies: "some", conditions: "some" }, redFlags: ["RF_C_KIDNEY"] }));
    await screen.findAllByRole("heading", { level: 2 });
    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

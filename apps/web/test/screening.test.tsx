import { cleanup, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { subjectOf } from "../src/screens/profile/model.ts";
import { answerOf, askedItems, blockingNotices, needsCorrectionConfirm, noticeKey, pendingNotices, profileSituations, unanswered, withAcknowledged, withAnswer } from "../src/screens/screening/model.ts";
import { newDraft } from "../src/storage/draft.ts";
import type { Draft } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";

const kb = indexKnowledgeBase(rawChunksFromDisk("release"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); process.env.TZ = "Asia/Taipei"; });

const adult = (over: Partial<Draft> = {}): Draft => ({
  ...newDraft("d", 1), subject: { ageYears: 40, sex: "male" }, profile: { medications: "none", medicationText: [], allergies: "none", conditions: "none" }, ...over,
});
const text = (id: string, lang: "en" | "zh-Hant" = "en"): string => kb.redFlags.find((f) => f.id === id)!.text[lang];
const A = askedItems(kb).A.map((f) => f.id), B = askedItems(kb).B.map((f) => f.id);

describe("screening model", () => {
  it("the asked items are the level A and B items of the knowledge base", () => {
    expect(A.length).toBe(9); expect(B.length).toBe(10);
    expect(A.every((id) => id.startsWith("RF_A_"))).toBe(true);
    expect(B.every((id) => id.startsWith("RF_B_"))).toBe(true);
    expect(unanswered(kb, adult()).length).toBe(19);
  });

  it("yes and unsure go to the engine's red flags (unsure counts as yes); no removes", () => {
    let d = withAnswer(adult(), "RF_A_CHEST_PAIN", "yes");
    expect(d.redFlags).toEqual(["RF_A_CHEST_PAIN"]);
    d = withAnswer(d, "RF_A_CHEST_PAIN", "unsure");
    expect(d.redFlags).toEqual(["RF_A_CHEST_PAIN"]);
    expect(answerOf(d, "RF_A_CHEST_PAIN")).toBe("unsure");
    d = withAnswer(d, "RF_A_CHEST_PAIN", "no", { corrected: true });
    expect(d.redFlags).toEqual([]);
    expect(d.screening.corrected).toEqual(["RF_A_CHEST_PAIN"]);
    expect(withAnswer(d, "RF_A_CHEST_PAIN", "no", { corrected: true }).screening.corrected).toEqual(["RF_A_CHEST_PAIN"]);       // recorded once
  });

  it("keeps the profile's serious-condition red flags when answers change", () => {
    const d = withAnswer(adult({ redFlags: ["RF_C_KIDNEY"] }), "RF_B_VOMITING", "yes");
    expect([...d.redFlags].sort()).toEqual(["RF_B_VOMITING", "RF_C_KIDNEY"]);
    expect(withAnswer(d, "RF_B_VOMITING", "no").redFlags).toEqual(["RF_C_KIDNEY"]);
  });

  it("only yes/unsure → no needs the 'I made a mistake' confirmation", () => {
    const d = withAnswer(adult(), "RF_A_SEIZURE", "yes");
    expect(needsCorrectionConfirm(d, "RF_A_SEIZURE", "no")).toBe(true);
    expect(needsCorrectionConfirm(d, "RF_A_SEIZURE", "unsure")).toBe(false);
    expect(needsCorrectionConfirm(adult(), "RF_A_SEIZURE", "no")).toBe(false);                       // first answer
    expect(needsCorrectionConfirm(withAnswer(adult(), "RF_A_SEIZURE", "no"), "RF_A_SEIZURE", "yes")).toBe(false);
  });

  it("the blocking notices equal the engine's policy for the same person (E2–E4)", () => {
    const cases: [string, Draft][] = [
      ["healthy adult", adult()],
      ["A yes", withAnswer(adult(), "RF_A_CHEST_PAIN", "yes")],
      ["A unsure", withAnswer(adult(), "RF_A_DYSPNEA", "unsure")],
      ["B yes", withAnswer(adult(), "RF_B_JAUNDICE", "yes")],
      ["A and B", withAnswer(withAnswer(adult(), "RF_B_JAUNDICE", "yes"), "RF_A_SEIZURE", "yes")],
      ["B + minor", withAnswer(adult({ subject: { ageYears: 15, sex: "male" } }), "RF_B_VOMITING", "yes")],
      ["pregnant", adult({ subject: { ageYears: 30, sex: "female", pregnancy: "possible", lactating: false } })],
      ["breastfeeding", adult({ subject: { ageYears: 30, sex: "female", pregnancy: "no", lactating: true } })],
      ["serious", adult({ redFlags: ["RF_C_LIVER"], profile: { medications: "none", medicationText: [], allergies: "none", conditions: "some" } })],
      ["elderly", adult({ subject: { ageYears: 70, sex: "male" } })],
    ];
    for (const [name, d] of cases) {
      const viaEngine = engine.assess(kb, { subject: subjectOf(d)!, redFlags: new Set(d.redFlags), findings: {}, options: { now: 0, birthModule: false } }).policy.notices.filter((n) => n.kind === "blocking_ack");
      expect(blockingNotices(kb, d), name).toEqual(viaEngine);
    }
    expect(blockingNotices(kb, adult()).length).toBe(0);
    expect(blockingNotices(kb, withAnswer(adult(), "RF_A_DYSPNEA", "unsure"))[0]).toMatchObject({ id: "N-A", reasons: ["RF_A_DYSPNEA"] });
    expect(blockingNotices(kb, withAnswer(adult({ subject: { ageYears: 15, sex: "male" } }), "RF_B_VOMITING", "yes")).map((n) => n.id)).toEqual(["N-B", "N-MINOR"]);   // one merged screen, most severe first
    expect(blockingNotices(kb, newDraft("x", 1))).toEqual([]);                                  // incomplete profile: nothing to show yet
  });

  it("an acknowledgement covers exactly the reasons it was given for", () => {
    const d1 = withAnswer(adult(), "RF_A_CHEST_PAIN", "yes");
    expect(pendingNotices(kb, d1).map(noticeKey)).toEqual(["N-A|RF_A_CHEST_PAIN"]);
    const d2 = withAcknowledged(d1, pendingNotices(kb, d1), 777);
    expect(pendingNotices(kb, d2)).toEqual([]);
    expect(d2.acknowledgements).toEqual(["N-A"]);
    expect(d2.screening.acknowledgedAt["N-A|RF_A_CHEST_PAIN"]).toBe(777);
    const d3 = withAnswer(d2, "RF_A_SEIZURE", "yes");                                          // a new reason → acknowledge again
    expect(pendingNotices(kb, d3).map(noticeKey)).toEqual(["N-A|RF_A_CHEST_PAIN,RF_A_SEIZURE"]);
  });

  it("profileSituations lists what the profile implies", () => {
    expect(profileSituations(adult())).toEqual([]);
    expect(profileSituations(adult({ subject: { ageYears: 15, sex: "female", pregnancy: "possible", lactating: true }, redFlags: ["RF_C_KIDNEY", "RF_B_X"] }))).toEqual(["RF_C_MINOR", "RF_C_PREGNANT", "RF_C_LACTATING", "RF_C_KIDNEY"]);
  });
});

// ── the screens ──────────────────────────────────────────────────────────────

async function open(lang: "en" | "zh-Hant" = "en", draft: Draft = adult(), extra: { prefs?: Record<string, unknown>; loaded?: Loaded } = {}): Promise<ReturnType<typeof renderApp>> {
  go(`/${lang}/screen`);
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang, ...extra.prefs }));
  const { store } = testStore(env);
  store.getState().startDraft();
  store.getState().updateDraft((d) => ({ ...draft, id: d.id, startedAt: d.startedAt, position: { route: "/screen" } }));
  const view = renderApp(store, () => Promise.resolve(extra.loaded ?? loaded));
  await screen.findByRole("heading", { level: 1, name: lang === "en" ? "Safety screening" : "安全篩檢" });
  await screen.findByRole("group", { name: text("RF_A_CHEST_PAIN", lang) });
  return view;
}
const item = (id: string, lang: "en" | "zh-Hant" = "en"): HTMLElement => screen.getByRole("group", { name: text(id, lang) });
const answer = (id: string, label: string, lang: "en" | "zh-Hant" = "en"): Promise<void> => userEvent.click(within(item(id, lang)).getByRole("radio", { name: label }));
const allNo = async (): Promise<void> => { for (const b of screen.getAllByRole("button", { name: "Answer No to every item in this group" })) await userEvent.click(b); };

describe("Screening screen (S04)", () => {
  it("asks every level A and B item of the knowledge base, with the Continue reason visible", async () => {
    await open();
    expect(screen.getAllByRole("radio", { name: "Yes" }).length).toBe(19);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue" })).toHaveAccessibleDescription("19 questions are not answered yet");
    await allNo();
    await answer("RF_A_CHEST_PAIN", "Yes");
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("a person with nothing to report goes straight to the inquiry — no notice", async () => {
    const { store } = await open();
    await allNo();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(window.location.pathname).toBe("/en/inquiry");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(store.getState().draft?.redFlags).toEqual([]);
  });

  it("E2: an emergency sign gives the blocking notice with the number; only the acknowledge action closes it; the flow continues", async () => {
    const { store } = await open();
    await allNo();
    await answer("RF_A_CHEST_PAIN", "Yes");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Please get emergency help now" });
    expect(dialog).toHaveTextContent(`You selected "${text("RF_A_CHEST_PAIN")}"`);
    expect(dialog).toHaveTextContent("Please call 119 now");
    expect(document.activeElement).toBe(within(dialog).getByRole("heading", { level: 2 }));
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);                                                  // Esc does not dismiss
    await userEvent.click(dialog);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();                                  // nor does the backdrop
    expect(window.location.pathname).toBe("/en/screen");

    await userEvent.click(within(dialog).getByRole("button", { name: "Show emergency numbers" }));
    expect(within(dialog).getByRole("link", { name: /Call 119/ })).toHaveAttribute("href", "tel:119");
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Region" }), "HK");
    expect(within(dialog).getByRole("link", { name: /Call 999/ })).toHaveAttribute("href", "tel:999");
    expect(dialog).toHaveTextContent("Please call 999 now");                                      // the text follows the region
    expect(store.getState().prefs.region).toBe("HK");

    await userEvent.click(within(dialog).getByRole("button", { name: "I understand — continue" }));
    expect(window.location.pathname).toBe("/en/inquiry");
    const d = store.getState().draft!;
    expect(d.acknowledgements).toEqual(["N-A"]);
    expect(d.screening.acknowledgedAt["N-A|RF_A_CHEST_PAIN"]).toBeTypeOf("number");
    expect(d.redFlags).toEqual(["RF_A_CHEST_PAIN"]);
  });

  it("'not sure' is handled as yes and is labelled in the notice", async () => {
    await open();
    await allNo();
    await answer("RF_A_SEIZURE", "Not sure");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(`You selected "${text("RF_A_SEIZURE")} (not sure)"`);
  });

  it("E3: a B sign and a minor give ONE merged notice, the most severe first", async () => {
    await open("en", adult({ subject: { ageYears: 15, sex: "male" } }));
    expect(screen.getByText("Under 18")).toBeInTheDocument();                                    // shown from the profile
    await allNo();
    await answer("RF_B_VOMITING", "Yes");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
    const headings = within(dialog).getAllByRole("heading").map((h) => h.textContent);
    expect(headings.slice(0, 2)).toEqual(["Please see a doctor soon (within 24 hours)", "Please have a pediatrician or licensed practitioner assess this"]);
    expect(within(dialog).getByText("Also noted")).toBeInTheDocument();
  });

  it("E4: pregnancy gives its notice even when every answer is no, and the flow continues", async () => {
    await open("en", adult({ subject: { ageYears: 30, sex: "female", pregnancy: "yes", lactating: false } }));
    await allNo();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Please talk to your doctor first during pregnancy" });
    expect(within(dialog).queryByRole("button", { name: "Show emergency numbers" })).toBeNull();     // no numbers for a scope notice
    await userEvent.click(within(dialog).getByRole("button", { name: "I understand — continue" }));
    expect(window.location.pathname).toBe("/en/inquiry");
  });

  it("the self-harm item shows the crisis line without being asked", async () => {
    await open();
    await allNo();
    await answer("RF_A_SELF_HARM", "Yes");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("Crisis support")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Call 1925/ })).toHaveAttribute("href", "tel:1925");
  });

  it("changing a yes/unsure to no needs the explicit 'I made a mistake' action, which is recorded", async () => {
    const { store } = await open();
    await answer("RF_B_NEW_MASS", "Yes");
    await answer("RF_B_NEW_MASS", "No");
    let confirm = screen.getByRole("dialog", { name: "Change this answer?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect(within(item("RF_B_NEW_MASS")).getByRole("radio", { name: "Yes" })).toBeChecked();
    await answer("RF_B_NEW_MASS", "No");
    confirm = screen.getByRole("dialog", { name: "Change this answer?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "I made a mistake — correct it" }));
    expect(within(item("RF_B_NEW_MASS")).getByRole("radio", { name: "No" })).toBeChecked();
    expect(store.getState().draft?.screening.corrected).toEqual(["RF_B_NEW_MASS"]);
    expect(store.getState().draft?.redFlags).toEqual([]);
  });

  it("an acknowledged notice is not shown again unless its reasons change", async () => {
    const { store } = await open();
    await allNo();
    await answer("RF_B_HEMATURIA", "Yes");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "I understand — continue" }));
    go("/en/screen");
    fireEvent(window, new PopStateEvent("popstate"));
    await screen.findByRole("heading", { level: 1, name: "Safety screening" });
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(window.location.pathname).toBe("/en/inquiry");                                         // same reasons: straight on
    go("/en/screen");
    fireEvent(window, new PopStateEvent("popstate"));
    await screen.findByRole("heading", { level: 1, name: "Safety screening" });
    await answer("RF_B_JAUNDICE", "Yes");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();                           // a new reason: acknowledge again
    expect(Object.keys(store.getState().draft!.screening.acknowledgedAt)).toEqual(["N-B|RF_B_HEMATURIA"]);
  });

  it("is in Traditional Chinese on the zh-Hant route, with the emergency wording from the policy", async () => {
    await open("zh-Hant");
    for (const b of screen.getAllByRole("button", { name: "此組全部選「沒有」" })) await userEvent.click(b);
    await userEvent.click(within(item("RF_A_STROKE", "zh-Hant")).getByRole("radio", { name: "有" }));
    await userEvent.click(screen.getByRole("button", { name: "繼續" }));
    const dialog = await screen.findByRole("alertdialog", { name: "請立即尋求緊急協助" });
    expect(dialog).toHaveTextContent("請立刻撥打 119");
    expect(within(dialog).getByRole("button", { name: "我已了解，繼續" })).toBeInTheDocument();
  });

  it.each(["en", "zh-Hant"] as const)("has no axe violations, with the notice open (%s)", async (lang) => {
    const { container } = await open(lang);
    for (const b of screen.getAllByRole("button", { name: lang === "en" ? "Answer No to every item in this group" : "此組全部選「沒有」" })) await userEvent.click(b);
    await userEvent.click(within(item("RF_A_STROKE", lang)).getByRole("radio", { name: lang === "en" ? "Yes" : "有" }));
    await userEvent.click(screen.getByRole("button", { name: lang === "en" ? "Continue" : "繼續" }));
    await screen.findByRole("alertdialog");
    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

describe("the region of the emergency numbers (no silent default)", () => {
  const emergency = async (setup: () => void, extra: Parameters<typeof open>[2] = {}): Promise<HTMLElement> => {
    setup();
    await open("en", adult(), extra);
    await allNo();
    await answer("RF_A_CHEST_PAIN", "Yes");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    return screen.findByRole("alertdialog", { name: "Please get emergency help now" });
  };
  const zone = (tz: string) => (): void => { process.env.TZ = tz; };

  it("a device in a listed region gets that region's numbers, and is told where the region came from", async () => {
    const dialog = await emergency(zone("America/New_York"));
    expect(dialog).toHaveTextContent("Please call 911 now");
    await userEvent.click(within(dialog).getByRole("button", { name: "Show emergency numbers" }));
    expect(within(dialog).getByRole("combobox", { name: "Region" })).toHaveValue("US");
    expect(within(dialog).getByText("Chosen from your device's time zone; change it if it is not right.")).toBeInTheDocument();
  });

  it("a device in no listed region gets the generic line, not Taiwan's numbers, and is asked to choose", async () => {
    const dialog = await emergency(zone("Atlantic/Reykjavik"));
    expect(dialog).toHaveTextContent("Please call your local emergency number now");
    expect(dialog).not.toHaveTextContent("119");
    await userEvent.click(within(dialog).getByRole("button", { name: "Show emergency numbers" }));
    expect(within(dialog).getByRole("combobox", { name: "Region" })).toHaveValue("OTHER");
    expect(within(dialog).getByText("Choose your region to see its emergency numbers.")).toBeInTheDocument();
    expect(within(dialog).queryAllByRole("link", { name: /Call/ })).toHaveLength(0);
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Region" }), "JP");
    expect(within(dialog).getByRole("link", { name: /Call 119/ })).toBeInTheDocument();
    expect(within(dialog).queryByText("Choose your region to see its emergency numbers.")).toBeNull();
  });

  it("a saved choice beats the time zone; a saved choice this build does not carry is not a choice", async () => {
    expect(await emergency(zone("Asia/Taipei"), { prefs: { region: "HK" } })).toHaveTextContent("Please call 999 now");
  });

  it("an old choice that the build no longer lists falls back to the time zone", async () => {
    expect(await emergency(zone("Asia/Taipei"), { prefs: { region: "ZZ" } })).toHaveTextContent("Please call 119 now");
  });

  it("an unverified row says so; a verified row says when it was verified", async () => {
    const dialog = await emergency(zone("Asia/Taipei"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Show emergency numbers" }));
    expect(within(dialog).getByText(/awaiting verification/i)).toBeInTheDocument();
    cleanup();
    const raw = rawChunksFromDisk("release");
    const verified = indexKnowledgeBase({ ...raw, core: { ...raw.core, emergency: { ...raw.core.emergency, regions: raw.core.emergency.regions.map((r) => (r.id === "TW" ? { ...r, verification: { at: "2026-09-01", by: "regional owner", scope: "both" as const, source: "an official page" } } : r)) } } });
    const again = await emergency(zone("Asia/Taipei"), { loaded: { kb: verified, engine } });
    await userEvent.click(within(again).getByRole("button", { name: "Show emergency numbers" }));
    expect(within(again).getByText("These numbers were last verified 2026-09-01.")).toBeInTheDocument();
  });

  it("a Mainland device gets the Mainland row — by its time zone, never by the language of the page", async () => {
    expect(await emergency(zone("Asia/Shanghai"))).toHaveTextContent("Please call 120 / 110 now");
  });
});

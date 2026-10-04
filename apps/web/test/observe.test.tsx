import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assessInputOf } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { toggleExclusive } from "../src/screens/observe/exclusive.ts";
import { answerCategory, applyPulse, categoryState, clearPulse, parseRate, setSign, signFeatures, SIGN_ZONES } from "../src/screens/observe/model.ts";
import type { Draft } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview, screenedDraft } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); vi.useRealTimers(); });
const base = (): Draft => screenedDraft(kb);
const state = (d: Draft, id: string) => d.findings[id];

describe("tongue model", () => {
  it("choosing a colour answers the whole category: the chosen one is present (guided), the others absent", () => {
    const d = answerCategory(base(), kb, "body", { kind: "chosen", ids: ["T_BODY_PALE"] });
    expect(state(d, "T_BODY_PALE")).toEqual({ state: "present", source: "guided" });
    for (const id of ["T_BODY_PALE_SWOLLEN", "T_BODY_RED", "T_BODY_CRIMSON", "T_BODY_PURPLE"]) expect(state(d, id)).toEqual({ state: "absent", source: "guided" });
    expect(categoryState(d, kb, "body")).toEqual({ answered: "chosen", chosen: ["T_BODY_PALE"] });
    expect(Object.keys(d.findings).some((id) => id.startsWith("T_COAT"))).toBe(false);          // other categories stay unanswered
  });

  it("'normal' makes every feature of the category absent, 'not sure' unsure, and clearing records nothing", () => {
    const n = answerCategory(base(), kb, "shape", { kind: "normal" });
    for (const id of ["T_SWOLLEN", "T_THIN", "T_TENDER"]) expect(state(n, id)).toEqual({ state: "absent", source: "guided" });
    expect(categoryState(n, kb, "shape").answered).toBe("normal");
    const u = answerCategory(base(), kb, "coat", { kind: "unsure" });
    expect(categoryState(u, kb, "coat").answered).toBe("unsure");
    expect(state(u, "T_COAT_DRY")).toEqual({ state: "unsure", source: "guided" });
    const c = answerCategory(n, kb, "shape", { kind: "clear" });
    expect(Object.keys(c.findings)).toEqual([]);
    expect(categoryState(c, kb, "shape").answered).toBeNull();
  });

  it("zone signs are present or not recorded — never 'absent' by omission", () => {
    let d = setSign(base(), "T_RED_DOTS_TIP", true);
    expect(state(d, "T_RED_DOTS_TIP")).toEqual({ state: "present", source: "guided" });
    d = setSign(d, "T_RED_DOTS_TIP", false);
    expect(state(d, "T_RED_DOTS_TIP")).toBeUndefined();
  });

  it("the zone lists come from the knowledge base", () => {
    expect(signFeatures(kb, "tip").map((f) => f.id).sort()).toEqual(["T_RED_DOTS_TIP", "T_TIP_COAT_PEELED", "T_TIP_RED"]);
    expect(signFeatures(kb, "all").map((f) => f.id)).toContain("T_SUBLINGUAL_VEINS");
    expect(SIGN_ZONES).toEqual(["tip", "center", "root", "edge", "border", "all"]);
  });

  it("the engine counts guided findings for less than reported ones (quality 0.7 vs 1)", () => {
    expect(engine.qualityOf(kb, "T_BODY_PALE", "guided")).toBe(0.7);
    expect(engine.qualityOf(kb, "S_FATIGUE", undefined)).toBe(1);
    expect(engine.qualityOf(kb, "P_WEAK", "pulse")).toBe(0.5);
    expect(engine.qualityOf(kb, "P_RAPID", "measured")).toBe(0.9);
  });
});

describe("pulse model", () => {
  const input = (over: Partial<Parameters<typeof applyPulse>[2]> = {}): Parameters<typeof applyPulse>[2] => ({ rate: null, rhythm: null, qualities: [], position: null, ...over });
  it("a measured rate gives rapid or slow (measured quality), or marks both absent", () => {
    expect(state(applyPulse(base(), kb, input({ rate: 104 })), "P_RAPID")).toEqual({ state: "present", source: "measured" });
    expect(state(applyPulse(base(), kb, input({ rate: 104 })), "P_SLOW")).toEqual({ state: "absent", source: "measured" });
    expect(state(applyPulse(base(), kb, input({ rate: 52 })), "P_SLOW")).toEqual({ state: "present", source: "measured" });
    const normal = applyPulse(base(), kb, input({ rate: 72 }));
    expect([state(normal, "P_RAPID")?.state, state(normal, "P_SLOW")?.state]).toEqual(["absent", "absent"]);
    expect(state(applyPulse(base(), kb, input({ rate: 90 })), "P_RAPID")?.state).toBe("absent");           // the band is "> 90"
    expect(Object.keys(applyPulse(base(), kb, input()).findings)).toEqual([]);
    expect(applyPulse(base(), kb, input({ rate: 72, rhythm: "regular" })).observe.pulse).toEqual({ rate: 72, rhythm: "regular" });
  });

  it("qualities are present with the lowest quality class and the optional position; saving again replaces the earlier pulse", () => {
    const d = applyPulse(base(), kb, input({ qualities: ["P_FLOAT", "P_WIRY"], position: "R-guan" }));
    expect(state(d, "P_FLOAT")).toEqual({ state: "present", source: "pulse", position: "R-guan" });
    const again = applyPulse(d, kb, input({ qualities: ["P_SINK"] }));
    expect(state(again, "P_FLOAT")).toBeUndefined();
    expect(state(again, "P_SINK")?.state).toBe("present");
    expect(Object.keys(clearPulse(again).findings)).toEqual([]);
    expect(clearPulse(applyPulse(base(), kb, input({ rate: 80 }))).observe.pulse).toBeUndefined();
  });

  it("a clearly irregular rhythm raises the B-level red flag, which needs an acknowledgement", () => {
    const d = applyPulse(base(), kb, input({ rhythm: "irregular" }));
    expect(d.screening.answers["RF_B_IRREGULAR_PULSE"]).toBe("yes");
    expect(d.redFlags).toContain("RF_B_IRREGULAR_PULSE");
    expect(applyPulse(base(), kb, input({ rhythm: "skips" })).redFlags).toEqual([]);
  });

  it("rate parsing", () => {
    expect(parseRate("72")).toBe(72); expect(parseRate(" 104 ")).toBe(104);
    for (const bad of ["", "abc", "19", "251", "7", "72.5", "1000"]) expect(parseRate(bad)).toBeNull();
  });

  it("exclusive choices replace each other and say which group", () => {
    const groups = [["P_FLOAT", "P_SINK"], ["P_LONG", "P_SHORT"]];
    expect(toggleExclusive(["P_FLOAT"], "P_SINK", true, groups)).toEqual({ next: ["P_SINK"], replaced: ["P_FLOAT", "P_SINK"] });
    expect(toggleExclusive(["P_FLOAT"], "P_LONG", true, groups)).toEqual({ next: ["P_FLOAT", "P_LONG"], replaced: null });
    expect(toggleExclusive(["P_FLOAT", "P_LONG"], "P_FLOAT", false, groups)).toEqual({ next: ["P_LONG"], replaced: null });
  });
});

async function open(path: string, draft: Draft = base(), lang: "en" | "zh-Hant" = "en") {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  t.store.getState().startDraft();
  t.store.getState().updateDraft((d) => ({ ...draft, id: d.id, startedAt: d.startedAt, position: { route: "/observe" } }));
  go(`/${lang}${path}`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  return { ...view, ...t };
}
const draftOf = (s: { getState: () => { draft: Draft | null } }): Draft => s.getState().draft!;

describe("Observation hub", () => {
  it("offers tongue and pulse as optional, and lets the person go on without either", async () => {
    const { store } = await open("/observe");
    expect(await screen.findByRole("heading", { level: 1, name: "Optional: observation, pulse and constitution" })).toBeInTheDocument();
    expect(screen.getByText(/count for less in the calculation; the constitution questionnaire/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Tongue" })).getByText("Not done yet")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Pulse" })).getByRole("link", { name: "Start" })).toHaveAttribute("href", "/en/observe/pulse");
    await userEvent.click(screen.getByRole("button", { name: "Skip, go to the review" }));
    expect(window.location.pathname).toBe("/en/review");
    expect(Object.keys(draftOf(store).findings).filter((k) => /^[TP]_/.test(k))).toEqual([]);
  });

  it("shows what has been recorded and changes the wording to Edit / Continue", async () => {
    const d = setSign(applyPulse(answerCategory(base(), kb, "body", { kind: "chosen", ids: ["T_BODY_RED"] }), kb, { rate: 80, rhythm: "regular", qualities: ["P_WIRY"], position: null }), "T_RED_DOTS_TIP", true);
    await open("/observe", d);
    expect(await within(await screen.findByRole("region", { name: "Tongue" })).findByRole("link", { name: "Edit" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Pulse" })).getByText(/item.* recorded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to the review" })).toBeInTheDocument();
  });
});

describe("Tongue observation (S08, E9)", () => {
  it("a five-step flow, each step skippable, with the quality stated up front", async () => {
    await open("/observe/tongue");
    expect(await screen.findByRole("heading", { level: 1, name: "Tongue" })).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 5")).toBeInTheDocument();
    expect(screen.getByText(/Self-observation is less reliable/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Skip this step" }));
    expect(screen.getByText("Step 2 of 5")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "I can't check right now" })).toHaveAttribute("href", "/en/observe");
  });

  it("body colour: each tile has a swatch and a text label; choosing records it as guided and the rest as absent; 'normal' and 'not sure' work", async () => {
    const { store } = await open("/observe/tongue");
    await userEvent.click(await screen.findByRole("button", { name: "Next step" }));
    const group = within(screen.getByRole("group", { name: "Body colour" }));
    expect(group.getAllByRole("radio")).toHaveLength(7);                                         // five colours + normal + not sure
    expect(group.getByRole("radio", { name: /purple, dusky tongue/ }).closest("label")!.querySelector("svg")).not.toBeNull();
    await userEvent.click(group.getByRole("radio", { name: /^red tongue/ }));
    expect(draftOf(store).findings["T_BODY_RED"]).toEqual({ state: "present", source: "guided" });
    expect(draftOf(store).findings["T_BODY_PALE"]).toEqual({ state: "absent", source: "guided" });
    await userEvent.click(group.getByRole("radio", { name: "Pale red (normal)" }));
    expect(draftOf(store).findings["T_BODY_RED"]).toEqual({ state: "absent", source: "guided" });
    await userEvent.click(group.getByRole("radio", { name: "Not sure" }));
    expect(draftOf(store).findings["T_BODY_RED"]).toEqual({ state: "unsure", source: "guided" });
  });

  it("shape and coating: exclusive choices replace each other with an explanation; a dry coat can be added", async () => {
    const { store } = await open("/observe/tongue");
    await userEvent.click(await screen.findByRole("button", { name: "Next step" }));
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    const shape = within(screen.getByRole("group", { name: "Shape" }));
    await userEvent.click(shape.getByRole("checkbox", { name: /^swollen tongue/ }));
    await userEvent.click(shape.getByRole("checkbox", { name: /^tender tongue/ }));
    await userEvent.click(shape.getByRole("checkbox", { name: /^thin tongue/ }));
    expect(shape.getByRole("checkbox", { name: /^swollen tongue/ })).not.toBeChecked();
    expect(screen.getByRole("status")).toHaveTextContent(/We changed your choice/);
    expect(draftOf(store).findings["T_TENDER"]?.state).toBe("present");
    expect(draftOf(store).findings["T_THIN"]?.state).toBe("present");
    await userEvent.click(screen.getByRole("button", { name: "Next step" }));
    const coat = within(screen.getByRole("group", { name: "Coating (overall)" }));
    await userEvent.click(coat.getByRole("checkbox", { name: /^yellow coat/ }));
    await userEvent.click(coat.getByRole("checkbox", { name: /^dry coat/ }));
    expect(draftOf(store).findings["T_COAT_YELLOW"]?.state).toBe("present");
    expect(draftOf(store).findings["T_COAT_DRY"]?.state).toBe("present");
  });

  async function toZones(): Promise<ReturnType<typeof open>> {
    const view = await open("/observe/tongue");
    for (let i = 0; i < 4; i++) await userEvent.click(await screen.findByRole("button", { name: "Next step" }));
    await screen.findByRole("heading", { level: 2, name: "Zones and special signs" });
    return view;
  }

  it("zones: every zone of the figure is a keyboard-operable button; opening one lists only what can appear there; the checklist twin stays in sync", async () => {
    const { store } = await toZones();
    const tip = screen.getByRole("button", { name: "Tip: choose what applies" });
    expect(tip).toHaveAttribute("aria-pressed", "false");
    tip.focus();
    await userEvent.keyboard("{Enter}");
    const sheet = screen.getByRole("dialog", { name: "Tip" });
    const items = within(sheet).getAllByRole("checkbox").map((c) => c.closest("label")!.textContent);
    expect(items).toHaveLength(3);
    expect(items.join(" ")).toMatch(/red tongue tip/);
    await userEvent.click(within(sheet).getByRole("checkbox", { name: /^red dots or prickles on the tongue tip/ }));
    expect(draftOf(store).findings["T_RED_DOTS_TIP"]).toEqual({ state: "present", source: "guided" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Done" }));
    expect(screen.getByRole("button", { name: "Tip: choose what applies" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Tip ✓/)).toBeInTheDocument();                                             // a ✓ in the figure: not colour only
    const twin = within(screen.getAllByRole("group", { name: "Tip" }).find((g) => g.tagName === "FIELDSET")!);
    expect(twin.getByRole("checkbox", { name: /^red dots or prickles on the tongue tip/ })).toBeChecked();
    // and the other way round: untick in the checklist, the figure follows
    await userEvent.click(twin.getByRole("checkbox", { name: /^red dots or prickles on the tongue tip/ }));
    expect(draftOf(store).findings["T_RED_DOTS_TIP"]).toBeUndefined();
    expect(screen.getByRole("button", { name: "Tip: choose what applies" })).toHaveAttribute("aria-pressed", "false");
  });

  it("the checklist also covers the zones the figure does not draw, and the sublingual guidance is there", async () => {
    await toZones();
    expect(screen.getByRole("group", { name: "Whole tongue" })).toBeInTheDocument();
    expect(screen.getByText(/curl the tip up to the roof of the mouth/)).toBeInTheDocument();
  });

  it("Done returns to the hub; the selections reach the engine as self-observed (guided) evidence", async () => {
    const d = answerCategory(interview(kb, "SP1"), kb, "body", { kind: "chosen", ids: ["T_BODY_PALE_SWOLLEN"] });
    const a = engine.assess(kb, assessInputOf(d, 1)!);
    const ev = a.trace.filter((x): x is Extract<typeof x, { kind: "evidence" }> => x.kind === "evidence" && x.symptomId === "T_BODY_PALE_SWOLLEN");
    if (ev.length > 0) expect(ev.every((x) => x.quality === 0.7)).toBe(true);
    const { store } = await open("/observe/tongue", d);
    for (let i = 0; i < 4; i++) await userEvent.click(await screen.findByRole("button", { name: "Next step" }));
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(window.location.pathname).toBe("/en/observe");
    expect(draftOf(store).findings["T_BODY_PALE_SWOLLEN"]?.source).toBe("guided");
  });

  it("is in Traditional Chinese and has no axe violations on the zone step (both languages)", async () => {
    for (const lang of ["en", "zh-Hant"] as const) {
      const { container, unmount } = await open("/observe/tongue", base(), lang);
      for (let i = 0; i < 4; i++) await userEvent.click(await screen.findByRole("button", { name: lang === "en" ? "Next step" : "下一步" }));
      await screen.findByRole("heading", { level: 2 });
      if (lang === "zh-Hant") expect(screen.getByRole("button", { name: "舌尖：選擇可能的情況" })).toBeInTheDocument();
      expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      unmount();
    }
  });
});

describe("Pulse (S10, E10)", () => {
  it("is optional and honest: fixed education note appears once any quality is chosen", async () => {
    await open("/observe/pulse");
    expect(await screen.findByRole("heading", { level: 1, name: "Pulse" })).toBeInTheDocument();
    expect(screen.getByText(/do not worry if you cannot feel it/)).toBeInTheDocument();
    expect(screen.queryByText(/takes trained fingers/)).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: /^wiry pulse/ }));
    expect(screen.getByText(/takes trained fingers and a lot of practice/)).toBeInTheDocument();
  });

  it("the rate is validated, and the 30-second helper turns a count into a rate", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await open("/observe/pulse");
    const rate = await screen.findByLabelText("Resting pulse (beats per minute)");
    await userEvent.type(rate, "7");
    await userEvent.tab();
    expect(screen.getByText("Enter a whole number from 20 to 250.")).toBeInTheDocument();
    await userEvent.clear(rate);
    await userEvent.click(screen.getByRole("button", { name: "Start the 30-second timer" }));
    expect(screen.getByRole("timer")).toHaveTextContent("30 seconds left");
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(await screen.findByText("Time is up. Enter the number of beats you counted.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Beats counted in 30 seconds"), "41");
    await userEvent.click(screen.getByRole("button", { name: "Use the ×2 result" }));
    expect(screen.getByLabelText("Resting pulse (beats per minute)")).toHaveValue("82");
  });

  it("saves the rate, the qualities and the position as findings and returns to the hub", async () => {
    const { store } = await open("/observe/pulse");
    await userEvent.type(await screen.findByLabelText("Resting pulse (beats per minute)"), "104");
    await userEvent.click(screen.getByRole("radio", { name: "Regular" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /^floating pulse/ }));
    await userEvent.click(screen.getByRole("radio", { name: "Right guan" }));
    await userEvent.click(screen.getByRole("button", { name: "Save the pulse" }));
    expect(window.location.pathname).toBe("/en/observe");
    const f = draftOf(store).findings;
    expect(f["P_RAPID"]).toEqual({ state: "present", source: "measured" });
    expect(f["P_FLOAT"]).toEqual({ state: "present", source: "pulse", position: "R-guan" });
    expect(draftOf(store).observe.pulse).toEqual({ rate: 104, rhythm: "regular" });
  });

  it("shows where the three positions are on each wrist, and the figure follows the chosen position", async () => {
    await open("/observe/pulse");
    expect(await screen.findByRole("img", { name: /^Both wrists, palms up\./ })).toBeInTheDocument();
    expect(screen.getByText(/middle finger on the bony bump/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Left chi" }));
    expect(screen.getByRole("img", { name: /Selected: Left chi\.$/ })).toBeInTheDocument();
  });

  it("exclusive qualities replace each other and the form says why (one group, one choice)", async () => {
    await open("/observe/pulse");
    await userEvent.click(await screen.findByRole("checkbox", { name: /^floating pulse/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /^deep pulse/ }));
    expect(screen.getByRole("checkbox", { name: /^floating pulse/ })).not.toBeChecked();
    expect(screen.getByRole("status", { name: "" })).toBeDefined();
    expect(screen.getAllByRole("status").some((s) => /We changed your choice: floating pulse/.test(s.textContent ?? ""))).toBe(true);
  });

  it("the rate-derived pulses are not offered by hand", async () => {
    await open("/observe/pulse");
    await screen.findByRole("heading", { level: 1, name: "Pulse" });
    for (const name of [/^rapid pulse/, /^slow pulse/, /^hasty pulse/]) expect(screen.queryByRole("checkbox", { name })).toBeNull();
  });

  it("a clearly irregular rhythm raises the blocking notice before moving on (E10)", async () => {
    const { store } = await open("/observe/pulse");
    await userEvent.click(await screen.findByRole("radio", { name: "Clearly irregular" }));
    await userEvent.click(screen.getByRole("button", { name: "Save the pulse" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Please see a doctor soon (within 24 hours)" });
    expect(window.location.pathname).toBe("/en/observe/pulse");
    await userEvent.click(within(dialog).getByRole("button", { name: "I understand — continue" }));
    await waitFor(() => expect(window.location.pathname).toBe("/en/observe"));
    expect(draftOf(store).acknowledgements).toContain("N-B");
    expect(draftOf(store).redFlags).toContain("RF_B_IRREGULAR_PULSE");
  });

  it("Clear removes the pulse again", async () => {
    const d = applyPulse(base(), kb, { rate: 70, rhythm: "regular", qualities: ["P_WIRY"], position: null });
    const { store } = await open("/observe/pulse", d);
    expect(await screen.findByLabelText("Resting pulse (beats per minute)")).toHaveValue("70");
    expect(screen.getByRole("checkbox", { name: /^wiry pulse/ })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Clear the pulse" }));
    expect(Object.keys(draftOf(store).findings).filter((k) => k.startsWith("P_"))).toEqual([]);
    expect(window.location.pathname).toBe("/en/observe");
  });

  it("has no axe violations (both languages)", async () => {
    for (const lang of ["en", "zh-Hant"] as const) {
      const { container, unmount } = await open("/observe/pulse", base(), lang);
      await screen.findByRole("heading", { level: 1 });
      expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      unmount();
    }
  });
});

void fireEvent;

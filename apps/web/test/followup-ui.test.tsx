// Follow-up on screen (docs/post-mvp/design/export-follow-up-trends.md §4, §7): the card at the end of a result (nothing pre-selected, a date written at once, a calendar file with no health content),
// and the nudge on the start page and in History (only after the date, dismissible, not after a newer result, not during an assessment, the previous profile and nothing else).
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { dueAtFor } from "../src/followup/model.ts";
import type { Draft, SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview, screenedDraft } from "./interview.ts";

const downloads: { name: string; text: string; type: string | undefined }[] = [];
vi.mock("../src/backup/files.ts", async (original) => ({ ...(await original<Record<string, unknown>>()), downloadText: (name: string, text: string, type?: string) => { downloads.push({ name, text, type }); } }));

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const DAY = 86_400_000;
const go = (path: string): void => { window.history.pushState({}, "", path); };
beforeEach(() => { downloads.length = 0; });
afterEach(() => { cleanup(); go("/"); });

function make(id: string, createdAt: number, followUp?: SavedAssessment["followUp"]): SavedAssessment {
  const start: Draft = screenedDraft(kb, { ageYears: 52, sex: "female", pregnancy: "no", lactating: false, medications: ["anticoagulant"], allergies: ["花生"] }, { profile: { medications: "some", medicationText: [], allergies: "some", conditions: "none" } });
  const d = interview(kb, "SP1", start);
  const s = toSaved(d, engine.assess(kb, assessInputOf(d, Date.UTC(2026, 9, 4, 12))!), { id, lang: "en" });
  return { ...s, createdAt, ...(followUp ? { followUp } : {}) };
}

async function open(path: string, items: SavedAssessment[], opts: { lang?: "en" | "zh-Hant"; draft?: Draft; acknowledged?: boolean } = {}) {
  const lang = opts.lang ?? "en";
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang, ...(opts.acknowledged === false ? {} : { disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 } }) }));
  const t = testStore(env);
  for (const s of items) await t.persistence.putAssessment(s);
  if (opts.draft !== undefined) await t.persistence.saveDraft(opts.draft);
  go(`/${lang}${path}`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  await screen.findByRole("heading", { level: 1 }, { timeout: 4000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  return { ...view, ...t, user: userEvent.setup() };
}

describe("the card at the end of a result", () => {
  const record = (): SavedAssessment => make("f0123456789abcdef", Date.now() - DAY);
  it("offers 2, 4 and 8 weeks and not now with nothing pre-selected, and writes nothing until a choice is made", async () => {
    const { persistence } = await open("/result/f0123456789abcdef", [record()]);
    const card = screen.getByRole("region", { name: "Look again later" });
    const radios = within(card).getAllByRole("radio");
    expect(radios.map((r) => r.closest("label")!.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("In 2 weeks"), expect.stringContaining("In 4 weeks"), expect.stringContaining("In 8 weeks"), expect.stringContaining("Not now")]));
    expect(radios).toHaveLength(4);
    for (const r of radios) expect(r).not.toBeChecked();
    expect((await persistence.getAssessment("f0123456789abcdef"))?.followUp).toBeUndefined();
  });

  it("a choice sets a date on the result at once, says when the card will appear, and can be changed", async () => {
    const { persistence, user } = await open("/result/f0123456789abcdef", [record()]);
    const card = screen.getByRole("region", { name: "Look again later" });
    await user.click(within(card).getByRole("radio", { name: "In 4 weeks" }));
    await waitFor(async () => expect((await persistence.getAssessment("f0123456789abcdef"))?.followUp).toEqual({ dueAt: dueAtFor(Date.now(), 4) }));
    expect(within(card).getByText(/A card will appear on the start page and in History from/)).toBeInTheDocument();
    expect(within(card).queryAllByRole("radio")).toHaveLength(0);
    await user.click(within(card).getByRole("button", { name: "Choose another time" }));
    await waitFor(async () => expect((await persistence.getAssessment("f0123456789abcdef"))?.followUp).toBeUndefined());
    expect(within(card).getAllByRole("radio")).toHaveLength(4);
    await user.click(within(card).getByRole("radio", { name: "Not now" }));
    expect(within(card).getByText("Nothing was set.")).toBeInTheDocument();
    expect((await persistence.getAssessment("f0123456789abcdef"))?.followUp).toBeUndefined();
  });

  it("the calendar file is one all-day entry with no health information, and the dialog says where it will live", async () => {
    const { user } = await open("/result/f0123456789abcdef", [{ ...record(), followUp: { dueAt: dueAtFor(Date.now(), 2) } }]);
    await user.click(within(screen.getByRole("region", { name: "Look again later" })).getByRole("button", { name: "Add to my calendar" }));
    const dialog = await screen.findByRole("dialog", { name: "Add to my calendar" });
    expect(dialog).toHaveTextContent("holds no health information");
    expect(dialog).toHaveTextContent("may be copied by the services that calendar uses");
    expect(dialog).toHaveTextContent("Nothing can be sent from this app");
    await user.click(within(dialog).getByRole("button", { name: "Download the calendar file" }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]).toMatchObject({ name: "tcm-follow-up.ics", type: "text/calendar" });
    const ics = downloads[0]!.text;
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("SUMMARY:TCM Self-Check — time to look again");
    expect(ics).toMatch(/DESCRIPTION:Open the app: http:\/\/localhost:?\d*\/en\//);
    expect(ics).not.toMatch(/pattern|symptom|result|diagnos|fatigue|SP1|spleen|脾/i);
    expect(within(dialog).getByText("Saved tcm-follow-up.ics.")).toBeInTheDocument();
  });

  it("is in Chinese, is hidden on paper, and has no axe violations", async () => {
    const { container } = await open("/result/f0123456789abcdef", [record()], { lang: "zh-Hant" });
    const card = screen.getByRole("region", { name: "稍後再看一次" });
    expect(within(card).getByRole("radio", { name: "2 週後" })).toBeInTheDocument();
    expect(card.querySelector("[data-noprint]")).not.toBeNull();
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });
});

describe("the nudge", () => {
  const NOW = Date.now();
  const dueRecord = (over: Partial<NonNullable<SavedAssessment["followUp"]>> = {}): SavedAssessment => make("d0123456789abcdef", NOW - 29 * DAY, { dueAt: NOW - DAY, ...over });

  it("appears on the start page once the date has passed, says how long it has been, and offers three things", async () => {
    await open("/", [dueRecord()]);
    const card = await screen.findByRole("region", { name: "Time to look again?" });
    expect(within(card).getByText(/It has been about 4 weeks since the last assessment/)).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Start a new assessment" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Start with my previous profile" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Not now" })).toBeInTheDocument();
  });

  it("also appears in History", async () => {
    await open("/history", [dueRecord()]);
    expect(await screen.findByRole("region", { name: "Time to look again?" })).toBeInTheDocument();
  });

  it("not before the date, not after a dismissal, not after a newer result, not during an assessment, not before the disclaimer is acknowledged", async () => {
    for (const [name, items, opts] of [
      ["before the date", [make("a0123456789abcdef", NOW - 5 * DAY, { dueAt: NOW + 9 * DAY })], {}],
      ["dismissed", [dueRecord({ dismissedAt: NOW - 1000 })], {}],
      ["a newer result", [dueRecord(), make("b0123456789abcdef", NOW - 2 * DAY)], {}],
      ["an assessment in progress", [dueRecord()], { draft: screenedDraft(kb) }],
      ["not acknowledged", [dueRecord()], { acknowledged: false }],
    ] as const) {
      const { unmount } = await open("/", [...items], opts);
      expect(screen.queryByRole("region", { name: "Time to look again?" }), name).toBeNull();
      unmount();
      cleanup();
    }
  });

  it("Not now dismisses it, keeps the date on the result and does not bring it back", async () => {
    const { persistence, user, unmount } = await open("/", [dueRecord()]);
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("region", { name: "Time to look again?" })).toBeNull();
    await waitFor(async () => expect((await persistence.getAssessment("d0123456789abcdef"))?.followUp?.dismissedAt).toBeGreaterThan(NOW - 1));
    expect((await persistence.getAssessment("d0123456789abcdef"))?.followUp?.dueAt).toBe(NOW - DAY);
    unmount();
    cleanup();
    await open("/history", [(await persistence.getAssessment("d0123456789abcdef"))!]);
    expect(screen.queryByRole("region", { name: "Time to look again?" })).toBeNull();
  });

  it("Start a new assessment begins an empty one", async () => {
    const { user, store } = await open("/", [dueRecord()]);
    await user.click(await screen.findByRole("button", { name: "Start a new assessment" }));
    expect(window.location.pathname).toBe("/en/start");
    const d = store.getState().draft!;
    expect(d.subject).toEqual({});
    expect(d.findings).toEqual({});
  });

  it("Start with my previous profile carries the answers about the person and none of the findings", async () => {
    const { user, store } = await open("/", [dueRecord()]);
    await user.click(await screen.findByRole("button", { name: "Start with my previous profile" }));
    expect(window.location.pathname).toBe("/en/start");
    const d = store.getState().draft!;
    expect(d.subject).toMatchObject({ ageYears: 52, sex: "female", allergies: ["花生"] });
    expect(d.profile.medications).toBe("some");
    expect(d.findings).toEqual({});
    expect(d.screening.answers).toEqual({});
    expect(d.constitutionAnswers).toEqual({});
    expect(d.position.route).toBe("/start");
    expect(await screen.findByRole("heading", { level: 1, name: /./ })).toBeInTheDocument();
  });

  it("is free of axe violations and says the same in Chinese", async () => {
    const { container } = await open("/", [dueRecord()], { lang: "zh-Hant" });
    const card = await screen.findByRole("region", { name: "是時候再看一次了嗎？" });
    expect(card).toHaveTextContent("距離上次評估已經大約 4 週");
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });
});

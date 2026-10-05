import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { compare } from "../src/screens/history/model.ts";
import type { Draft, SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

const save = (d: Draft, id: string, at: number): SavedAssessment => toSaved(d, engine.assess(kb, assessInputOf(d, at)!), { id, lang: "en" });
const sp1 = interview(kb, "SP1");
const ht = interview(kb, "HT2");
const A = save(sp1, "a000000000000000", Date.UTC(2026, 8, 1, 10));
const B = save(ht, "b000000000000000", Date.UTC(2026, 9, 3, 15));

async function open(items: SavedAssessment[], lang: "en" | "zh-Hant" = "en", env = fakeEnvironment()) {
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  for (const s of items) await t.persistence.putAssessment(s);
  go(`/${lang}/history`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  return { ...view, ...t, env };
}

describe("compare model", () => {
  it("orders by time and lists what changed in patterns, panel, symptoms and profile", () => {
    const c = compare(B, A);                                         // given in the wrong order on purpose
    expect(c.earlier.id).toBe(A.id);
    expect(c.later.id).toBe(B.id);
    expect(c.ranking[0]).toMatchObject({ rank: 1, earlier: "SP1", later: "HT2" });
    expect(c.panel.map((r) => r.element)).toEqual(["木", "火", "土", "金", "水"]);
    for (const r of c.panel) expect(r.change).toBeCloseTo(r.later - r.earlier, 12);
    expect(c.added.length + c.removed.length).toBeGreaterThan(0);
    expect(c.added.every((id) => !(id in A.input.findings) || A.input.findings[id]!.state !== "present")).toBe(true);
    expect(c.profileChanged).toBe(false);
  });

  it("a severity change and a profile change are reported", () => {
    const sym = Object.keys(A.input.findings).find((s) => A.input.findings[s]!.state === "present" && A.input.findings[s]!.severity)!;
    const changed = { ...A, id: "c1", createdAt: A.createdAt + 1, input: { ...A.input, subject: { ...A.input.subject, ageYears: 77 }, findings: { ...A.input.findings, [sym]: { state: "present" as const, severity: "severe" as const } } } };
    const c = compare(A, changed);
    expect(c.severity.some((s) => s.symptom === sym)).toBe(A.input.findings[sym]!.severity !== "severe");
    expect(c.profileChanged).toBe(true);
    expect(c.added).toEqual([]);
    expect(c.removed).toEqual([]);
  });
});

describe("History (S16)", () => {
  it("explains where results are stored when there are none", async () => {
    await open([]);
    expect(await screen.findByRole("heading", { level: 2, name: "No saved results yet" })).toBeInTheDocument();
    expect(screen.getByText(/saved automatically in this browser \(on this device only\)/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start an assessment" })).toHaveAttribute("href", "/en/");
  });

  it("lists the saved results newest first with date, leading pattern, confidence and the level in dev", async () => {
    await open([A, B]);
    const list = within(await screen.findByRole("list", { name: "Saved results" }));
    const cards = list.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByText(kb.patternById.get("HT2")!.name.en!)).toBeInTheDocument();
    expect(within(cards[1]!).getByText(kb.patternById.get("SP1")!.name.en!)).toBeInTheDocument();
    expect(within(cards[0]!).getByText(/^Confidence: (High|Medium|Low)/)).toBeInTheDocument();
    expect(within(cards[0]!).getByText(/^Output level L\d$/)).toBeInTheDocument();
    expect(within(cards[0]!).getByRole("link", { name: "Open" })).toHaveAttribute("href", `/en/result/${B.id}`);
  });

  it("two results can be selected (not three) and compared side by side, and the comparison goes back", async () => {
    await open([A, B]);
    const boxes = await screen.findAllByRole("checkbox", { name: /Select the result of/ });
    const compareButton = screen.getByRole("button", { name: "Compare the two results" });
    expect(compareButton).toBeDisabled();
    expect(compareButton).toHaveAccessibleDescription("Select two results to compare.");
    await userEvent.click(boxes[0]!);
    await userEvent.click(boxes[1]!);
    expect(compareButton).toBeEnabled();
    await userEvent.click(compareButton);
    expect(await screen.findByRole("heading", { level: 1, name: "Comparing results" })).toBeInTheDocument();
    const ranking = within(screen.getByRole("table", { name: "How the ranking of patterns changed" }));
    expect(ranking.getByText(kb.patternById.get("SP1")!.name.en!)).toBeInTheDocument();
    expect(ranking.getByText(kb.patternById.get("HT2")!.name.en!)).toBeInTheDocument();
    const panel = within(screen.getByRole("table", { name: "How the panel changed (Five Phases)" }));
    expect(panel.getAllByRole("row")).toHaveLength(6);
    expect(screen.getByRole("table", { name: "How the Eight Principles changed" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "What you changed in your inputs" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to history" }));
    expect(await screen.findByRole("list", { name: "Saved results" })).toBeInTheDocument();
  });

  it("only two can be selected at a time", async () => {
    const C = save(interview(kb, "LV1"), "c000000000000000", Date.UTC(2026, 9, 4, 9));
    await open([A, B, C]);
    const boxes = await screen.findAllByRole("checkbox", { name: /Select the result of/ });
    await userEvent.click(boxes[0]!);
    await userEvent.click(boxes[1]!);
    expect(boxes[2]).toBeDisabled();
  });

  it("a result computed with another knowledge-base version is labelled (E13)", async () => {
    await open([{ ...A, kbVersion: "an-older-version" }, B]);
    expect(await screen.findAllByText("Computed with an older version")).toHaveLength(1);
  });

  it("deleting one removes it from storage with a short undo that puts it back", async () => {
    const { persistence } = await open([A, B]);
    await userEvent.click(await screen.findByRole("button", { name: /^Delete the result of .*Sep/ }));
    await waitFor(async () => expect((await persistence.listAssessments()).map((s) => s.id)).toEqual([B.id]));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(screen.getAllByRole("status").some((s) => /Deleted\./.test(s.textContent ?? ""))).toBe(true);          // (the backup reminder is a status too)
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(async () => expect((await persistence.listAssessments()).map((s) => s.id).sort()).toEqual([A.id, B.id].sort()));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
  });

  it("delete all asks once and then empties the history", async () => {
    const { persistence } = await open([A, B]);
    await userEvent.click(await screen.findByRole("button", { name: "Delete all…" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Delete all saved results?" })).getByRole("button", { name: "Delete all" }));
    expect(await screen.findByRole("heading", { level: 2, name: "No saved results yet" })).toBeInTheDocument();
    expect(await persistence.listAssessments()).toEqual([]);
  });

  it("the header menu reaches it, and it is in Traditional Chinese on the zh-Hant route", async () => {
    await open([A], "zh-Hant");
    expect(await screen.findByRole("heading", { level: 1, name: "紀錄" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "紀錄" })).toHaveAttribute("href", "/zh-Hant/history");
    expect(screen.getByRole("button", { name: "比較兩份結果" })).toBeInTheDocument();
  });

  it.each(["en", "zh-Hant"] as const)("has no axe violations, list and comparison (%s)", async (lang) => {
    const { container } = await open([A, B], lang);
    const boxes = await screen.findAllByRole("checkbox");
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await userEvent.click(boxes[0]!);
    await userEvent.click(boxes[1]!);
    await userEvent.click(screen.getByRole("button", { name: lang === "en" ? "Compare the two results" : "比較兩份結果" }));
    await screen.findByRole("heading", { level: 1, name: lang === "en" ? "Comparing results" : "結果比較" });
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
});

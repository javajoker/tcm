import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { validateCase, type GoldenCase } from "@tcm/engine/golden";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { IS_DEV_PROFILE } from "../src/app/profile.ts";
import { applyAnswer } from "../src/screens/inquiry/model.ts";
import { askedItems, withAnswer } from "../src/screens/screening/model.ts";
import { newDraft } from "../src/storage/draft.ts";
import type { Draft } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

function draft(): Draft {
  let d: Draft = { ...newDraft("d", 1), subject: { ageYears: 38, sex: "female", pregnancy: "no", lactating: false, medications: [], allergies: [] },
    profile: { medications: "none", medicationText: [], allergies: "none", conditions: "none" }, inquiry: { modules: [], history: [], resolved: [] } };
  for (const f of [...askedItems(kb).A, ...askedItems(kb).B]) d = withAnswer(d, f.id, "no");
  d = applyAnswer(d, kb.questionById.get("Q_COLD")!, { kind: "answered", options: ["fear_cold", "cold_limbs"], severities: { S_FEAR_COLD: "severe" } });
  return d;
}

async function open(withDraft: boolean) {
  go("/en/_dev");
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang: "en" }));
  const t = testStore(env);
  if (withDraft) {
    t.store.getState().startDraft();
    t.store.getState().updateDraft((d) => ({ ...draft(), id: d.id, startedAt: d.startedAt }));
  }
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  return { ...view, ...t, env };
}

describe.runIf(IS_DEV_PROFILE)("developer inspector (S20)", () => {
  it("says so when there is no draft to inspect", async () => {
    await open(false);
    expect(await screen.findByRole("heading", { level: 1, name: "Developer inspector" })).toBeInTheDocument();
    expect(screen.getByText(/no complete draft/i)).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("has the seven tabs of the spec and each shows its data", async () => {
    await open(true);
    const list = await screen.findByRole("tablist", { name: "Inspector sections" });
    expect(within(list).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Policy", "Scores", "Panel", "Formulas", "Safety", "Params", "Case"]);
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/Effective level/);
    const tab = async (name: string): Promise<void> => { await userEvent.click(within(list).getByRole("tab", { name })); };
    await tab("Scores");
    expect(screen.getByRole("table", { name: /Patterns \(all, best first\)/ })).toBeInTheDocument();
    expect(screen.getByText(/Verdict:/)).toBeInTheDocument();
    await tab("Panel");
    expect(screen.getByRole("table", { name: "W and offsets" })).toBeInTheDocument();
    await tab("Formulas");
    expect(screen.getByRole("table", { name: /Fits of every formula/ })).toBeInTheDocument();
    await tab("Safety");
    const rules = screen.getByRole("table", { name: `All ${kb.safety.rules.length} safety rules` });
    expect(within(rules).getAllByRole("row")).toHaveLength(kb.safety.rules.length + 1);
  });

  it("moves between tabs with the arrow keys, Home and End", async () => {
    await open(true);
    const list = await screen.findByRole("tablist");
    const tabs = within(list).getAllByRole("tab");
    tabs[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(tabs[6]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowLeft}");
    expect(tabs[6]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{Home}");
    expect(tabs[0]).toHaveFocus();
  });

  it("recomputes on a parameter edit, reports invalid JSON, and never persists the edit", async () => {
    const { env } = await open(true);
    await userEvent.click(await screen.findByRole("tab", { name: "Scores" }));
    const bandOfFirst = (): string => within(screen.getByRole("table", { name: /Patterns \(all/ })).getAllByRole("row")[1]!.children[3]!.textContent!;
    const before = bandOfFirst();
    await userEvent.click(screen.getByRole("tab", { name: "Params" }));
    const box = screen.getByRole("textbox", { name: /scoring parameters/ }) as HTMLTextAreaElement;
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.queryByRole("alert")).toBeNull();
    // invalid JSON → an error, nothing applied
    await userEvent.clear(box);
    await userEvent.click(box);
    await userEvent.paste("{ not json");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Not valid JSON/);
    expect(screen.queryByText(/parameters edited/)).toBeNull();
    // every band at 0.001 % → the best pattern is in the "high" band
    const edited = { ...kb.params, pattern: { ...kb.params.pattern, bands: { high: 0.001, medium: 0.0005, weak: 0.0001 } } };
    await userEvent.clear(box);
    await userEvent.click(box);
    await userEvent.paste(JSON.stringify(edited));
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText(/parameters edited \(not saved\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Scores" }));
    expect(bandOfFirst()).toBe("high");
    expect(before).not.toBe("high");
    // reset restores the loaded values
    await userEvent.click(screen.getByRole("tab", { name: "Params" }));
    await userEvent.click(screen.getByRole("button", { name: /Reset/ }));
    await waitFor(() => expect(screen.queryByText(/parameters edited/)).toBeNull());
    // nothing of the edit reached storage
    expect([...Array(env.localStorage.length).keys()].map((i) => env.localStorage.getItem(env.localStorage.key(i)!)).join("\n")).not.toContain("0.001");
  });

  it("the Case tab exports a golden-case skeleton (test/golden format) that validates once it is given an id and a signature", async () => {
    await open(true);
    await userEvent.click(await screen.findByRole("tab", { name: "Case" }));
    const pre = screen.getByRole("tabpanel").querySelector("pre")!;
    const c = JSON.parse(pre.textContent!) as GoldenCase;
    expect(c.id).toBe("G-XXXX");
    expect(Object.keys(c.input.findings)).toContain("S_FEAR_COLD");
    expect(c.input.subject).not.toHaveProperty("birth");
    expect(c.expect.policy?.dev?.level).toBeTruthy();
    expect(validateCase(kb, { ...c, id: "G-0001", title: "x", authoredBy: "synthetic" })).toEqual([]);
  });

  it("has no accessibility violations on any tab", async () => {
    const { container } = await open(true);
    await screen.findByRole("tablist");
    for (const name of ["Policy", "Scores", "Panel", "Formulas", "Safety", "Params", "Case"]) {
      await userEvent.click(screen.getByRole("tab", { name }));
      expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${name} ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    }
  });
});

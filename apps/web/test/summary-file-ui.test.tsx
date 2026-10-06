// The summary file on screen (docs/post-mvp/design/export-follow-up-trends.md §3.3, §3.4): the preview lists the sections with a switch each, the typed medicine names and the saved note start off,
// the file holds exactly what was switched on, the share button exists only where the browser offers the share sheet, and nothing is uploaded.
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
import type { Draft, SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview, screenedDraft } from "./interview.ts";

const downloads: { name: string; text: string }[] = [];
vi.mock("../src/backup/files.ts", async (original) => ({ ...(await original<Record<string, unknown>>()), downloadText: (name: string, text: string) => { downloads.push({ name, text }); } }));

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
beforeEach(() => { downloads.length = 0; });
afterEach(() => { cleanup(); go("/"); Reflect.deleteProperty(navigator, "canShare"); Reflect.deleteProperty(navigator, "share"); });

function make(note?: string): SavedAssessment {
  const start: Draft = screenedDraft(kb, { ageYears: 52, sex: "female", pregnancy: "no", lactating: false, medications: ["anticoagulant"], allergies: ["花生"] }, { profile: { medications: "some", medicationText: ["Foo Pill"], allergies: "some", conditions: "none" } });
  const d = interview(kb, "SP1", start);
  return { ...toSaved(d, engine.assess(kb, assessInputOf(d, Date.UTC(2026, 9, 4, 12))!), { id: "s0123456789abcdef", lang: "en" }), ...(note !== undefined ? { userNote: note } : {}) };
}

async function open(saved: SavedAssessment = make(), lang: "en" | "zh-Hant" = "en") {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  await t.persistence.putAssessment(saved);
  go(`/${lang}/result/${saved.id}/summary`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: lang === "en" ? "Save as a file…" : "存成檔案…" }));
  return { ...view, user, dialog: await screen.findByRole("dialog") };
}

const SECTIONS = ["The person: age, sex, pregnancy and long-term conditions", "Medicine classes, allergies and the notices shown", "Symptoms reported", "Tongue, pulse and other observations", "Constitution", "The panel of the five phases and the two axes", "Patterns, confidence and what would change them", "What the result showed the person"];

describe("the preview", () => {
  it("lists the eight sections, all on; the typed names and the note are offered but off; and warns that the file holds health information", async () => {
    const { dialog } = await open(make("Tired since the move"));
    expect(within(dialog).getByRole("heading", { level: 2, name: "Save the summary as a file" })).toBeInTheDocument();
    const boxes = within(dialog).getAllByRole("checkbox");
    for (const name of SECTIONS) expect(within(dialog).getByRole("checkbox", { name: new RegExp(name.slice(0, 20)) })).toBeChecked();
    const typed = within(dialog).getByRole("checkbox", { name: /The medicine names typed in/ });
    const note = within(dialog).getByRole("checkbox", { name: /The note saved with this result/ });
    expect(typed).not.toBeChecked();
    expect(note).not.toBeChecked();
    expect(within(dialog).getByText(/Foo Pill/)).toBeInTheDocument();                 // the names are visible before they are switched on
    expect(within(dialog).getByText(/Tired since the move/)).toBeInTheDocument();
    expect(boxes).toHaveLength(10);
    expect(within(dialog).getByText(/The file holds health information/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Share…" })).toBeNull();     // this browser has no share sheet
  });

  it("does not offer the note when there is none, nor the typed names when the safety section is off", async () => {
    const { dialog, user } = await open(make());
    expect(within(dialog).queryByRole("checkbox", { name: /The note saved/ })).toBeNull();
    await user.click(within(dialog).getByRole("checkbox", { name: /Medicine classes, allergies/ }));
    expect(within(dialog).queryByRole("checkbox", { name: /The medicine names typed in/ })).toBeNull();
  });

  it("makes a file of exactly what is on: a section off is absent, the typed names and the note appear only when switched on", async () => {
    const { dialog, user } = await open(make("Tired since the move"));
    await user.click(within(dialog).getByRole("button", { name: "Save the file" }));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.name).toMatch(/^tcm-summary-\d{4}-\d{2}-\d{2}\.json$/);
    const first = JSON.parse(downloads[0]!.text) as Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(first.format).toBe("tcm-summary");
    expect(first.language).toBe("en");
    expect(first).toHaveProperty("patterns");
    expect(first.safety.medications).not.toHaveProperty("otherNamed");
    expect(downloads[0]!.text).not.toContain("Foo Pill");
    expect(downloads[0]!.text).not.toContain("Tired since the move");
    await waitFor(() => expect(within(dialog).getAllByRole("status").map((x) => x.textContent).join(" ")).toContain(`Saved ${downloads[0]!.name}`));     // the notice is a status too

    await user.click(within(dialog).getByRole("checkbox", { name: /Constitution/ }));
    await user.click(within(dialog).getByRole("checkbox", { name: /Tongue, pulse and other observations/ }));
    await user.click(within(dialog).getByRole("checkbox", { name: /The medicine names typed in/ }));
    await user.click(within(dialog).getByRole("checkbox", { name: /The note saved with this result/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save the file" }));
    const second = JSON.parse(downloads[1]!.text) as Record<string, any>;     // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(second).not.toHaveProperty("constitution");
    expect(second).not.toHaveProperty("observations");
    expect(second).toHaveProperty("findings");
    expect(second.safety.medications.otherNamed).toEqual(["Foo Pill"]);
    expect(second.note).toBe("Tired since the move");
  });

  it("with every section off the file cannot be made, and says why", async () => {
    const { dialog, user } = await open();
    for (const box of within(dialog).getAllByRole("checkbox").filter((b) => (b as HTMLInputElement).checked)) await user.click(box);
    expect(within(dialog).getByText("Choose at least one section.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save the file" })).toBeDisabled();
    expect(downloads).toHaveLength(0);
  });

  it("names the sections in Chinese, and writes the language of the page into the file", async () => {
    const { dialog, user } = await open(make(), "zh-Hant");
    expect(within(dialog).getByRole("heading", { level: 2, name: "把摘要存成檔案" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "儲存檔案" }));
    expect((JSON.parse(downloads[0]!.text) as { language: string }).language).toBe("zh-Hant");
  });

  it("offers the share sheet only where the browser has one, and hands it a file that is the same as the download would be", async () => {
    const shared: File[] = [];
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", { value: async (d: { files: File[] }) => { shared.push(...d.files); }, configurable: true });
    const { dialog, user } = await open();
    await user.click(within(dialog).getByRole("button", { name: "Share…" }));
    await waitFor(() => expect(shared).toHaveLength(1));
    expect(shared[0]!.name).toMatch(/^tcm-summary-/);
    expect(shared[0]!.type).toBe("application/json");
    expect((JSON.parse(await shared[0]!.text()) as { format: string }).format).toBe("tcm-summary");
    expect(downloads).toHaveLength(0);
  });

  it("is free of axe violations and closes with the close button", async () => {
    const { dialog, user, container } = await open(make("Tired"));
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

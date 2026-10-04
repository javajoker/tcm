import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { createI18n } from "@tcm/i18n";
import { catalogs, type MessageKey } from "../src/i18n/catalogs.ts";
import { exportFileName, inputsExport } from "../src/screens/result/exportInputs.ts";
import { usedCitations } from "../src/screens/result/PrintSupport.tsx";
import { buildSummary, summaryToText } from "../src/screens/result/summaryModel.ts";
import type { Draft, SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview, screenedDraft } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

const birth = { year: 1990, month: 5, day: 12, hour: 14, minute: 30, sex: "male", timeZone: "Asia/Shanghai", longitude: 121.47 } as const;
const tongue = [...kb.symptoms.values()].find((s) => s.kind === "tongue")!.id;
const pulse = [...kb.symptoms.values()].find((s) => s.kind === "pulse")!.id;
function make(over: Partial<Draft> = {}, id = "p0123456789abcdef"): SavedAssessment {
  const base = interview(kb, "SP1", screenedDraft(kb, { ageYears: 52, sex: "female", pregnancy: "no", lactating: false, medications: ["anticoagulant"], allergies: ["花生"] }, { profile: { medications: "some", medicationText: ["Foo"], allergies: "some", conditions: "none" } }));
  const d: Draft = { ...base, ...over, findings: { ...base.findings, [tongue]: { state: "present", source: "guided" }, [pulse]: { state: "present", source: "pulse" } } };
  return toSaved(d, engine.assess(kb, assessInputOf(d, Date.UTC(2026, 9, 4, 12))!), { id, lang: "en" });
}
const saved = make();

async function open(path: string, s: SavedAssessment = saved, lang: "en" | "zh-Hant" = "en") {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  await t.persistence.putAssessment(s);
  go(`/${lang}${path}`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  return { ...view, ...t, env };
}

describe("export my inputs", () => {
  it("contains the person's inputs and the version stamps, never the computed result", () => {
    const e = inputsExport(saved);
    expect(e.format).toBe("tcm-inputs");
    expect(Object.keys(e)).toEqual(["format", "version", "exportedFrom", "input"]);
    expect(JSON.stringify(e)).not.toContain("verdict");
    expect(e.input.findings).toEqual(saved.input.findings);
    expect(e.exportedFrom.kbVersion).toBe(saved.kbVersion);
    expect(exportFileName(saved)).toBe("tcm-inputs-2026-10-04.json");
  });

  it("holds the birth moment only when it was saved", () => {
    const d = { ...interview(kb, "SP1"), birth };
    const r = engine.assess(kb, assessInputOf(d, 1)!);
    expect(JSON.stringify(inputsExport(toSaved({ ...d, rememberBirth: false }, r, { id: "x", lang: "en" })))).not.toContain("1990");
    expect(inputsExport(toSaved({ ...d, rememberBirth: true }, r, { id: "x", lang: "en" })).input.birth).toEqual(birth);
  });
});

describe("result actions", () => {
  it("offers print, the practitioner summary, export, compare, a new assessment and delete", async () => {
    await open(`/result/${saved.id}`);
    const bar = within(await screen.findByRole("group", { name: "Actions for this result" }));
    expect(bar.getByRole("link", { name: "Practitioner summary" })).toHaveAttribute("href", `/en/result/${saved.id}/summary`);
    expect(bar.getByRole("link", { name: "Compare with earlier" })).toHaveAttribute("href", "/en/history");
    expect(bar.getByRole("link", { name: "Start a new assessment" })).toHaveAttribute("href", "/en/");
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    await userEvent.click(bar.getByRole("button", { name: "Print / save as PDF" }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("export warns that the file holds health data, then hands a JSON file to the browser — nothing is sent anywhere", async () => {
    let blob: Blob | null = null;
    const create = vi.fn((b: Blob) => { blob = b; return "blob:fake"; });
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    let downloaded = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloaded = this.download; });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await open(`/result/${saved.id}`);
    fetchSpy.mockClear();
    await userEvent.click(await screen.findByRole("button", { name: "Export my inputs" }));
    const dialog = screen.getByRole("dialog", { name: "Export my inputs" });
    expect(dialog).toHaveTextContent("contains your health information");
    expect(create).not.toHaveBeenCalled();                                                  // nothing happens before the person agrees
    await userEvent.click(within(dialog).getByRole("button", { name: "Download the file" }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(downloaded).toBe("tcm-inputs-2026-10-04.json");
    const parsed = JSON.parse(await (blob as unknown as Blob).text());
    expect(parsed.input.findings[tongue]).toEqual({ state: "present", source: "guided" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("delete asks, removes the result from the device and goes to the history", async () => {
    const { persistence } = await open(`/result/${saved.id}`);
    await userEvent.click(await screen.findByRole("button", { name: "Delete this result" }));
    await userEvent.click(within(screen.getByRole("dialog", { name: "Delete this result?" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(window.location.pathname).toBe("/en/history"));
    expect(await persistence.getAssessment(saved.id)).toBeNull();
  });
});

describe("print view (E16)", () => {
  it("opens every closed disclosure (the table twins must be on paper) and restores them afterwards", async () => {
    await open(`/result/${saved.id}`);
    await screen.findByRole("heading", { level: 1, name: "Your result" });
    const closed = [...document.querySelectorAll("details")].filter((d) => !d.open);
    expect(closed.length).toBeGreaterThan(0);
    fireEvent(window, new Event("beforeprint"));
    expect([...document.querySelectorAll("details")].every((d) => d.open)).toBe(true);
    fireEvent(window, new Event("afterprint"));
    for (const d of closed) expect(d.open).toBe(false);
  });

  it("footnotes every cited source (book, chapter and the text) and repeats the disclaimer in the page footer", async () => {
    await open(`/result/${saved.id}`);
    await screen.findByRole("heading", { level: 1, name: "Your result" });
    const notes = within(document.querySelector<HTMLElement>("section[hidden]")!);
    expect(notes.getByRole("heading", { level: 2, name: "Sources cited", hidden: true })).toBeInTheDocument();
    const ids = usedCitations(saved);
    expect(ids.length).toBeGreaterThan(0);
    expect(notes.getAllByRole("listitem", { hidden: true })).toHaveLength(ids.filter((id) => kb.citation(id)).length);
    for (const id of ids.slice(0, 5)) { const c = kb.citation(id)!; expect(notes.getByText(`《${c.book}》${c.chapter}：${c.quote_zh_hant}`)).toBeInTheDocument(); }
    expect(screen.getAllByText("Educational reference — not a medical diagnosis or prescription.").length).toBeGreaterThanOrEqual(2);       // footer and the print footer
    // every citation chip on the screen has a footnote
    const chipNames = screen.getAllByRole("button", { name: /Open source/ }).map((b) => b.textContent!);
    for (const name of new Set(chipNames)) expect(notes.getAllByText(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}：`), { exact: false }).length).toBeGreaterThan(0);
  });

  it("the print stylesheet is black on white, one column, hides the controls, keeps citation chips, and starts Advice and Data on new pages", () => {
    const css = readFileSync(resolvePath(process.cwd(), "src/styles/base.css"), "utf8");
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toMatch(/--bg: #fff/);
    expect(print).toMatch(/--ink: #000/);
    expect(print).toMatch(/header, footer nav, \[data-noprint\], nav, dialog, button:not\(\[lang\]\) \{ display: none !important/);
    expect(print).toMatch(/#sec-advice, #sec-data \{ break-before: page/);
    expect(print).toMatch(/main \{ max-width: none/);
    const mod = readFileSync(resolvePath(process.cwd(), "src/screens/result/Result.module.css"), "utf8");
    expect(mod).toMatch(/\.printFooter \{ display: block; position: fixed; bottom: 0/);
  });
});

describe("practitioner summary (UX spec §12)", () => {
  const t = createI18n<MessageKey>(catalogs, "en");

  it("the model lists the person, medicines and allergies prominently, symptoms with quality classes, the panel table and the hypotheses", () => {
    const sections = buildSummary(saved, kb, t);
    expect(sections.map((s) => s.id)).toEqual(expect.arrayContaining(["person", "meds", "symptoms", "observations", "panel", "hypotheses"]));
    const meds = sections.find((s) => s.id === "meds")!;
    expect(meds.prominent).toBe(true);
    expect(meds.facts!.find(([k]) => k === "Medicines")![1]).toMatch(/Anticoagulant \/ antiplatelet.*Other \(Foo\)/);
    expect(meds.facts!.find(([k]) => k === "Allergies")![1]).toBe("花生");
    const obs = sections.find((s) => s.id === "observations")!.items!;
    expect(obs.some((x) => x.includes("[self-observed]"))).toBe(true);
    expect(obs.some((x) => x.includes("[self-assessed pulse]"))).toBe(true);
    expect(sections.find((s) => s.id === "symptoms")!.items!.every((x) => !x.includes("["))).toBe(true);     // reported symptoms carry no quality tag
    expect(sections.find((s) => s.id === "panel")!.table!.rows).toHaveLength(7);
    expect(sections.find((s) => s.id === "hypotheses")!.items![0]).toContain(kb.patternById.get("SP1")!.name.en!);
  });

  it("the text version holds every section and fact of the model, in order", () => {
    const sections = buildSummary(saved, kb, t);
    const text = summaryToText("TITLE", "INTRO", sections, "FOOTER");
    expect(text.startsWith("TITLE\n\nINTRO\n\n")).toBe(true);
    expect(text.endsWith("\n\nFOOTER")).toBe(true);
    let at = 0;
    for (const s of sections) { const i = text.indexOf(s.title, at); expect(i, s.title).toBeGreaterThanOrEqual(at); at = i; }
    for (const [k, v] of sections.find((s) => s.id === "meds")!.facts!) expect(text).toContain(`${k}: ${v}`);
    expect(text).toContain("** Medicines and allergies (please note) **");
  });

  it("the page shows the sections, prints, copies as text, and links back", async () => {
    await open(`/result/${saved.id}/summary`);
    expect(await screen.findByRole("heading", { level: 1, name: "Practitioner summary" })).toBeInTheDocument();
    const meds = within(screen.getByRole("region", { name: "Medicines and allergies (please note)" }));
    expect(meds.getByText(/Anticoagulant/)).toHaveStyle({ fontWeight: "700" });
    expect(screen.getByRole("table", { name: "Five Phases (compared with a typical healthy person)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the result" })).toHaveAttribute("href", `/en/result/${saved.id}`);
    const write = vi.fn(async (_s: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    await userEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    expect(await screen.findByText("Copied.")).toBeInTheDocument();
    expect(write.mock.calls[0]![0]).toContain("Practitioner summary");
    expect(write.mock.calls[0]![0]).toContain("Allergies: 花生");
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    await userEvent.click(screen.getByRole("button", { name: "Print / save as PDF" }));
    expect(print).toHaveBeenCalled();
  });

  it("an unknown result id is the friendly page", async () => {
    await open("/result/nope/summary");
    expect(await screen.findByRole("heading", { level: 1, name: "We couldn't find this result" })).toBeInTheDocument();
  });

  it("is in Traditional Chinese on the zh-Hant route", async () => {
    await open(`/result/${saved.id}/summary`, saved, "zh-Hant");
    expect(await screen.findByRole("heading", { level: 1, name: "給醫師的摘要" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "用藥與過敏（請特別留意）" })).toBeInTheDocument();
  });

  it.each(["en", "zh-Hant"] as const)("has no axe violations (%s)", async (lang) => {
    const { container } = await open(`/result/${saved.id}/summary`, saved, lang);
    await screen.findByRole("heading", { level: 1 });
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

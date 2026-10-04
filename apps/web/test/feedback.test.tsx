import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { feedbackExport, feedbackFileName, formulaKey, patternKey, RESULT_KEY, withMark } from "../src/screens/result/feedbackModel.ts";
import type { SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); vi.restoreAllMocks(); });

const draft = interview(kb, "SP1");
const result = engine.assess(kb, assessInputOf(draft, Date.UTC(2026, 9, 4, 12))!);
const saved: SavedAssessment = toSaved(draft, result, { id: "r0123456789abcdef", lang: "en" });
const top = saved.result.verdict.patterns[0]!.id;
const firstFormula = (saved.result.recommendations.formulas[0] ?? saved.result.recommendations.studyOnly[0])!.id;

async function open(s: SavedAssessment, lang: "en" | "zh-Hant" = "en") {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  await t.persistence.putAssessment(s);
  go(`/${lang}/result/${s.id}`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  return { ...view, ...t, env };
}

describe("feedback model", () => {
  it("sets, replaces and clears a mark without touching the others", () => {
    const a = withMark({}, RESULT_KEY, "match");
    const b = withMark(a, patternKey("SP1"), "no");
    expect(b).toEqual({ result: "match", "pattern:SP1": "no" });
    expect(withMark(b, RESULT_KEY, "partial")).toEqual({ result: "partial", "pattern:SP1": "no" });
    expect(withMark(b, RESULT_KEY, null)).toEqual({ "pattern:SP1": "no" });
    expect(a).toEqual({ result: "match" });                                                // immutable
  });

  it("the export has the marks, version stamps and a result summary — and the answers only when asked", () => {
    const marks = { [formulaKey("F1")]: "partial", [RESULT_KEY]: "match" } as const;
    const plain = feedbackExport(saved, marks, false);
    expect(plain.format).toBe("tcm-feedback");
    expect(plain.marks).toEqual([{ key: "formula:F1", mark: "partial" }, { key: "result", mark: "match" }]);
    expect(plain.result.patterns[0]!.id).toBe(top);
    expect(plain.exportedFrom.kbVersion).toBe(saved.kbVersion);
    expect("input" in plain).toBe(false);
    expect(JSON.stringify(plain)).not.toContain("findings");
    expect(feedbackExport(saved, marks, true).input).toEqual(saved.input);
    expect(feedbackFileName({ ...saved, createdAt: Date.UTC(2026, 9, 4) })).toBe("tcm-feedback-2026-10-04.json");
  });

  it("ignores marks that are not one of the three values", () => {
    expect(feedbackExport(saved, { result: "maybe" } as never, false).marks).toEqual([]);
  });
});

describe("feedback marks on the result (FR-16)", () => {
  it("offers match / partly / no on the result, on each pattern's reasoning and on each formula card — and nowhere else", async () => {
    await open(saved);
    await screen.findByRole("heading", { level: 1, name: "Your result" });
    expect(screen.getByTestId(`feedback-${RESULT_KEY}`)).toBeInTheDocument();
    expect(screen.getByTestId(`feedback-${patternKey(top)}`)).toBeInTheDocument();
    expect(screen.getByTestId(`feedback-${formulaKey(firstFormula)}`)).toBeInTheDocument();
    const group = within(screen.getByTestId(`feedback-${RESULT_KEY}`)).getByRole("group", { name: /Did this match your experience\?/ });
    expect(within(group).getAllByRole("radio").map((r) => r.parentElement!.textContent)).toEqual(["Matches", "Partly", "Does not match"]);
    expect(screen.getByTestId(`feedback-${RESULT_KEY}`).hasAttribute("data-noprint")).toBe(true);
  });

  it("a mark is stored with the saved result at once, can be changed or cleared, and survives a reload", async () => {
    const { persistence } = await open(saved);
    const box = within(await screen.findByTestId(`feedback-${patternKey(top)}`));
    await userEvent.click(box.getByRole("radio", { name: "Partly" }));
    await waitFor(async () => expect((await persistence.getAssessment(saved.id))!.feedback).toEqual({ [patternKey(top)]: "partial" }));
    await userEvent.click(box.getByRole("radio", { name: "Matches" }));
    await waitFor(async () => expect((await persistence.getAssessment(saved.id))!.feedback).toEqual({ [patternKey(top)]: "match" }));
    await userEvent.click(within(screen.getByTestId(`feedback-${RESULT_KEY}`)).getByRole("radio", { name: "Does not match" }));
    await waitFor(async () => expect(Object.keys((await persistence.getAssessment(saved.id))!.feedback!).sort()).toEqual([patternKey(top), RESULT_KEY].sort()));
    await userEvent.click(box.getByRole("button", { name: /Clear my answer/ }));
    await waitFor(async () => expect((await persistence.getAssessment(saved.id))!.feedback).toEqual({ [RESULT_KEY]: "no" }));
    expect(box.getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText("1 item marked so far.")).toBeInTheDocument();
  });

  it("marks already stored are shown when the report opens", async () => {
    await open({ ...saved, feedback: { [RESULT_KEY]: "partial" } });
    const box = within(await screen.findByTestId(`feedback-${RESULT_KEY}`));
    expect(box.getByRole("radio", { name: "Partly" })).toBeChecked();
    expect(screen.getByText("1 item marked so far.")).toBeInTheDocument();
  });

  it("export is disabled until something is marked, warns, and only then hands a file to the browser; answers are off by default", async () => {
    let blob: Blob | null = null;
    const create = vi.fn((b: Blob) => { blob = b; return "blob:fake"; });
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    let downloaded = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { downloaded = this.download; });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await open(saved);
    const button = await screen.findByRole("button", { name: "Export feedback" });
    expect(button).toBeDisabled();
    await userEvent.click(within(screen.getByTestId(`feedback-${RESULT_KEY}`)).getByRole("radio", { name: "Matches" }));
    expect(button).toBeEnabled();
    fetchSpy.mockClear();
    await userEvent.click(button);
    const dialog = screen.getByRole("dialog", { name: "Export feedback" });
    expect(dialog).toHaveTextContent("only to your device and is not uploaded");
    expect(within(dialog).getByRole("checkbox", { name: /include my answers/ })).not.toBeChecked();
    expect(create).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Download the file" }));
    expect(create).toHaveBeenCalledTimes(1);
    expect(downloaded).toBe("tcm-feedback-2026-10-04.json");
    const parsed = JSON.parse(await (blob as unknown as Blob).text());
    expect(parsed.marks).toEqual([{ key: RESULT_KEY, mark: "match" }]);
    expect(parsed.input).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("includes the answers only after the box is ticked", async () => {
    let blob: Blob | null = null;
    Object.assign(URL, { createObjectURL: vi.fn((b: Blob) => { blob = b; return "blob:fake"; }), revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    await open({ ...saved, feedback: { [RESULT_KEY]: "no" } });
    await userEvent.click(await screen.findByRole("button", { name: "Export feedback" }));
    const dialog = screen.getByRole("dialog", { name: "Export feedback" });
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /include my answers/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Download the file" }));
    expect(JSON.parse(await (blob as unknown as Blob).text()).input.findings).toBeDefined();
  });

  it("is in Traditional Chinese too and has no accessibility violations in either language", async () => {
    for (const lang of ["en", "zh-Hant"] as const) {
      const { container, unmount } = await open({ ...saved, feedback: { [RESULT_KEY]: "match" } }, lang);
      await screen.findByTestId(`feedback-${RESULT_KEY}`);
      if (lang === "zh-Hant") expect(screen.getAllByRole("radio", { name: "部分相符" }).length).toBeGreaterThan(0);
      expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      unmount();
    }
  });

  it("an insufficient-information result still has the overall mark", async () => {
    const thin = engine.assess(kb, assessInputOf({ ...draft, findings: {} }, Date.UTC(2026, 9, 4, 12))!);
    await open(toSaved({ ...draft, findings: {} }, thin, { id: "r1123456789abcdef", lang: "en" }));
    expect(await screen.findByTestId(`feedback-${RESULT_KEY}`)).toBeInTheDocument();
  });
});

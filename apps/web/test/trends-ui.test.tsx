// Trends on screen (docs/post-mvp/design/export-follow-up-trends.md §5, §7): a tab of History once three results of one version exist; band marks that open their results; a table twin; changes in neutral
// words; a different version as a visible gap with nothing compared across it; profile changes noted; axe in two languages.
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import type { SavedAssessment } from "../src/storage/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 3, 6);                          // 3 September 2026
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { cleanup(); go("/"); });

const draft = interview(kb, "SP1");
const base: SavedAssessment = toSaved(draft, engine.assess(kb, assessInputOf(draft, T0)!), { id: "base", lang: "en" });
type Panel = Partial<Record<"木" | "火" | "土" | "金" | "水" | "coldHeat" | "deficiencyExcess", number>>;
function rec(id: string, at: number, panel: Panel = {}, over: Partial<SavedAssessment> = {}): SavedAssessment {
  const p = base.result.panel;
  const offsetPopulation = { ...p.offsetPopulation, 木: 0, 火: 0, 土: 0, 金: 0, 水: 0, ...Object.fromEntries(Object.entries(panel).filter(([k]) => k !== "coldHeat" && k !== "deficiencyExcess")) };
  const bagang = { ...p.bagang, coldHeat: panel.coldHeat ?? 0, deficiencyExcess: panel.deficiencyExcess ?? 0 };
  return { ...base, id, createdAt: at, ...over, result: { ...base.result, meta: { ...base.result.meta, computedAt: at }, panel: { ...p, offsetPopulation, bagang } } };
}

async function open(items: SavedAssessment[], lang: "en" | "zh-Hant" = "en") {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang, disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 } }));
  const t = testStore(env);
  for (const s of items) await t.persistence.putAssessment(s);
  go(`/${lang}/history`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  await screen.findByRole("heading", { level: 1 }, { timeout: 4000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  return { ...view, user: userEvent.setup() };
}
const history = (): SavedAssessment[] => [
  rec("a0123456789abcdef", T0, { 土: 1.0, 火: 0.2 }),
  rec("b0123456789abcdef", T0 + 14 * DAY, { 土: 1.4, 火: 0.3 }),
  rec("c0123456789abcdef", T0 + 28 * DAY, { 土: 0.2, 火: 0.3, coldHeat: -0.3 }),
];

describe("the tab", () => {
  it("appears with three results of one version, starts on the results, and opens the trends", async () => {
    const { user } = await open(history());
    const tabs = screen.getByRole("tablist", { name: "History views" });
    expect(within(tabs).getAllByRole("tab").map((x) => x.textContent)).toEqual(["Results", "Trends"]);
    expect(within(tabs).getByRole("tab", { name: "Results" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);                     // the list of results
    await user.click(within(tabs).getByRole("tab", { name: "Trends" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Trends" })).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
  it("is absent with two results, and with three results of two versions it says what is missing", async () => {
    await open(history().slice(0, 2));
    expect(screen.queryByRole("tablist")).toBeNull();
    cleanup();
    await open([...history().slice(0, 2), rec("d0123456789abcdef", T0 + 40 * DAY, {}, { paramsFingerprint: "another" })]);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText(/Trends appear once three results were made with the same version of the rules. The longest run so far is 2 results\./)).toBeInTheDocument();
  });
  it("moves between the tabs with the arrow keys", async () => {
    const { user } = await open(history());
    screen.getByRole("tab", { name: "Results" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Trends" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Results" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("the trends", () => {
  async function trends(items = history(), lang: "en" | "zh-Hant" = "en") {
    const view = await open(items, lang);
    await view.user.click(screen.getByRole("tab", { name: lang === "en" ? "Trends" : "趨勢" }));
    await screen.findByRole("heading", { level: 2, name: lang === "en" ? "Trends" : "趨勢" });
    return view;
  }

  it("draws one row for each of the five phases and the two axes, one mark for each result, each mark a link to its result, and says there are no lines", async () => {
    await trends();
    const figure = screen.getByRole("group", { name: "Bands of the five phases and the two axes at each assessment" });
    const marks = within(figure.closest("div")!).getAllByRole("link");
    expect(marks).toHaveLength(7 * 3);
    expect(marks[0]).toHaveAttribute("href", "/en/result/a0123456789abcdef");
    expect(marks[0]).toHaveAccessibleName(/^Wood, .*: normal\. Open this result\.$/);
    expect(figure.querySelectorAll("path, polyline")).toHaveLength(0);               // no line joins two marks
    expect(screen.getByText(/The marks are not joined by lines\./)).toBeInTheDocument();
    expect(screen.getByText(/Answers are self-reported and vary with sleep, mood, food and the season\. Small movements mean little\./)).toBeInTheDocument();
  });

  it("the table twin has the band in words with the number beside it, row headers for the seven rows and a link to each result", async () => {
    await trends();
    const table = screen.getByRole("table", { name: "The band of each row at each assessment, with the number printed beside it on the result" });
    expect(within(table).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Wood", "Fire", "Earth", "Metal", "Water", "Cold–heat", "Deficiency–excess"]);
    expect(within(table).getByRole("rowheader", { name: "Earth" }).closest("tr")).toHaveTextContent("somewhat high (+1.0)");
    expect(within(table).getByRole("rowheader", { name: "Cold–heat" }).closest("tr")).toHaveTextContent("somewhat cold (−0.3)");
    expect(within(table).getAllByRole("link")).toHaveLength(3);
    expect(within(table).getAllByRole("columnheader")[1]!.textContent).toMatch(/Sep 3 · Autumn/);
  });

  it("says what moved between bands in plain words — and says nothing about a movement inside a band", async () => {
    await trends();
    const changes = within(screen.getByRole("region", { name: "What moved between assessments" }));
    const items = changes.getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(items).toHaveLength(2);                                              // Earth, high → normal after 1.4 → 0.2; cold-heat normal → somewhat cold
    expect(items.some((x) => /^Between .* and .*, Earth moved from the somewhat high band to the normal band\.$/.test(x))).toBe(true);
    expect(items.some((x) => /Cold–heat moved from the balanced band to the somewhat cold band\./.test(x))).toBe(true);
    expect(items.join(" ")).not.toMatch(/Fire/);                                // 0.2 → 0.3 stays in the normal band
    expect(document.body.textContent).not.toMatch(/\b(better|worse|improv\w*|recover\w*|progress\w*|scores?)\b/i);
  });

  it("a different version is a visible gap, labelled, and nothing is compared across it", async () => {
    const items = [...history(), rec("d0123456789abcdef", T0 + 42 * DAY, { 土: 2.4 }, { paramsFingerprint: "another" }), rec("e0123456789abcdef", T0 + 56 * DAY, { 土: 0 }, { paramsFingerprint: "another" })];
    await trends(items);
    expect(screen.getAllByText("Measured with a different version of the rules. The marks before and after are not compared with each other.").length).toBeGreaterThan(0);
    const changes = within(screen.getByRole("region", { name: "What moved between assessments" })).getAllByRole("listitem").map((li) => li.textContent ?? "");
    for (const c of changes) expect(c).not.toMatch(new RegExp(`${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(T0 + 28 * DAY)}.*${new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(T0 + 42 * DAY)}`));   // never from the last result of one version to the first of the next
    expect(changes.some((c) => /Earth moved from the high band to the normal band/.test(c))).toBe(true);      // within the second segment
    expect(screen.getAllByRole("table", { name: /The band of each row/ })).toHaveLength(2);
  });

  it("notes a change in the answers about the person between two results", async () => {
    const items = history();
    const pregnant = { ...base.input, subject: { ...base.input.subject, pregnancy: "yes" as const } };
    items[1] = { ...items[1]!, input: pregnant };
    items[2] = { ...items[2]!, input: pregnant };
    await trends(items);
    expect(screen.getByText(/an answer about the person changed: pregnancy status\. Read the comparison with care\./)).toBeInTheDocument();
  });

  it("lists the symptoms that appeared or are no longer reported, and the patterns at each result with the same pattern in one row", async () => {
    const f = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, { state: "present" as const }]));
    const items = history();
    items[0] = { ...items[0]!, input: { ...base.input, findings: f("S_FATIGUE", "S_HEADACHE") } };
    items[1] = { ...items[1]!, input: { ...base.input, findings: f("S_FATIGUE", "S_INSOMNIA") } };
    items[2] = { ...items[2]!, input: { ...base.input, findings: f("S_FATIGUE", "S_INSOMNIA") } };
    await trends(items);
    const symptoms = within(screen.getByRole("region", { name: "Symptoms that appeared or are no longer reported" }));
    expect(symptoms.getAllByRole("listitem")).toHaveLength(1);
    expect(symptoms.getByText(/appeared: .*; no longer reported: /)).toBeInTheDocument();
    const patterns = screen.getByRole("table", { name: "The leading patterns at each assessment; each row is one pattern" });
    expect(within(patterns).getAllByRole("rowheader")).toHaveLength(base.result.verdict.status === "established" ? Math.min(3, base.result.verdict.patterns.length) : 0);
    expect(within(patterns).getAllByRole("columnheader")).toHaveLength(4);
  });

  it("is in Chinese, and has no axe violations in either language", async () => {
    const { container } = await trends(history(), "zh-Hant");
    expect(screen.getByText(/答案是自行回報的，會隨睡眠、心情、飲食與季節而變/)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /各列在每次評估所在的區間/ })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/變好|變差|好轉|惡化|改善|進步|康復|分數/);
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
    cleanup();
    const en = await trends();
    expect((await axe(en.container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it("a mark opens its result", async () => {
    const { user } = await trends();
    const figure = screen.getByRole("group", { name: "Bands of the five phases and the two axes at each assessment" });
    await user.click(within(figure.closest("div")!).getAllByRole("link")[0]!);
    await waitFor(() => expect(window.location.pathname).toBe("/en/result/a0123456789abcdef"));
  });
});

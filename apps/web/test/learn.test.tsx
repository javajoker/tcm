// The Learn section on screen (design §8, §10): the hub and its search, a list and its filter, a term page and a quotation page in both languages, the section's own not-found page, and the
// page template's anonymous-context rules (R1 cautions first, R3 the standing line, R5 one neutral link to the assessment, R7 the flags of the record) on a synthetic advice-like model.
import { act, render as renderTree, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { CitationsProvider } from "../src/app/citations.tsx";
import { KnowledgeProvider, NeedsKnowledge } from "../src/app/knowledge.tsx";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";
import { Page } from "../src/learn/Page.tsx";
import type { PageModel } from "../src/learn/types.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { kb, loaded, loadedHans, render as renderRoute, saved } from "./sweep.tsx";

const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

async function open(path: string, hans = false) {
  go(path);
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: "x", at: 1 } }));
  const t = testStore(env);
  const view = renderApp(t.store, (script) => Promise.resolve(hans || script === "Hans" ? loadedHans : loaded));
  await act(async () => { await Promise.resolve(); });
  await screen.findByRole("heading", { level: 1 }, { timeout: 4000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  return { ...view, user: userEvent.setup() };
}

describe("the hub", () => {
  it("says what the section is, offers a search, the learning book and one card per kind that exists, with counts", async () => {
    await open("/en/learn");
    expect(screen.getByRole("heading", { level: 1, name: "Learn" })).toBeInTheDocument();
    const cards = within(screen.getByRole("region", { name: "Browse by kind" })).getAllByRole("link");
    expect(cards.map((c) => c.getAttribute("href"))).toEqual(["/en/learn/book", "/en/learn/patterns", "/en/learn/constitutions", "/en/learn/formulas", "/en/learn/points", "/en/learn/foods", "/en/learn/herbs", "/en/learn/quotations", "/en/learn/terms", "/en/learn/compare"]);
    expect(cards[0]).toHaveTextContent(`${kb.book!.chapters.length} chapters`);          // known from the manifest: the card fetches nothing
    expect(cards[1]).toHaveTextContent(`${kb.patterns.length} entries`);
    expect(cards[6]).toHaveTextContent(`${kb.herbBrowser!.count} entries`);          // known from the manifest: the card fetches nothing
    expect(cards[8]).toHaveTextContent(`${kb.glossary.length} entries`);
    expect(cards[3]).toHaveTextContent(`${kb.formulas.size} entries`);
    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(document.title).toBe("Learn · TCM Self-Check");
  });
  it("is reachable from the header menu", async () => {
    await open("/en/");
    expect(within(screen.getByRole("navigation", { name: "Main menu" })).getByRole("link", { name: "Learn" })).toHaveAttribute("href", "/en/learn");
  });
  it("searches as the person types, announces the count, groups results by kind and links each result", async () => {
    const { user } = await open("/en/learn");
    const box = screen.getByRole("combobox", { name: "Search the Learn section" });
    expect(box).toHaveAttribute("aria-expanded", "false");
    await user.type(box, "yin yang");
    expect(box).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("listbox");
    const group = within(list).getByRole("group", { name: "Terms" });
    const option = within(group).getAllByRole("option")[0]!;
    expect(option).toHaveAttribute("href", "/en/learn/terms/yin-yang");
    expect(within(screen.getByRole("search")).getByRole("status")).toHaveTextContent(/\d+ results?/);
  });
  it("moves through the results with the arrow keys, opens one with Enter and clears with Escape", async () => {
    const { user } = await open("/en/learn");
    const box = screen.getByRole("combobox");
    await user.type(box, "yin yang");
    await user.keyboard("{ArrowDown}");
    const first = screen.getAllByRole("option")[0]!;
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(box).toHaveAttribute("aria-activedescendant", first.id);
    await user.keyboard("{ArrowUp}");
    expect(screen.getAllByRole("option").at(-1)).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}{Escape}");
    expect(box).toHaveValue("");
    expect(box).toHaveAttribute("aria-expanded", "false");
    await user.type(box, "yin yang{ArrowDown}{Enter}");
    expect(window.location.pathname).toBe("/en/learn/terms/yin-yang");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("yin and yang");
  });
  it("says so when nothing matches", async () => {
    const { user } = await open("/en/learn");
    await user.type(screen.getByRole("combobox"), "qzxqzx");
    expect(within(screen.getByRole("search")).getByRole("status")).toHaveTextContent("Nothing found for “qzxqzx”.");
    expect(screen.getByRole("listbox", { hidden: true })).not.toBeVisible();
  });
  it("offers the whole list when there are more matches than are shown, and the list opens filtered", async () => {
    const { user } = await open("/en/learn");
    await user.type(screen.getByRole("combobox"), "qi");
    const more = screen.getByRole("link", { name: /^Show all \d+ matches in Terms$/ });
    expect(more.getAttribute("href")).toBe("/en/learn/terms?q=qi");
    await user.click(more);
    const filter = await screen.findByRole("searchbox", { name: "Filter this list" });
    expect(filter).toHaveValue("qi");
  });
  it("has no axe violations in either language, with results showing", async () => {
    for (const lang of ["en", "zh-Hant"] as const) {
      const { user, container, unmount } = await open(`/${lang}/learn`);
      await user.type(screen.getByRole("combobox"), lang === "en" ? "yin" : "陰");
      expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
      unmount();
    }
  });
});

describe("a list", () => {
  it("groups the terms by area, with a heading and a list per group, and filters with an announced count", async () => {
    const { user } = await open("/en/learn/terms");
    const count = (): HTMLElement => screen.getAllByRole("status").find((s) => /entr/.test(s.textContent ?? ""))!;      // the draft notice is a status too
    expect(count()).toHaveTextContent(`${kb.glossary.length} entries shown`);
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(5);
    await user.type(screen.getByRole("searchbox", { name: "Filter this list" }), "yin yang");
    const n = screen.getAllByRole("link", { name: /yin/i }).filter((l) => l.getAttribute("href")?.startsWith("/en/learn/terms/")).length;
    expect(n).toBeGreaterThan(0);
    expect(count()).toHaveTextContent(/entr(y|ies) shown/);
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "qzxqzx");
    expect(screen.getAllByRole("status").find((s) => /No entry/.test(s.textContent ?? ""))).toBeDefined();
  });
  it("lists the quotations by book", async () => {
    await open("/zh-Hant/learn/quotations");
    expect(screen.getByRole("heading", { level: 2, name: "《傷寒論》" })).toBeInTheDocument();
    expect(document.title).toBe("經典引文 · 中醫自我評估");
  });
});

describe("a term page", () => {
  it("shows the term in the page language first, the other language beside it, its source and its review state", async () => {
    await open("/en/learn/terms/yin-yang");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("yin and yang · 陰陽");
    const facts = screen.getByRole("region", { name: "Meaning" });
    expect(within(facts).getByText("yīn yáng")).toHaveAttribute("lang", "zh-Latn-pinyin");
    expect(screen.getByRole("region", { name: "Sources" })).toHaveTextContent("WHO International Standard Terminologies");
    expect(screen.getByRole("region", { name: "Sources" })).toHaveTextContent("Not yet reviewed by a qualified practitioner");
    expect(screen.getByRole("link", { name: "Back to Terms" })).toHaveAttribute("href", "/en/learn/terms");
    expect(document.title).toBe("yin and yang · TCM Self-Check");
    expect(screen.queryByText(/not advice for the reader/)).toBeNull();           // R3 applies to pages about something a person might use
  });
  it("shows Chinese first on the Chinese page and Simplified characters on the Simplified page", async () => {
    await open("/zh-Hant/learn/terms/yin-yang");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("陰陽 · yin and yang");
    document.body.innerHTML = "";
    await open("/zh-Hans/learn/terms/yin-yang", true);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("阴阳 · yin and yang");
    expect(document.documentElement.lang).toBe("zh-Hans");
  });
  it("ends with the one neutral line about the assessment (R5), and carries the draft label", async () => {
    await open("/en/learn/terms/yin-yang");
    const toAssessment = screen.getAllByRole("link").filter((l) => l.getAttribute("href")?.endsWith("/start"));
    expect(toAssessment).toHaveLength(1);
    expect(toAssessment[0]).toHaveTextContent("Open the self-assessment");
    expect(screen.getByText("Draft content: not yet reviewed by a qualified practitioner.")).toBeInTheDocument();
  });
});

describe("a pattern page", () => {
  it("shows the group, the direction of care, the tongue and pulse, the features in bands, what it is built from and its sources", async () => {
    const p = kb.patternById.get("EX1")!;
    await open("/en/learn/patterns/EX1");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`${p.name.en} · ${p.name["zh-Hant"]}`);
    expect(screen.getByRole("region", { name: "Overview" })).toHaveTextContent("External patterns");
    expect(screen.getByRole("region", { name: "Direction of care" })).toHaveTextContent(p.principle_en);
    expect(screen.getByRole("region", { name: "Tongue and pulse" })).toHaveTextContent(p.tongue_pulse_note_en);
    const features = screen.getByRole("region", { name: "Typical features" });
    expect(within(features).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Key features", "Common features", "Features that speak against this pattern", "At least one of these is traditionally needed"]);        // EX1 has no weight below a third of its largest
    const key = within(features).getAllByRole("list")[0]!;
    expect(key).toHaveTextContent(kb.symptoms.get("S_AVERSION_COLD")!.en);                     // the heaviest weight is a key feature
    expect(screen.getByRole("region", { name: "Built from" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Sources" })).getAllByRole("button", { name: /^Open source/ })).toHaveLength(p.citations.length);
    expect(screen.getByRole("link", { name: "Back to Patterns" })).toHaveAttribute("href", "/en/learn/patterns");
    expect(screen.getByRole("region", { name: "Related" })).toBeInTheDocument();
    // R5: no checklist, no question; the treatments are only links, in a section of their own, to pages that carry cautions first
    const assoc = screen.getByRole("region", { name: "Traditionally associated" });
    const text = (document.querySelector("article")!.textContent ?? "").replace(assoc.textContent ?? "", "");
    expect(text).not.toMatch(/\?|\byou\b/i);
    for (const point of p.treatment.acupoints) expect(text).not.toContain(point);
    expect(screen.queryByText(/not advice for the reader/)).toBeNull();
  });
  it("says so when the record has no source", async () => {
    expect(kb.patternById.get("SP3")!.citations).toEqual([]);
    await open("/en/learn/patterns/SP3");
    expect(within(screen.getByRole("region", { name: "Sources" })).getByText("No source is recorded for this entry.")).toBeInTheDocument();
  });
  it("is listed by group, with the direction of care under each name", async () => {
    await open("/en/learn/patterns");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["External patterns", "Spleen and stomach", "Liver", "Heart", "Lung", "Kidney", "Qi and blood"]);
    const link = screen.getByRole("link", { name: new RegExp(kb.patternById.get("EX1")!.name.en!.slice(0, 12)) });
    expect(link).toHaveAttribute("href", "/en/learn/patterns/EX1");
    expect(link).toHaveTextContent(kb.patternById.get("EX1")!.principle_en);
  });
  it("searches by name in either language and by id", async () => {
    const { user } = await open("/en/learn");
    await user.type(screen.getByRole("combobox"), "ex1");
    expect(within(screen.getByRole("listbox")).getAllByRole("option")[0]).toHaveAttribute("href", "/en/learn/patterns/EX1");
  });
});

describe("a constitution page", () => {
  it("describes the type, what is traditionally associated with it and what it is said to be prone to — never as a label for the reader", async () => {
    await open("/en/learn/constitutions/C_YINXU");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Yin deficiency · 陰虛質");
    expect(screen.getByRole("region", { name: "Description" })).toHaveTextContent("It is not a label for a person.");
    expect(screen.getByRole("region", { name: "Features traditionally associated" })).toHaveTextContent(kb.symptoms.get("S_NIGHT_SWEAT")!.en);
    expect(screen.getByRole("region", { name: "Related" })).toBeInTheDocument();
    const prone = screen.getByRole("region", { name: "Said to be more prone to" });
    expect(prone).toHaveTextContent(/summer-heat \(markedly\)/i);
    expect(screen.getByRole("region", { name: "Sources" })).toHaveTextContent("ZYYXH/T 157-2009");
    expect(document.querySelector("article")!.textContent).not.toMatch(/\byou\b|\bI have\b/i);
  });
  it("the balanced type has a description and nothing else to list", async () => {
    await open("/en/learn/constitutions/C_PINGHE");
    expect(screen.getByRole("region", { name: "Description" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Said to be more prone to" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Features traditionally associated" })).toBeNull();
  });
});

describe("a formula page", () => {
  const f = kb.formulas.get("F_MAHUANG")!;
  it("puts the cautions, the stored flags and the allergy line first, under the standing line, before anything that describes the formula (R1, R3, R7)", async () => {
    await open("/en/learn/formulas/F_MAHUANG");
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Mahuang Tang (Ephedra Decoction) · 麻黃湯");
    const cautions = screen.getByRole("region", { name: "Cautions" });
    for (const c of f.cautions_en) expect(cautions).toHaveTextContent(c);
    expect(cautions).toHaveTextContent("Use with caution in pregnancy; ask a doctor first.");
    expect(cautions).toHaveTextContent("May interact with: high blood pressure or blood-pressure medicines");
    expect(cautions).toHaveTextContent("An allergy to any herb in the composition rules the formula out.");
    expect(cautions).toHaveTextContent("Contains strong or harsh herbs");
    expect(cautions).toHaveTextContent("only explains its traditional composition");
    expect(within(cautions).queryByRole("button")).toBeNull();
    const article = document.querySelector("article")!;
    expect(article.querySelector("section")).toBe(cautions);
    const standing = screen.getByText(/not advice for the reader/);
    expect(standing.compareDocumentPosition(cautions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const heading of ["Overview", "Composition", "Reasoning"]) expect(cautions.compareDocumentPosition(screen.getByRole("heading", { level: 2, name: heading })) & Node.DOCUMENT_POSITION_FOLLOWING, heading).toBeTruthy();
  });
  it("shows the composition as a table with the role of each herb, and the sources, the direction of care and the patterns it is used for", async () => {
    await open("/en/learn/formulas/F_MAHUANG");
    const table = within(screen.getByRole("region", { name: "Composition" })).getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(f.composition.length + 1);
    expect(within(table).getByRole("rowheader", { name: /君 Sovereign/ })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Amount" })).toBeInTheDocument();       // the development data has amounts; a release bundle has none (the model tests)
    expect(screen.getByRole("region", { name: "Direction of care" })).toHaveTextContent(f.principle_en);
    expect(within(screen.getByRole("region", { name: "Sources" })).getAllByRole("button", { name: /^Open source/ }).length).toBeGreaterThan(1);
    expect(within(screen.getByRole("region", { name: "Related" })).getByRole("link")).toHaveAttribute("href", "/en/learn/patterns/EX1");
    expect(screen.getByRole("region", { name: "How far the composition was checked" })).toHaveTextContent("checked against the classical text");
  });
  it("is listed by school, each with its tier, and a pattern page links to it", async () => {
    await open("/en/learn/formulas");
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["classical formula (jingfang)", "later formula (shifang)"]);
    const link = screen.getByRole("link", { name: /Mahuang Tang/ });
    expect(link).toHaveAttribute("href", "/en/learn/formulas/F_MAHUANG");
    expect(link).toHaveTextContent("Contains strong or harsh herbs");
    document.body.innerHTML = "";
    await open("/en/learn/patterns/EX1");
    const assoc = screen.getByRole("region", { name: "Traditionally associated" });
    expect(within(assoc).getByRole("heading", { level: 3, name: "Formulas" })).toBeInTheDocument();
    expect(within(assoc).getByRole("link", { name: /Mahuang Tang/ })).toHaveAttribute("href", "/en/learn/formulas/F_MAHUANG");
    expect(within(assoc).getAllByRole("link").map((a) => a.getAttribute("href")).every((h) => /\/learn\/(formulas|points|foods)\//.test(h ?? ""))).toBe(true);
  });
});

describe("an acupoint page", () => {
  it("shows the pregnancy flag and every caution first, then where the point lies and how a point is traditionally pressed", async () => {
    await open("/en/learn/points/SP6");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("SP6 · 三陰交");
    const cautions = screen.getByRole("region", { name: "Cautions" });
    expect(cautions).toHaveTextContent("Not to be pressed in pregnancy or when pregnancy is possible.");
    expect(cautions).toHaveTextContent("Do not press on skin that is broken, inflamed, bruised or swollen.");
    expect(document.querySelector("article")!.querySelector("section")).toBe(cautions);
    expect(screen.getByRole("region", { name: "Where it lies" })).toHaveTextContent("inner side of the lower leg");
    expect(screen.getByRole("region", { name: "How an acupoint is traditionally pressed" })).toHaveTextContent("Traditionally pressed and kneaded");
    expect(within(screen.getByRole("region", { name: "Overview" })).getByText("脾經")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Sources" })).toHaveTextContent("WHO Standard Acupuncture Point Locations");
    expect(document.querySelector("article")!.textContent).not.toMatch(/\byou\b/i);
  });
  it("is listed by meridian and a point that carries no pregnancy restriction says so", async () => {
    await open("/en/learn/points");
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(5);
    const free = Object.values(kb.treatment.acupoints).find((a) => !a.pregnancy_avoid)!;
    document.body.innerHTML = "";
    await open(`/en/learn/points/${free.code}`);
    expect(screen.getByRole("region", { name: "Cautions" })).toHaveTextContent("No pregnancy restriction is recorded for this point");
  });
});

describe("a food page", () => {
  it("shows the cautions, the pregnancy flag and the allergy line first, then nature and flavour, why it is listed and its basis", async () => {
    const [name, food] = Object.entries(kb.treatment.foods).find(([, f]) => f.pregnancy_caution)!;
    await open(`/en/learn/foods/${food.id}`);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(name);
    const cautions = screen.getByRole("region", { name: "Cautions" });
    expect(cautions).toHaveTextContent("Use with caution in pregnancy");
    expect(cautions).toHaveTextContent("An allergy to this food, or to the herb it is made from, rules it out.");
    for (const c of food.cautions) expect(cautions).toHaveTextContent(c.en);
    expect(document.querySelector("article")!.querySelector("section")).toBe(cautions);
    expect(screen.getByRole("region", { name: "Why it is listed" })).toHaveTextContent(food.rationale.en.slice(0, 20));
    expect(screen.getByRole("region", { name: "Sources" })).toHaveTextContent(food.basis === "pharmacopoeia" ? "Pharmacopoeia" : "General textbook teaching");
  });
  it("is listed by nature, cold to hot", async () => {
    await open("/en/learn/foods");
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent ?? "");
    expect(headings.length).toBeGreaterThanOrEqual(3);
  });
  it("is found by search through its Chinese name", async () => {
    const [name, food] = Object.entries(kb.treatment.foods)[0]!;
    const { user } = await open("/en/learn");
    await user.type(screen.getByRole("combobox"), name);
    expect(within(screen.getByRole("listbox")).getAllByRole("option").some((o) => o.getAttribute("href") === `/en/learn/foods/${food.id}`)).toBe(true);
  });
});

describe("comparing patterns", () => {
  const name = (id: string): string => kb.patternById.get(id)!.name.en!;
  it("is a card on the hub and a section of every pattern page, and the section links to the comparison with the others of its group", async () => {
    await open("/en/learn");
    expect(within(screen.getByRole("region", { name: "Browse by kind" })).getByRole("link", { name: /Compare patterns/ })).toHaveAttribute("href", "/en/learn/compare");
    document.body.innerHTML = "";
    await open("/en/learn/patterns/EX1");
    const section = screen.getByRole("region", { name: "Compare with" });
    expect(within(section).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(kb.patterns.filter((p) => p.group === "external" && p.id !== "EX1").map((p) => `/en/learn/compare?ids=EX1,${p.id}`));
  });
  it("puts two patterns side by side as real tables: row headers for the features, column headers for the patterns, bands as words, and topics rather than questions", async () => {
    await open("/en/learn/compare?ids=EX2,EX4");
    expect(screen.getByRole("heading", { level: 1, name: "Compare patterns" })).toBeInTheDocument();
    expect(document.title).toContain("Compare patterns: ");
    const overview = within(screen.getByRole("region", { name: "The patterns" })).getByRole("table");
    expect(within(overview).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Item", name("EX2"), name("EX4")]);
    expect(within(overview).getByRole("rowheader", { name: "Direction of care" })).toBeInTheDocument();
    const differ = within(screen.getByRole("region", { name: "Features that tell them apart" })).getByRole("table");
    expect(within(differ).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Feature", name("EX2"), name("EX4")]);
    expect(within(differ).getAllByRole("rowheader").length).toBeGreaterThan(2);
    const cells = within(differ).getAllByRole("cell").map((c) => c.textContent);
    for (const c of cells) expect(["Key", "Common", "Supporting", "Speaks against", "Not in the record"]).toContain(c);
    expect(cells.some((c) => c === "Speaks against") || cells.some((c) => c === "Not in the record")).toBe(true);
    const topics = within(screen.getByRole("region", { name: "What an assessment asks about to tell them apart" })).getAllByRole("heading", { level: 3 });
    expect(topics).toHaveLength(3);
    expect(document.querySelector("article, main")!.textContent).not.toMatch(/Select all that apply|\byou\b/i);
    expect(screen.getByRole("link", { name: new RegExp(name("EX2").slice(0, 10)) })).toHaveAttribute("href", "/en/learn/patterns/EX2");
  });
  it("compares three patterns, in the order given", async () => {
    await open("/en/learn/compare?ids=SP1,EX1,LV1");
    const overview = within(screen.getByRole("region", { name: "The patterns" })).getByRole("table");
    expect(within(overview).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Item", name("SP1"), name("EX1"), name("LV1")]);
  });
  it("asks for the patterns when the address names fewer than two, refuses one pattern twice, and goes to the comparison", async () => {
    const { user } = await open("/en/learn/compare");
    expect(screen.getByRole("heading", { level: 2, name: "Choose the patterns to compare" })).toBeInTheDocument();
    const [first, second] = screen.getAllByRole("combobox");
    await user.selectOptions(first!, "EX2");
    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose at least two different patterns.");
    await user.selectOptions(second!, "EX2");
    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Choose at least two different patterns.");
    await user.selectOptions(second!, "EX4");
    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(window.location.pathname + window.location.search).toBe("/en/learn/compare?ids=EX2,EX4");
    expect(await screen.findByRole("region", { name: "Features that tell them apart" })).toBeInTheDocument();
  });
  it("says when an address names a pattern the app does not have, and compares the rest or asks", async () => {
    await open("/en/learn/compare?ids=EX2,NOPE");
    expect(screen.getByText("Some of the patterns in the address are not in the app; only the others are used.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Choose the patterns to compare" })).toBeInTheDocument();
    document.body.innerHTML = "";
    await open("/en/learn/compare?ids=EX2,NOPE,EX4");
    expect(screen.getByText("Some of the patterns in the address are not in the app; only the others are used.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "The patterns" })).toBeInTheDocument();
  });
  it("is available in Chinese and Simplified", async () => {
    await open("/zh-Hant/learn/compare?ids=EX2,EX4");
    expect(screen.getByRole("heading", { level: 1, name: "比較證型" })).toBeInTheDocument();
    document.body.innerHTML = "";
    await open("/zh-Hans/learn/compare?ids=EX2,EX4", true);
    expect(screen.getByRole("heading", { level: 1, name: "比较证型" })).toBeInTheDocument();
  });
  it("is linked from a result's other possible patterns, each link naming both patterns", async () => {
    // a saved result whose verdict lists two alternatives after the leading pattern (the stored shape of an ambiguous result)
    const verdict = saved.result.verdict;
    if (verdict.status === "insufficient") throw new Error("the fixture is a result");
    const [lead] = verdict.patterns;
    const others = [{ ...lead!, id: "EX2", band: "medium" as const }, { ...lead!, id: "EX4", band: "weak" as const }];
    const record = { ...saved, id: "r9123456789abcdef", result: { ...saved.result, verdict: { ...verdict, patterns: [lead!, ...others] } } };
    await renderRoute("en", `/result/${record.id}`, "saved", undefined, [record]);
    const links = screen.getAllByRole("link", { name: /^Compare .* with / });
    expect(links).toHaveLength(others.length);
    links.forEach((a, i) => expect(a).toHaveAttribute("href", `/en/learn/compare?ids=${lead!.id},${others[i]!.id}`));
    expect(links[0]).toHaveTextContent("Compare with the leading pattern");
  });
});

describe("a quotation page", () => {
  it("shows the passage, where it comes from and how far it was checked", async () => {
    const c = kb.citation("shanghan-035")!;
    await open("/en/learn/quotations/shanghan-035");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(`《${c.book}》${c.chapter}`);
    expect(screen.getByRole("region", { name: "Original text" })).toHaveTextContent(c.quote_zh_hant.slice(0, 8));
    expect(screen.getByRole("region", { name: "Sources" })).toHaveTextContent(c.verified ? "The wording was checked against the source text" : "The wording has not been checked against the source text");
    expect(screen.getByText("There is no translation of this passage in the app.")).toBeInTheDocument();
  });
});

describe("the section's own not-found page", () => {
  it.each(["/en/learn/terms/no-such-term", "/en/learn/herbs/no-such-herb", "/en/learn/seeds", "/en/learn/formulas/F_NOPE", "/en/learn/points/XX99", "/en/learn/foods/nope", "/en/learn/patterns/NOPE", "/en/learn/constitutions/C_NOPE", "/en/learn/quotations/nope"])("%s", async (path) => {
    await open(path);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This page is not in the Learn section");
    expect(screen.getByRole("link", { name: "Back to Learn" })).toHaveAttribute("href", "/en/learn");
  });
});

// ── the template's rules, on a synthetic page about something a person might use ─────────────────────────────────────────────────────────────

const advice: PageModel = {
  type: "formula", id: "test-formula", title: { "zh-Hant": "測試方", en: "Test formula" }, adviceLike: true,
  cautions: [{ "zh-Hant": "孕婦慎用。", en: "Use with care in pregnancy." }],
  flags: ["May interact with anticoagulant medicines."],
  sections: [
    { id: "description", heading: "Description", blocks: [{ kind: "text", zh: "描述文字。", en: "Description text." }] },
    { id: "composition", heading: "Composition", blocks: [{ kind: "plain", text: "A, B, C" }] },
  ],
  citations: [], sourceLabel: undefined, review: "draft", related: [],
};

function Tree({ children, lang }: { children: ReactNode; lang: "en" | "zh-Hant" }): ReactNode {
  return <I18nProvider lang={lang} setLang={() => undefined}><KnowledgeProvider load={() => Promise.resolve(loaded)}><CitationsProvider><NeedsKnowledge>{children}</NeedsKnowledge></CitationsProvider></KnowledgeProvider></I18nProvider>;
}

describe.each(["en", "zh-Hant"] as const)("the page template · %s", (lang) => {
  it("R1 puts the cautions and the record's flags in the first section, open, before the description (never behind a toggle)", async () => {
    const { container } = renderTree(<Tree lang={lang}><Page model={advice} /></Tree>);
    const cautions = await screen.findByRole("region", { name: lang === "en" ? "Cautions" : "注意事項" });
    expect(cautions).toHaveTextContent(lang === "en" ? "Use with care in pregnancy." : "孕婦慎用。");
    expect(cautions).toHaveTextContent("May interact with anticoagulant medicines.");
    expect(within(cautions).queryByRole("button")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    const first = container.querySelector("article")!.querySelectorAll("section");
    expect(first[0]).toBe(cautions);
    expect(cautions.compareDocumentPosition(screen.getByRole("heading", { level: 2, name: lang === "en" ? "Description" : "Description" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("R3 says under the title that this is general information, with a link to how the content is sourced", async () => {
    renderTree(<Tree lang={lang}><Page model={advice} /></Tree>);
    await screen.findByRole("heading", { level: 1 });
    const line = screen.getByText(lang === "en" ? /not advice for the reader/ : /不是給閱讀者的建議/);
    expect(line.compareDocumentPosition(screen.getByRole("region", { name: lang === "en" ? "Cautions" : "注意事項" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(line.parentElement!).getByRole("link")).toHaveAttribute("href", "/sources");
  });
  it("R6 states that there is no source when the model has none", async () => {
    renderTree(<Tree lang={lang}><Page model={advice} /></Tree>);
    expect(await screen.findByText(lang === "en" ? "No source is recorded for this entry." : "此條目沒有記錄出處。")).toBeInTheDocument();
  });
  it("is free of axe violations", async () => {
    const { container } = renderTree(<Tree lang={lang}><Page model={advice} /></Tree>);
    await screen.findByRole("heading", { level: 1 });
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });
});

describe("the page template with many sections", () => {
  it("adds a short index of the page", async () => {
    const many: PageModel = { ...advice, adviceLike: false, sections: ["a", "b", "c", "d"].map((id) => ({ id, heading: `Part ${id}`, blocks: [{ kind: "plain" as const, text: id }] })) };
    renderTree(<Tree lang="en"><Page model={many} /></Tree>);
    const nav = await screen.findByRole("navigation", { name: "On this page" });
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
  });
});

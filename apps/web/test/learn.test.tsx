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
import { kb, loaded, loadedHans } from "./sweep.tsx";

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
  it("says what the section is, offers a search and one card per kind that exists, with counts", async () => {
    await open("/en/learn");
    expect(screen.getByRole("heading", { level: 1, name: "Learn" })).toBeInTheDocument();
    const cards = within(screen.getByRole("region", { name: "Browse by kind" })).getAllByRole("link");
    expect(cards.map((c) => c.getAttribute("href"))).toEqual(["/en/learn/quotations", "/en/learn/terms"]);
    expect(cards[1]).toHaveTextContent(`${kb.glossary.length} entries`);
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
    expect(screen.getByRole("status")).toHaveTextContent(`${kb.glossary.length} entries shown`);
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(5);
    await user.type(screen.getByRole("searchbox", { name: "Filter this list" }), "yin yang");
    const n = screen.getAllByRole("link", { name: /yin/i }).filter((l) => l.getAttribute("href")?.startsWith("/en/learn/terms/")).length;
    expect(n).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent(/entr(y|ies) shown/);
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "qzxqzx");
    expect(screen.getByRole("status")).toHaveTextContent("No entry matches the filter.");
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
  it.each(["/en/learn/terms/no-such-term", "/en/learn/patterns", "/en/learn/quotations/nope"])("%s", async (path) => {
    await open(path);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("This page is not in the Learn section");
    expect(screen.getByRole("link", { name: "Back to Learn" })).toHaveAttribute("href", "/en/learn");
  });
});

// ── the template's rules, on a synthetic page about something a person might use ─────────────────────────────────────────────────────────────

const advice: PageModel = {
  type: "formula", id: "test-formula", title: { "zh-Hant": "測試方", en: "Test formula" }, adviceLike: true,
  cautions: [{ "zh-Hant": "孕婦慎用。", en: "Use with care in pregnancy." }],
  flags: [{ "zh-Hant": "與抗凝藥物可能有交互作用。", en: "May interact with anticoagulant medicines." }],
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
    expect(cautions).toHaveTextContent(lang === "en" ? "May interact with anticoagulant medicines." : "與抗凝藥物可能有交互作用。");
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

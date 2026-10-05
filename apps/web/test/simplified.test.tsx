// Simplified Chinese in the shell (docs/post-mvp/design/simplified-chinese.md §5.3–§5.5): the route and its aliases, the three-way switch, the one-time offer, which knowledge base is loaded for
// which page language, and the one place where the display script meets a safety rule — an allergy typed in either script must be matched by name (stored in the
// data's own script, and folded by the rule itself as a second line).
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assessInputOf } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loader } from "../src/app/knowledge.tsx";
import hansIntake from "../src/i18n/zh-Hans/intake.json";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview } from "./interview.ts";
import { kb, loaded, loadedHans } from "./sweep.tsx";

const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); document.documentElement.lang = ""; document.title = ""; vi.restoreAllMocks(); });

const spy = (): { load: Loader; scripts: string[] } => {
  const scripts: string[] = [];
  return { scripts, load: async (script) => { scripts.push(script); return script === "Hans" ? loadedHans : loaded; } };
};

describe("the route and its aliases", () => {
  it("/zh-CN, /zh-hans and /ZH-sg go to /zh-Hans, keeping the rest; a bare /zh stays Traditional", () => {
    for (const alias of ["zh-CN", "zh-hans", "ZH-sg"]) {
      go(`/${alias}/nothing?x=1`);
      const { unmount } = renderApp();
      expect(window.location.pathname + window.location.search, alias).toBe("/zh-Hans/nothing?x=1");
      unmount();
    }
    go("/zh/nothing");
    renderApp();
    expect(window.location.pathname).toBe("/zh-Hant/nothing");
  });

  it("a saved zh-Hans choice is honoured at /", async () => {
    go("/");
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang: "zh-Hans" }));
    renderApp(testStore(env).store);
    expect(window.location.pathname).toBe("/zh-Hans/");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("依古典中医的方法，了解您的身体");
    expect(document.documentElement.lang).toBe("zh-Hans");
  });

  it("the page, the title and the not-found screen are Simplified", async () => {
    go("/zh-Hans/nothing");
    renderApp();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("找不到这个页面");
    await waitFor(() => expect(document.title).toBe("找不到这个页面 · 中医自我评估"));          // set by an effect after the heading appears
    expect(screen.getByRole("link", { name: "回到首页" })).toBeInTheDocument();
  });
});

describe("the language switch", () => {
  it("offers three languages, each named in its own script, and switching keeps the route and the query", async () => {
    go("/zh-Hant/nothing?draft=1");
    renderApp();
    const group = screen.getByRole("group", { name: "語言" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["繁體", "简体", "EN"]);
    expect(within(group).getByRole("button", { name: "简体" })).toHaveAttribute("lang", "zh-Hans");
    expect(within(group).getByRole("button", { name: "繁體" })).toHaveAttribute("lang", "zh-Hant");
    await userEvent.click(within(group).getByRole("button", { name: "简体" }));
    expect(window.location.pathname + window.location.search).toBe("/zh-Hans/nothing?draft=1");
    expect(await screen.findByRole("group", { name: "语言" })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("zh-Hans");
    expect(screen.getByRole("button", { name: "简体" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "繁體" })).toHaveAttribute("aria-pressed", "false");   // the Traditional option keeps its own script
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(window.location.pathname).toBe("/en/nothing");
    expect(document.title).toBe("We couldn't find that page · TCM Self-Check");
  });

  it("the settings page names the three languages in their own scripts", async () => {
    go("/zh-Hans/settings");
    renderApp();
    const radios = await screen.findAllByRole("radio");
    const labels = radios.map((r) => r.closest("label")?.textContent ?? "");
    expect(labels).toEqual(expect.arrayContaining(["繁體中文", "简体中文", "English"]));
  });
});

describe("the one-time offer", () => {
  const browser = (langs: string[]): void => { vi.spyOn(navigator, "languages", "get").mockReturnValue(langs); };

  it("a mainland browser is offered Simplified, in Simplified; Dismiss retires it without choosing", async () => {
    go("/zh-Hant/");
    browser(["zh-CN", "en"]);
    const { store } = renderApp();
    const offer = screen.getByRole("region", { name: "语言" });
    expect(offer).toHaveAttribute("lang", "zh-Hans");
    expect(offer).toHaveTextContent("本页也提供简体中文版。");
    await userEvent.click(within(offer).getByRole("button", { name: "不用了" }));
    expect(screen.queryByRole("region", { name: "语言" })).toBeNull();
    expect(store.getState().prefs.langOfferDismissed).toBe(true);
    expect(store.getState().prefs.lang).toBeUndefined();
  });

  it("accepting it switches the language, keeps the route and records the choice", async () => {
    go("/zh-Hant/nothing");
    browser(["zh-SG"]);
    const { store } = renderApp();
    await userEvent.click(screen.getByRole("button", { name: "改用简体中文" }));
    expect(window.location.pathname).toBe("/zh-Hans/nothing");
    expect(store.getState().prefs.lang).toBe("zh-Hans");
    await waitFor(() => expect(document.documentElement.lang).toBe("zh-Hans"));
  });

  it("is not offered to a Traditional-script browser, a bare zh, or someone who has chosen", () => {
    for (const langs of [["zh-TW"], ["zh-HK", "zh-CN"], ["zh"]]) {
      go("/zh-Hant/");
      browser(langs);
      const { unmount } = renderApp();
      expect(screen.queryByRole("region", { name: "语言" }), langs.join()).toBeNull();
      expect(screen.queryByRole("region", { name: "Language" }), langs.join()).toBeNull();
      unmount();
    }
    go("/zh-Hant/");
    browser(["zh-CN"]);
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang: "zh-Hant" }));
    renderApp(testStore(env).store);
    expect(screen.queryByRole("region", { name: "语言" })).toBeNull();
  });

  it("English is still offered to an English browser", () => {
    go("/zh-Hant/");
    browser(["en-GB"]);
    renderApp();
    expect(screen.getByRole("region", { name: "Language" })).toHaveTextContent("This page is also available in English.");
  });
});

describe("which knowledge base is loaded for which page language", () => {
  it("Simplified pages load it with the Simplified display list; Traditional and English pages without", async () => {
    for (const [path, script] of [["/zh-Hans/", "Hans"], ["/zh-Hant/", "Hant"], ["/en/", "Hant"]] as const) {
      go(path);
      const s = spy();
      const { unmount } = renderApp(undefined, s.load);
      await waitFor(() => expect(s.scripts.length).toBeGreaterThan(0));
      expect(new Set(s.scripts), path).toEqual(new Set([script]));
      unmount();
    }
  });

  it("switching between the two scripts loads again; switching between Traditional and English does not", async () => {
    go("/zh-Hant/nothing");
    const s = spy();
    renderApp(undefined, s.load);
    await waitFor(() => expect(s.scripts).toEqual(["Hant"]));
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    await act(async () => { await Promise.resolve(); });
    expect(s.scripts).toEqual(["Hant"]);
    await userEvent.click(screen.getByRole("button", { name: "繁體" }));
    await userEvent.click(screen.getByRole("button", { name: "简体" }));
    await waitFor(() => expect(s.scripts).toEqual(["Hant", "Hans"]));
  });
});

describe("an allergy meets the safety rules in either script", () => {
  it("typed in Simplified, 人参 is stored as 人參, shown as 人参, and the formula that contains 人參 is suppressed", async () => {
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang: "zh-Hans" }));
    const t = testStore(env);
    const draft = interview(kb, "SP1");
    t.store.getState().startDraft();
    t.store.getState().updateDraft((d) => ({ ...draft, id: d.id, startedAt: d.startedAt, profile: { ...draft.profile, allergies: "some" }, subject: { ...draft.subject, allergies: [] }, position: { route: "/start" } }));
    go("/zh-Hans/start");
    renderApp(t.store, () => Promise.resolve(loadedHans));
    const box = await screen.findByLabelText(hansIntake["intake.profile.allergy.label"]);
    await userEvent.type(box, "人参{Enter}");
    const stored = (): readonly string[] => t.store.getState().draft?.subject.allergies ?? [];
    await waitFor(() => expect(stored()).toEqual(["人參"]));               // the data's own string: what the safety rules match by name
    expect(screen.getByText("人参")).toBeInTheDocument();                  // and what the person sees
    expect(screen.queryByText("人參")).toBeNull();

    // the engine runs on the canonical data, in the release profile that removes what the allergy matches (the dev profile only annotates)
    const rel = indexKnowledgeBase(rawChunksFromDisk("release"));
    const input = (allergies: readonly string[]): NonNullable<ReturnType<typeof assessInputOf>> => assessInputOf({ ...t.store.getState().draft!, subject: { ...t.store.getState().draft!.subject, allergies } }, Date.UTC(2026, 9, 4, 12))!;
    const ids = (a: ReturnType<typeof engine.assess>): string[] => a.recommendations.formulas.map((f) => f.id);
    expect(ids(engine.assess(rel, input([])))).toContain("F_SIJUNZI");                     // a formula that contains 人參 is recommended without the allergy
    const stored2 = engine.assess(rel, input(stored()));
    expect(ids(stored2)).not.toContain("F_SIJUNZI");
    expect(stored2.suppressed.some((x) => x.id === "F_SIJUNZI")).toBe(true);
    expect(stored2.quality.unmatchedAllergies).toEqual([]);
    // the second line (PM-33): the rule folds both scripts to one, so the text as typed would have matched too
    const typed = engine.assess(rel, input(["人参"]));
    expect(ids(typed)).not.toContain("F_SIJUNZI");
    expect(typed.suppressed.some((x) => x.id === "F_SIJUNZI")).toBe(true);
    expect(typed.quality.unmatchedAllergies).toEqual([]);
    expect(ids(typed)).toEqual(ids(stored2));
    expect(ids(engine.assess(rel, input(["人參"])))).toEqual(ids(stored2));
  });

  it("text that names nothing the data knows is kept as it was typed, and picking an entry again does not turn it back", async () => {
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang: "zh-Hans" }));
    const t = testStore(env);
    const draft = interview(kb, "SP1");
    t.store.getState().startDraft();
    t.store.getState().updateDraft((d) => ({ ...draft, id: d.id, startedAt: d.startedAt, profile: { ...draft.profile, allergies: "some" }, subject: { ...draft.subject, allergies: ["人參"] }, position: { route: "/start" } }));
    go("/zh-Hans/start");
    renderApp(t.store, () => Promise.resolve(loadedHans));
    const box = await screen.findByLabelText(hansIntake["intake.profile.allergy.label"]);
    await userEvent.type(box, "花粉{Enter}");
    await waitFor(() => expect(t.store.getState().draft?.subject.allergies).toEqual(["人參", "花粉"]));
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_BUILD } from "../src/app/profile.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";

const kb = indexKnowledgeBase(rawChunksFromDisk("release"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); document.documentElement.removeAttribute("data-theme"); document.documentElement.style.removeProperty("--text-scale"); });

async function open(path: string, env = fakeEnvironment(), deps: Parameters<typeof testStore>[1] = {}) {
  go(path);
  const t = testStore(env, deps);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  return { ...view, ...t, env };
}

describe("shell navigation", () => {
  it("offers Sources and Settings in the header and Privacy, Sources and the version in the footer", async () => {
    await open("/en/");
    const menu = within(screen.getByRole("navigation", { name: "Main menu" }));
    expect(menu.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/en/settings");
    expect(menu.getByRole("link", { name: "Sources" })).toHaveAttribute("href", "/en/sources");
    const footer = within(screen.getByRole("navigation", { name: "Footer links" }));
    expect(footer.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/en/settings#privacy");
    expect(footer.getByRole("link", { name: "Sources" })).toHaveAttribute("href", "/en/sources");
    expect(footer.getByText(`Version ${APP_BUILD}`)).toBeInTheDocument();
  });
});

describe("Settings and privacy (S17)", () => {
  it("theme and text size apply at once and are remembered", async () => {
    const env = fakeEnvironment();
    const { store, unmount } = await open("/en/settings", env);
    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    await userEvent.click(screen.getByRole("radio", { name: "Extra large" }));
    expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe("1.3");
    expect(store.getState().prefs).toMatchObject({ theme: "dark", textScale: 1.3 });
    await userEvent.click(screen.getByRole("radio", { name: "Follow the system" }));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    unmount();
    const again = await open("/en/settings", env);
    expect(again.store.getState().prefs.textScale).toBe(1.3);
    expect(screen.getByRole("radio", { name: "Extra large" })).toBeChecked();
  });

  it("'move on automatically' can be turned off", async () => {
    const { store } = await open("/en/settings");
    const box = screen.getByRole("checkbox", { name: /Move on automatically after I answer/ });
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(store.getState().prefs.autoAdvance).toBe(false);
  });

  it("the language can be switched here and the route is kept", async () => {
    await open("/zh-Hant/settings");
    await userEvent.click(screen.getByRole("radio", { name: "English" }));
    expect(window.location.pathname).toBe("/en/settings");
    expect(await screen.findByRole("heading", { level: 1, name: "Settings and privacy" })).toBeInTheDocument();
  });

  it("says what is stored, where, for how long and how to remove it — and what is never collected", async () => {
    await open("/en/settings");
    const table = within(screen.getByRole("table", { name: "What this app stores on this device" }));
    expect(table.getAllByRole("row")).toHaveLength(5);                        // header + preferences, draft, results, birth data
    expect(table.getByText(/Preferences \(language, appearance, text size/)).toBeInTheDocument();
    expect(table.getByText(/stored in IndexedDB only if you tick “Remember on this device”/)).toBeInTheDocument();
    expect(screen.getByText(/no accounts, no server that receives your answers, no analytics and no cookies/)).toBeInTheDocument();
    expect(screen.getByText(/Never collected: name, email, phone/)).toBeInTheDocument();
    expect(screen.getByText(/may be included in device backups/)).toBeInTheDocument();
  });

  it("erase everything states exactly what goes, asks once, then deletes and reloads", async () => {
    const env = fakeEnvironment();
    const reload = vi.fn();
    const { store } = await open("/en/settings", env, { reload });
    store.getState().setPrefs({ theme: "dark" });
    expect(env.localStorage.length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Erase everything…" }));
    const dialog = screen.getByRole("dialog", { name: "Erase everything on this device" });
    expect(dialog).toHaveTextContent("preferences, the assessment in progress, all saved results and the files this browser cached");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(env.localStorage.length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Erase everything…" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Erase everything" }));
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(env.localStorage.length).toBe(0);
    expect(await env.indexedDB!.databases()).toEqual([]);
  });

  it("shows the version stamps and links to the sources", async () => {
    await open("/en/settings");
    const versions = within(await screen.findByRole("region", { name: "Versions" }));
    expect(versions.getByText(APP_BUILD)).toBeInTheDocument();
    expect(await versions.findByText(kb.version.slice(0, 12))).toBeInTheDocument();
    expect(versions.getByText(engine.ENGINE_VERSION)).toBeInTheDocument();
    expect(versions.getByText("release")).toBeInTheDocument();
    expect(versions.getByRole("link", { name: "See the sources and their review status" })).toHaveAttribute("href", "/en/sources");
  });

  it.each(["en", "zh-Hant"] as const)("has no axe violations (%s)", async (lang) => {
    const { container } = await open(`/${lang}/settings`);
    await screen.findByRole("heading", { level: 1 });
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

  it("is in Traditional Chinese on the zh-Hant route", async () => {
    await open("/zh-Hant/settings");
    expect(await screen.findByRole("heading", { level: 1, name: "設定與隱私" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "本應用程式在這部裝置上儲存的內容" })).toBeInTheDocument();
  });
});

describe("Sources (S18)", () => {
  it("states plainly that everything is a draft, with the counts and the review status of patterns and formulas", async () => {
    await open("/en/sources");
    expect(await screen.findByRole("heading", { level: 1, name: "Sources" })).toBeInTheDocument();
    expect(screen.getByText(/All of it is currently a draft/)).toBeInTheDocument();
    const status = within(screen.getByRole("table", { name: "Review status by kind of content" }));
    expect(status.getByRole("row", { name: new RegExp(`^Patterns ${kb.patterns.length}`) })).toHaveTextContent("Draft — not yet reviewed by a qualified practitioner");
    expect(status.getByRole("row", { name: new RegExp(`^Formulas ${kb.formulas.size}`) })).toBeInTheDocument();
  });

  it("lists every book of the quoted passages with its count, how many were matched against the source text, and where the text comes from", async () => {
    await open("/en/sources");
    const books = within(await screen.findByRole("table", { name: /^Books, the passages quoted/ }));
    const ids = new Set([...kb.formulas.values()].flatMap((f) => [f.source.ref, ...f.rationale_citations]).concat(kb.patterns.flatMap((p) => p.citations)));
    const expected = new Map<string, number>();
    for (const id of ids) { const c = kb.citation(id); if (c) expected.set(c.book, (expected.get(c.book) ?? 0) + 1); }
    expect(books.getAllByRole("row").length).toBe(expected.size + 1);
    for (const [book, n] of expected) expect(books.getByRole("row", { name: new RegExp(`《${book}》 ${n} `) })).toBeInTheDocument();
    expect(books.getAllByText(/TCM-Library \(MIT\)/).length).toBeGreaterThan(0);
  });

  it("names the licences and links to the notice file that ships with the app, which names every source of the data", async () => {
    await open("/en/sources");
    const card = within(await screen.findByRole("region", { name: "Licences and acknowledgements" }));
    expect(card.getByText(/TCM-Library \(MIT licence\)/)).toBeInTheDocument();
    expect(card.getByText(/Apache License 2\.0/)).toBeInTheDocument();
    expect(card.getByRole("link", { name: /Read the full notice/ })).toHaveAttribute("href", "/NOTICE.txt");
    // every source the knowledge base records in its citations is in the notice
    const notice = readFileSync(join(import.meta.dirname, "..", "..", "..", "NOTICE"), "utf8");
    const ids = new Set([...kb.formulas.values()].flatMap((f) => [f.source.ref, ...f.rationale_citations]).concat(kb.patterns.flatMap((p) => p.citations)));
    for (const id of ids) { const c = kb.citation(id); if (c?.source_repo) expect(notice, c.source_repo).toContain(c.source_repo.replace(/ \(.*$/, "")); }
  });

  it("is in Traditional Chinese too", async () => {
    await open("/zh-Hant/sources");
    expect(await screen.findByRole("region", { name: "授權與致謝" })).toHaveTextContent("Apache License 2.0");
  });

  it.each(["en", "zh-Hant"] as const)("has no axe violations (%s)", async (lang) => {
    const { container } = await open(`/${lang}/sources`);
    await screen.findByRole("heading", { level: 1 });
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

// What the person sees of the offline copy (docs/post-mvp/design/offline-and-install.md §3.5): the update notice, the quiet line on the landing page, Settings → Offline use, the language switch
// without a connection, and what erasing everything does about the worker. The connection to the worker is a fake with a view the test can change.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Loaded } from "../src/app/knowledge.tsx";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";
import { OfflineProvider } from "../src/offline/OfflineEffects.tsx";
import type { Offline, OfflineView } from "../src/offline/worker.ts";
import { OfflineCard } from "../src/screens/settings/OfflineCard.tsx";
import type { Script } from "../src/sw/build.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); vi.restoreAllMocks(); });

/** A connection to the worker that does what it is told: the test sets the view and reads what the screens asked for. */
function fakeOffline(initial: Partial<OfflineView> = {}) {
  let view: OfflineView = { status: "ready", updateDismissed: false, cachedScripts: ["Hant"], ...initial };
  const listeners = new Set<() => void>();
  const calls = { apply: 0, dismiss: 0, remove: 0, ensure: [] as Script[] };
  const set = (patch: Partial<OfflineView>): void => { view = { ...view, ...patch }; for (const l of [...listeners]) l(); };
  const offline: Offline = {
    getStatus: () => view.status,
    getView: () => view,
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    ensure: async (s) => { calls.ensure.push(s); },
    applyUpdate: async () => { calls.apply++; },
    dismissUpdate: () => { calls.dismiss++; set({ updateDismissed: true }); },
    remove: async () => { calls.remove++; set({ status: "removed", cachedScripts: [] }); },
  };
  return { offline, calls, set };
}

function open(path: string, offline: Offline, lang: "en" | "zh-Hant" = "en") {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang }));
  const t = testStore(env);
  go(`/${lang}${path}`);
  return { ...renderApp(t.store, () => Promise.resolve(loaded), offline), ...t };
}

describe("the update notice", () => {
  it("is not shown while the offline copy is current, and appears — as a status — when a newer build is ready", async () => {
    const { offline, set } = fakeOffline();
    open("/", offline);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByText("A new version is ready.", { selector: "span" })).toBeNull();
    act(() => set({ status: "update-ready" }));
    const banner = screen.getByText("A new version is ready.", { selector: "span" }).closest("[role=status]")!;
    expect(within(banner as HTMLElement).getByRole("button", { name: "Reload to update" })).toBeInTheDocument();
    expect(within(banner as HTMLElement).getByRole("button", { name: "Later" })).toBeInTheDocument();
  });

  it("Reload asks for the update; nothing else does", async () => {
    const { offline, calls, set } = fakeOffline();
    open("/en/", offline);
    act(() => set({ status: "update-ready" }));
    expect(calls.apply).toBe(0);
    await userEvent.click(within(screen.getByText("A new version is ready.", { selector: "span" }).closest("[role=status]") as HTMLElement).getByRole("button", { name: "Reload to update" }));
    expect(calls.apply).toBe(1);
  });

  it("Later hides the strip for this visit, and the landing page keeps a quiet line that still offers the reload", async () => {
    const { offline, calls, set } = fakeOffline({ status: "update-ready" });
    open("/", offline);
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(calls.dismiss).toBe(1);
    expect(screen.queryByRole("button", { name: "Later" })).toBeNull();
    const line = screen.getByText(/A new version is ready\./, { selector: "p" });
    await userEvent.click(within(line).getByRole("button", { name: "Reload to update" }));
    expect(calls.apply).toBe(1);
    act(() => set({ status: "ready" }));
    expect(screen.queryByText(/A new version is ready\./)).toBeNull();
  });

  it("the landing page does not repeat the strip while the strip is showing", async () => {
    const { offline } = fakeOffline({ status: "update-ready" });
    open("/", offline);
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getAllByRole("button", { name: "Reload to update" })).toHaveLength(1);
  });

  it("is in Traditional Chinese too", async () => {
    const { offline } = fakeOffline({ status: "update-ready" });
    open("/", offline, "zh-Hant");
    expect(await screen.findByRole("button", { name: "重新載入並更新" })).toBeInTheDocument();
    expect(screen.getByText("有新版本可用。", { selector: "span" })).toBeInTheDocument();
  });
});

describe("Settings → Offline use", () => {
  function card(offline: Offline, lang: "en" | "zh-Hant" = "en") {
    return render(<OfflineProvider value={offline}><I18nProvider lang={lang} setLang={() => undefined}><OfflineCard /></I18nProvider></OfflineProvider>);
  }
  const STATUS: [OfflineView["status"], RegExp][] = [
    ["ready", /saved on this device and works without a connection/],
    ["preparing", /Saving this app on this device/],
    ["update-ready", /A new version is ready\. It is applied when you reload/],
    ["failed", /could not save this app for offline use/],
    ["removed", /offline copy was removed/],
    ["unsupported", /This browser cannot keep an offline copy/],
  ];

  it("says the state in words, as a live region, for every status", () => {
    for (const [status, words] of STATUS) {
      const { offline } = fakeOffline({ status });
      const { unmount } = card(offline);
      expect(screen.getByRole("status")).toHaveTextContent(words);
      unmount();
    }
  });

  it("offers Remove offline copy wherever there is a copy to remove, and Reload to update only when one waits", () => {
    for (const [status] of STATUS) {
      const { offline } = fakeOffline({ status });
      const { unmount } = card(offline);
      const removable = status !== "unsupported" && status !== "removed";
      expect(screen.queryByRole("button", { name: "Remove offline copy" }) !== null, status).toBe(removable);
      expect(screen.queryByRole("button", { name: "Reload to update" }) !== null, status).toBe(status === "update-ready");
      expect(screen.queryByText(/not your answers or results/) !== null, status).toBe(removable);
      unmount();
    }
  });

  it("removes the copy and says so", async () => {
    const { offline, calls } = fakeOffline();
    card(offline);
    await userEvent.click(screen.getByRole("button", { name: "Remove offline copy" }));
    expect(calls.remove).toBe(1);
    expect(screen.getByRole("status")).toHaveTextContent(/offline copy was removed/);
    expect(screen.queryByRole("button", { name: "Remove offline copy" })).toBeNull();
  });

  it("loads a waiting update on request", async () => {
    const { offline, calls } = fakeOffline({ status: "update-ready" });
    card(offline);
    await userEvent.click(screen.getByRole("button", { name: "Reload to update" }));
    expect(calls.apply).toBe(1);
  });

  it("has no accessibility violations, in either language", async () => {
    for (const lang of ["en", "zh-Hant"] as const) {
      const { offline } = fakeOffline({ status: "update-ready" });
      const { container, unmount } = card(offline, lang);
      expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      unmount();
    }
  });

  it("is not in a development build's Settings (it never registers a worker)", async () => {
    const { offline } = fakeOffline();
    open("/settings", offline);
    await screen.findByRole("heading", { level: 1, name: "Settings and privacy" });
    expect(screen.queryByRole("heading", { name: "Offline use" })).toBeNull();
  });
});

describe("the language switch without a connection", () => {
  const offlineBrowser = (online: boolean): void => { vi.spyOn(navigator, "onLine", "get").mockReturnValue(online); };

  it("says that Simplified needs a connection the first time, and does not switch, when its files are not in the offline copy", async () => {
    offlineBrowser(false);
    const { offline } = fakeOffline({ status: "ready", cachedScripts: ["Hant"] });
    open("/nothing", offline);
    await userEvent.click(screen.getByRole("button", { name: "简体" }));
    expect(screen.getByText("简体中文 needs a connection the first time you use it. Connect once and try again.")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/en/nothing");
    await userEvent.click(screen.getByRole("button", { name: "繁體" }));          // Traditional is cached: no note, the switch is made
    expect(window.location.pathname).toBe("/zh-Hant/nothing");
    expect(screen.queryByText(/needs a connection the first time/)).toBeNull();
  });

  it("switches when the files are cached, when there is a connection, or when the browser keeps no offline copy at all", async () => {
    offlineBrowser(false);
    const cached = fakeOffline({ status: "ready", cachedScripts: ["Hans", "Hant"] });
    const first = open("/nothing", cached.offline);
    await userEvent.click(screen.getByRole("button", { name: "简体" }));
    await waitFor(() => expect(window.location.pathname).toBe("/zh-Hans/nothing"));
    first.unmount();

    go("/en/nothing");
    offlineBrowser(true);
    const online = fakeOffline({ status: "ready", cachedScripts: ["Hant"] });
    const second = open("/nothing", online.offline);
    await userEvent.click(screen.getByRole("button", { name: "简体" }));
    await waitFor(() => expect(window.location.pathname).toBe("/zh-Hans/nothing"));
    second.unmount();

    go("/en/nothing");
    offlineBrowser(false);
    const none = fakeOffline({ status: "unsupported", cachedScripts: [] });
    open("/nothing", none.offline);
    await userEvent.click(screen.getByRole("button", { name: "简体" }));
    await waitFor(() => expect(window.location.pathname).toBe("/zh-Hans/nothing"));
  });

  it("Traditional and English share their files, so switching between them is never held back", async () => {
    offlineBrowser(false);
    const { offline } = fakeOffline({ status: "ready", cachedScripts: [] });
    open("/nothing", offline);
    await userEvent.click(screen.getByRole("button", { name: "繁體" }));
    expect(window.location.pathname).toBe("/zh-Hant/nothing");
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(window.location.pathname).toBe("/en/nothing");
  });
});

describe("the page and the worker", () => {
  it("asks the worker for the knowledge files of the script in use, and again when the person switches script", async () => {
    const { offline, calls } = fakeOffline();
    open("/nothing", offline);
    await waitFor(() => expect(calls.ensure).toEqual(["Hant"]));
    await userEvent.click(screen.getByRole("button", { name: "简体" }));
    await waitFor(() => expect(calls.ensure).toEqual(["Hant", "Hans"]));
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    await waitFor(() => expect(calls.ensure).toEqual(["Hant", "Hans", "Hant"]));
  });

  it("erasing everything also removes the offline copy and the worker — and an erase goes on even if that fails", async () => {
    const removed: string[] = [];
    const t = testStore(fakeEnvironment(), { removeOfflineCopy: async () => { removed.push("removed"); } });
    await t.store.getState().eraseAll();
    expect(removed).toEqual(["removed"]);
    let reloads = 0;
    const failing = testStore(fakeEnvironment(), { removeOfflineCopy: async () => { throw new Error("no"); }, reload: () => { reloads++; } });
    await failing.store.getState().eraseAll();
    expect(reloads).toBe(1);
  });
});

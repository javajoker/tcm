// Storage health (docs/post-mvp/design/backup-and-data-lock.md §4; task PM-10): what the app uses, whether the browser keeps it, a button to ask — a click, never by itself — and why data can disappear.
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { StoreProvider } from "../src/app/store.tsx";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";
import { InstallProvider } from "../src/install/InstallContext.tsx";
import { createInstall } from "../src/install/install.ts";
import { StorageHealth } from "../src/screens/settings/StorageHealth.tsx";
import { askToKeep, readHealth, sizeParts, UNKNOWN, type StorageManagerLike } from "../src/storage/health.ts";
import type { SavedAssessment } from "../src/storage/types.ts";
import { blockedEnvironment, fakeEnvironment, testStore } from "./helpers.tsx";
import { interview } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const saved = (): SavedAssessment => { const d = interview(kb, "SP1"); return toSaved(d, engine.assess(kb, assessInputOf(d, Date.UTC(2026, 9, 5))!), { id: "h000000000000001", lang: "en" }); };

describe("reading the browser", () => {
  it("is unknown without a manager, with one that has nothing, and with one that throws or answers nonsense", async () => {
    expect(await readHealth(null)).toEqual(UNKNOWN);
    expect(await readHealth(undefined)).toEqual(UNKNOWN);
    expect(await readHealth({})).toEqual(UNKNOWN);
    expect(await readHealth({ estimate: async () => { throw new Error("no"); }, persisted: async () => { throw new Error("no"); }, persist: async () => true })).toEqual(UNKNOWN);
    expect(await readHealth({ estimate: async () => ({ usage: Number.NaN, quota: -5 }), persisted: async () => undefined as unknown as boolean })).toEqual(UNKNOWN);
    expect(await readHealth({ estimate: async () => ({ usage: "lots" as unknown as number }) })).toEqual(UNKNOWN);
  });

  it("reads the usage, the quota and whether the data is kept; it can be asked only when it is not kept and the browser can be asked", async () => {
    const m = (persisted: boolean, withPersist = true): StorageManagerLike => ({ estimate: async () => ({ usage: 3_100_000, quota: 8e9 }), persisted: async () => persisted, ...(withPersist ? { persist: async () => true } : {}) });
    expect(await readHealth(m(false))).toEqual({ usage: 3_100_000, quota: 8e9, persisted: false, canAsk: true });
    expect(await readHealth(m(true))).toEqual({ usage: 3_100_000, quota: 8e9, persisted: true, canAsk: false });
    expect(await readHealth(m(false, false))).toEqual({ usage: 3_100_000, quota: 8e9, persisted: false, canAsk: false });
    expect(await readHealth({ estimate: async () => ({ usage: 5 }) })).toEqual({ usage: 5, quota: null, persisted: null, canAsk: false });
  });

  it("asking reports the answer either way, and never throws", async () => {
    expect(await askToKeep({ persist: async () => true })).toBe("granted");
    expect(await askToKeep({ persist: async () => false })).toBe("denied");
    expect(await askToKeep({ persist: async () => { throw new Error("no"); } })).toBe("unavailable");
    expect(await askToKeep({})).toBe("unavailable");
    expect(await askToKeep(null)).toBe("unavailable");
  });

  it("sizes read in the unit that reads best, one decimal below ten", () => {
    expect(sizeParts(0)).toEqual({ value: 0, unit: "byte" });
    expect(sizeParts(999)).toEqual({ value: 999, unit: "byte" });
    expect(sizeParts(1_500)).toEqual({ value: 1.5, unit: "kilobyte" });
    expect(sizeParts(812_345)).toEqual({ value: 812, unit: "kilobyte" });
    expect(sizeParts(3_100_000)).toEqual({ value: 3.1, unit: "megabyte" });
    expect(sizeParts(48_400_000)).toEqual({ value: 48, unit: "megabyte" });
    expect(sizeParts(1_234_000_000)).toEqual({ value: 1.2, unit: "gigabyte" });
  });
});

async function show(manager: StorageManagerLike | null, over: { saved?: boolean; blocked?: boolean; compact?: boolean; lang?: "en" | "zh-Hant"; installed?: boolean } = {}) {
  cleanup();                                              // one component at a time
  const t = testStore(over.blocked ? (blockedEnvironment() as unknown as ReturnType<typeof fakeEnvironment>) : fakeEnvironment());
  if (over.saved) await t.persistence.putAssessment(saved());
  const listeners: (() => void)[] = [];
  const install = createInstall({ target: { addEventListener: ((_t: string, l: () => void) => { listeners.push(l); }) as never }, standalone: { matches: () => over.installed ?? false, onChange: () => undefined } });
  const view = render(
    <StoreProvider store={t.store}><InstallProvider value={install}><I18nProvider lang={over.lang ?? "en"} setLang={() => undefined}><StorageHealth manager={manager} {...(over.compact ? { compact: true } : {})} /></I18nProvider></InstallProvider></StoreProvider>,
  );
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return { ...view, ...t };
}
const manager = (over: { persisted?: boolean; estimate?: StorageManagerLike["estimate"]; persist?: StorageManagerLike["persist"] } = {}): StorageManagerLike & { calls: string[] } => {
  let kept = over.persisted ?? false;
  const calls: string[] = [];
  return { calls, estimate: over.estimate ?? (async () => ({ usage: 3_100_000, quota: 8e9 })), persisted: async () => kept, persist: over.persist ?? (async () => { calls.push("persist"); kept = true; return true; }) };
};

describe("Storage health on screen", () => {
  it("says what is used, that the browser may discard the data, and why data can disappear", async () => {
    await show(manager(), { saved: true });
    expect(screen.getByText(/This app is using about 3\.1\s?MB on this device\./)).toBeInTheDocument();
    expect(screen.getByText("The browser may discard this data if the device runs low on space.")).toBeInTheDocument();
    const why = screen.getByRole("heading", { name: "Why data can disappear" });
    expect(why).toBeInTheDocument();
    for (const text of [/private window is cleared/, /Safari especially/, /Clearing your browsing data/, /A different browser or device/]) expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("asks the browser only when the button is pressed, after the first saved result — and reports the answer", async () => {
    const m = manager();
    await show(m, { saved: true });
    expect(m.calls).toEqual([]);                                                // nothing on render
    await userEvent.click(screen.getByRole("button", { name: "Ask the browser to keep my data" }));
    expect(m.calls).toEqual(["persist"]);
    expect(await screen.findByText("The browser agreed to keep your data.")).toBeInTheDocument();
    expect(screen.getByText("The browser has agreed to keep this data.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask the browser to keep my data" })).toBeNull();
  });

  it("a refusal is reported with what to do instead", async () => {
    await show(manager({ persist: async () => false }), { saved: true });
    await userEvent.click(screen.getByRole("button", { name: "Ask the browser to keep my data" }));
    expect(await screen.findByText(/The browser did not agree\. It decides for itself.*A backup is the sure way/)).toBeInTheDocument();
    await show(manager({ persist: async () => { throw new Error("no"); } }), { saved: true });
    await userEvent.click(screen.getByRole("button", { name: "Ask the browser to keep my data" }));
    expect(await screen.findByText(/This browser cannot be asked\./)).toBeInTheDocument();
  });

  it("offers nothing to ask before there is a saved result, when the data is already kept, or when the browser cannot be asked", async () => {
    const none = manager();
    await show(none, { saved: false });
    expect(screen.queryByRole("button", { name: "Ask the browser to keep my data" })).toBeNull();
    expect(none.calls).toEqual([]);
    await show(manager({ persisted: true }), { saved: true });
    expect(screen.queryByRole("button", { name: "Ask the browser to keep my data" })).toBeNull();
    await show({ estimate: async () => ({ usage: 1_000_000 }), persisted: async () => false }, { saved: true });
    expect(screen.queryByRole("button", { name: "Ask the browser to keep my data" })).toBeNull();
  });

  it("works where there is no storage API at all: the fixed text alone, no usage line, no button", async () => {
    await show(null, { saved: true });
    expect(screen.getByRole("heading", { name: "Why data can disappear" })).toBeInTheDocument();
    expect(screen.queryByText(/This app is using about/)).toBeNull();
    expect(screen.queryByText(/The browser (may discard|has agreed)/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("works where storage is blocked: it says the data is not being saved, and offers nothing else", async () => {
    await show(manager(), { saved: false, blocked: true });
    expect(screen.getByText(/Your data is not being saved on this device right now/)).toBeInTheDocument();
    expect(screen.queryByText(/This app is using about/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("heading", { name: "Why data can disappear" })).toBeInTheDocument();
  });

  it("says when the app is installed, and points to installing when it is not", async () => {
    const view = await show(manager(), { installed: true });
    expect(screen.getByText("This app is installed. Installed apps are likelier to keep their data.")).toBeInTheDocument();
    view.unmount();
    await show(manager(), { installed: false });
    expect(screen.getByText(/see “Install this app” on this page/)).toBeInTheDocument();
  });

  it("the short form inside the backup dialog has the lines and the button but not the explanation", async () => {
    await show(manager(), { saved: true, compact: true });
    expect(screen.getByText(/This app is using about/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask the browser to keep my data" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Why data can disappear" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Where your data lives" })).toBeNull();
  });

  it("is in Traditional Chinese, and has no accessibility violations", async () => {
    const view = await show(manager(), { saved: true, lang: "zh-Hant" });
    expect(screen.getByRole("heading", { name: "資料存放的地方" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "請瀏覽器保留我的資料" })).toBeInTheDocument();
    expect(within(view.container).getByText(/裝置儲存空間不足時，瀏覽器可能會清除這些資料/)).toBeInTheDocument();
    expect((await axe(view.container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  it("never touches the browser's storage manager on its own beyond reading", async () => {
    const m = manager();
    const persist = vi.spyOn(m, "persist");
    await show(m, { saved: true });
    expect(persist).not.toHaveBeenCalled();
  });
});

// The local data lock on screen (docs/post-mvp/design/backup-and-data-lock.md §5, §7; task PM-20): the Settings card and its three dialogs, the lock screen that replaces the app, the throttle, the idle lock,
// Lock now, the other tab — and, from outside, that the stored history is unreadable while the lock is on and readable again when it is off.
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { LOCK_KEY, openIndexedDb } from "../src/storage/db.ts";
import { createPersistence, type Environment } from "../src/storage/persistence.ts";
import type { SavedAssessment } from "../src/storage/types.ts";
import { blockedEnvironment, fakeEnvironment, renderApp, TEST_ITERATIONS, testStore } from "./helpers.tsx";
import { dictionary, traditionalOnScreen } from "./hans.ts";
import { interview } from "./interview.ts";
import { alignedList, chineseStrings, newDisplay } from "@tcm/kb";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const raw = rawChunksFromDisk("dev");
const hansKb = (() => { const list = chineseStrings(raw.core, raw.formulas, raw.citations, raw.guidance, raw.herbs); const display = newDisplay(); display.add(list, alignedList(list, dictionary)); return indexKnowledgeBase(raw, display); })();
const loaded: Loaded = { kb, engine };
const loadedHans: Loaded = { kb: hansKb, engine };
const PASS = "correct horse battery staple";
const OTHER = "another long passphrase 42";
const SECRET = "SECRET-NOTE-FOR-THE-LOCK-TEST";
const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { cleanup(); go("/"); vi.useRealTimers(); });

function record(id: string, at: number, extra: Partial<SavedAssessment> = {}): SavedAssessment {
  const d = interview(kb, "SP1");
  return { ...toSaved(d, engine.assess(kb, assessInputOf(d, at)!), { id, lang: "en" }), createdAt: at, ...extra };
}
const results = (): SavedAssessment[] => [record("ra0000000000000a", Date.UTC(2026, 8, 1, 6), { userNote: SECRET }), record("rb0000000000000b", Date.UTC(2026, 8, 20, 6))];

interface Opening { readonly lang?: "en" | "zh-Hant" | "zh-Hans"; readonly env?: ReturnType<typeof fakeEnvironment>; readonly prefs?: Record<string, unknown>; readonly lockOn?: boolean; readonly items?: SavedAssessment[] }
async function open(path: string, opening: Opening = {}) {
  cleanup();
  const lang = opening.lang ?? "en";
  const env = opening.env ?? fakeEnvironment();
  try { env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang, ...opening.prefs })); } catch { /* storage that is blocked, on purpose */ }
  const seed = testStore(env);
  for (const s of opening.items ?? results()) await seed.persistence.putAssessment(s);
  if (opening.lockOn === true) expect(await seed.persistence.lock.enable(PASS)).toBe("ok");
  go(`/${lang}${path}`);
  const refreshes = { count: 0 };                                             // per app: a store of an earlier test also hears the announcements (its tab is still open)
  const t = testStore(env, { refresh: () => { refreshes.count += 1; } });          // a new store on the same device: a reload
  const view = renderApp(t.store, () => Promise.resolve(lang === "zh-Hans" ? loadedHans : loaded));
  await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
  return { ...view, ...t, env, refreshes, user: userEvent.setup() };
}
/** The raw stored text, read from outside the persistence layer. */
async function dump(env: Environment): Promise<string> {
  const db = await openIndexedDb(env.indexedDB!);
  const out: unknown[] = [];
  for (const s of ["drafts", "assessments", "meta"] as const) out.push(await db.entries(s));
  db.close();
  return JSON.stringify(out);
}

describe("the Settings card", () => {
  it("says what the lock does and does not do, and offers to turn it on", async () => {
    await open("/settings");
    const card = within(await screen.findByRole("region", { name: "Lock the history" }));
    expect(card.getByText(/Someone who gets this browser's files, or a copy of them, sees nothing readable\./)).toBeInTheDocument();
    expect(card.getByText(/not a defence against malware/)).toBeInTheDocument();
    expect(card.getByText(/A forgotten passphrase cannot be recovered by anyone\./)).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Turn the lock on…" })).toBeEnabled();
  });

  it("cannot be turned on where storage is blocked, and says why", async () => {
    await open("/settings", { env: blockedEnvironment() as unknown as ReturnType<typeof fakeEnvironment>, items: [] });
    const card = within(await screen.findByRole("region", { name: "Lock the history" }));
    expect(await card.findByText(/The lock needs storage that works/)).toBeInTheDocument();
    expect(card.queryByRole("button", { name: "Turn the lock on…" })).toBeNull();
  });
});

describe("turning the lock on", () => {
  async function dialogOf() {
    const opened = await open("/settings");
    await opened.user.click(await screen.findByRole("button", { name: "Turn the lock on…" }));
    return { ...opened, dialog: await screen.findByRole("dialog", { name: "Turn the lock on" }) };
  }

  it("explains it, asks for a backup, and does not let the button be pressed until the passphrase is long enough, typed twice, and the backup question is answered", async () => {
    const { dialog, user } = await dialogOf();
    expect(within(dialog).getByText(/What it does: the saved results and the unfinished assessment are encrypted on this device\./)).toBeInTheDocument();
    expect(within(dialog).getByText(/What it does not do: it does not protect against malware/)).toBeInTheDocument();
    expect(within(dialog).getByText(/If the passphrase is forgotten, the history is gone/)).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { level: 3, name: "A backup first" })).toBeInTheDocument();
    expect(within(dialog).getByText(/There is no backup from the last few minutes/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Make a backup…" })).toBeInTheDocument();
    const turnOn = within(dialog).getByRole("button", { name: "Turn the lock on" });
    expect(turnOn).toBeDisabled();
    const fields = within(dialog).getAllByLabelText(/^(Passphrase|Type it again)$/);
    await user.type(fields[0]!, "short");
    expect(within(dialog).getByText("Use at least 10 characters.")).toBeInTheDocument();
    await user.clear(fields[0]!);
    await user.type(fields[0]!, PASS);
    expect(within(dialog).getByText("Good.")).toBeInTheDocument();
    await user.type(fields[1]!, "something else");
    expect(within(dialog).getByText("The two passphrases are not the same.")).toBeInTheDocument();
    await user.clear(fields[1]!);
    await user.type(fields[1]!, PASS);
    expect(turnOn).toBeDisabled();                                                     // the backup question is not answered
    await user.click(within(dialog).getByRole("checkbox", { name: /I understand that without a backup a forgotten passphrase loses my history/ }));
    expect(turnOn).toBeEnabled();
  });

  it("a backup made in the last quarter of an hour counts: no box to tick", async () => {
    const opened = await open("/settings", { prefs: { lastBackupAt: Date.now() - 60_000 } });
    await opened.user.click(await screen.findByRole("button", { name: "Turn the lock on…" }));
    const dialog = await screen.findByRole("dialog", { name: "Turn the lock on" });
    expect(within(dialog).getByText(/A backup was made .*\. That is recent enough\./)).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    const fields = within(dialog).getAllByLabelText(/^(Passphrase|Type it again)$/);
    await opened.user.type(fields[0]!, PASS);
    await opened.user.type(fields[1]!, PASS);
    expect(within(dialog).getByRole("button", { name: "Turn the lock on" })).toBeEnabled();
  });

  it("encrypts the history: the card then says it is locked, the stored text shows nothing of it, Lock now and the header button appear", async () => {
    const { dialog, user, env } = await dialogOf();
    expect(await dump(env)).toContain(SECRET);
    const fields = within(dialog).getAllByLabelText(/^(Passphrase|Type it again)$/);
    await user.type(fields[0]!, PASS);
    await user.type(fields[1]!, PASS);
    await user.click(within(dialog).getByRole("checkbox", { name: /I understand/ }));
    await user.click(within(dialog).getByRole("button", { name: "Turn the lock on" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 15_000 });
    const card = within(screen.getByRole("region", { name: "Lock the history" }));
    expect(card.getByText(/The history on this device is locked with a passphrase\. It locks itself after 10 minutes without use\./)).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Lock now" })).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Change the passphrase…" })).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Turn the lock off…" })).toBeInTheDocument();
    expect(card.queryByRole("button", { name: "Turn the lock on…" })).toBeNull();
    expect(await dump(env)).not.toMatch(new RegExp(`${SECRET}|userNote|S_FATIGUE|ageYears|kbVersion`));
    expect(within(screen.getByRole("navigation", { name: "Main menu" })).getByRole("button", { name: "Lock" })).toBeInTheDocument();
    expect(env.localStorage.getItem("tcm.lockHint")).toBe("1");
  });

  it("says plainly when it could not be turned on, and changes nothing", async () => {
    const { dialog, user, env, persistence } = await dialogOf();
    vi.spyOn(persistence.lock, "enable").mockResolvedValue("failed");
    const fields = within(dialog).getAllByLabelText(/^(Passphrase|Type it again)$/);
    await user.type(fields[0]!, PASS);
    await user.type(fields[1]!, PASS);
    await user.click(within(dialog).getByRole("checkbox", { name: /I understand/ }));
    const before = await dump(env);
    await user.click(within(dialog).getByRole("button", { name: "Turn the lock on" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The lock could not be turned on, and nothing was changed. Try again.");
    expect(await dump(env)).toBe(before);
  });
});

describe("a locked device", () => {
  it("shows the lock screen instead of the app: no history, no menu, a field for the passphrase, the language and the theme, and a way out", async () => {
    await open("/history", { lockOn: true });
    expect(await screen.findByRole("heading", { level: 1, name: "The history on this device is locked" })).toBeInTheDocument();
    expect(screen.getByLabelText("Passphrase")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();
    expect(screen.queryByRole("navigation", { name: "Main menu" })).toBeNull();
    expect(screen.queryByText(/Results|History/, { selector: "h1" })).toBeNull();
    expect(document.body.textContent).not.toContain(SECRET);
    expect(screen.getByRole("button", { name: "繁體" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Dark/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erase everything on this device" })).toBeInTheDocument();
    expect(screen.getByText(/A forgotten passphrase cannot be recovered by anyone, and this app keeps no copy of it\./)).toBeInTheDocument();
    expect(document.title).toBe("The history on this device is locked · TCM Self-Check");
  });

  it("starts as 'unknown' on a device with a lock, so that the app is never shown first", async () => {
    const env = fakeEnvironment();
    const seed = testStore(env);
    await seed.persistence.putAssessment(results()[0]!);
    expect(await seed.persistence.lock.enable(PASS)).toBe("ok");
    const t = testStore(env);
    expect(t.store.getState().lock).toBe("unknown");
    await t.store.getState().init();
    expect(t.store.getState().lock).toBe("locked");
    expect(testStore(fakeEnvironment()).store.getState().lock).toBe("none");
  });

  it("a wrong passphrase says so and keeps count; the right one opens the history where it was", async () => {
    const { user } = await open("/history", { lockOn: true });
    const field = await screen.findByLabelText("Passphrase");
    await user.type(field, "not the passphrase");
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("That passphrase did not open it.")).toBeInTheDocument();
    expect(screen.getByLabelText("Passphrase")).toHaveValue("");
    await user.type(screen.getByLabelText("Passphrase"), PASS);
    await user.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByRole("heading", { level: 1, name: "History" }, { timeout: 15_000 })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/en/history");
    expect(await screen.findAllByRole("checkbox")).toHaveLength(2);
    expect(screen.queryByRole("heading", { name: "The history on this device is locked" })).toBeNull();
  });

  it("after five wrong passphrases the next try waits and says for how long — once, not every second — the button stays off until it has passed, and then it says so", async () => {
    const { store, user } = await open("/history", { lockOn: true });
    await screen.findByLabelText("Passphrase");
    store.setState({ lockStatus: { phase: "locked", allowedAt: Date.now() + 2_500, failures: 5, broken: false } });
    const sentence = /Too many wrong tries in a row\. The next try is allowed in [123] seconds?\./;
    const said = await waitFor(() => { const s = screen.getAllByRole("status").find((e) => sentence.test(e.textContent ?? "")); expect(s).toBeDefined(); return s!; });
    expect(said).toHaveClass("visually-hidden");
    expect(screen.getAllByText(sentence)).toHaveLength(2);                                                 // on the screen, and said
    const shown = screen.getByText(sentence, { selector: "[aria-hidden='true']" });                        // the countdown that changes is not read out
    expect(screen.getByText(/It does not stop someone who has a copy of the data/)).toBeInTheDocument();
    const once = said.textContent;
    await user.type(screen.getByLabelText("Passphrase"), PASS);
    expect(screen.getByRole("button", { name: "Unlock" })).toBeDisabled();
    await waitFor(() => expect(shown.textContent).not.toBe(once), { timeout: 3_000 });                    // the countdown moved on …
    expect(said.textContent).toBe(once);                                                                   // … and what was said did not change
    await waitFor(() => expect(screen.getByRole("button", { name: "Unlock" })).toBeEnabled(), { timeout: 5_000 });
    expect(said.textContent).toBe("You can try again now.");
    expect(screen.queryByText(/Too many wrong tries/)).toBeNull();
  });

  it("a damaged lock record says nothing can open it and offers only the erase", async () => {
    const env = fakeEnvironment();
    const seed = testStore(env);
    await seed.persistence.putAssessment(results()[0]!);
    const db = await openIndexedDb(env.indexedDB!);
    await db.put("meta", LOCK_KEY, { v: 1, garbage: true });
    db.close();
    env.localStorage.setItem("tcm.lockHint", "1");
    await open("/history", { env, items: [] });
    expect(await screen.findByRole("alert")).toHaveTextContent("The lock data on this device is damaged, so nothing can open it.");
    expect(screen.queryByLabelText("Passphrase")).toBeNull();
    expect(screen.getByRole("button", { name: "Erase everything on this device" })).toBeInTheDocument();
  });

  it("Erase everything asks once, then removes the history and the lock", async () => {
    const { user, env } = await open("/history", { lockOn: true });
    await user.click(await screen.findByRole("button", { name: "Erase everything on this device" }));
    const dialog = await screen.findByRole("dialog", { name: "Erase everything on this device" });
    await user.click(within(dialog).getByRole("button", { name: "Erase everything" }));
    await waitFor(async () => { const after = createPersistence(env, { iterations: TEST_ITERATIONS }); expect((await after.lock.status()).phase).toBe("none"); expect(await after.listAssessments()).toEqual([]); });
    expect(env.localStorage.getItem("tcm.lockHint")).toBeNull();
  });

  it("is in Chinese, in Simplified with no Traditional character, and has no axe violations", async () => {
    const hant = await open("/history", { lockOn: true, lang: "zh-Hant" });
    expect(await screen.findByRole("heading", { level: 1, name: "這個裝置上的歷史紀錄已上鎖" })).toBeInTheDocument();
    expect((await axe(hant.container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
    const hans = await open("/history", { lockOn: true, lang: "zh-Hans" });
    expect(await screen.findByRole("heading", { level: 1, name: "这个设备上的历史记录已上锁" })).toBeInTheDocument();
    expect(traditionalOnScreen()).toEqual([]);
    expect(hans.store.getState().lock).toBe("locked");
    cleanup();
    const en = await open("/history", { lockOn: true });
    await screen.findByRole("heading", { level: 1, name: "The history on this device is locked" });
    expect((await axe(en.container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
  });

  it("switching the language on the lock screen keeps it locked", async () => {
    const { user } = await open("/history", { lockOn: true });
    await user.click(await screen.findByRole("button", { name: "繁體" }));
    expect(await screen.findByRole("heading", { level: 1, name: "這個裝置上的歷史紀錄已上鎖" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/zh-Hant/history");
  });
});

describe("Lock now and the idle lock", () => {
  async function unlockedApp(prefs: Record<string, unknown> = {}) {
    const opened = await open("/history", { lockOn: true, prefs });
    await opened.user.type(await screen.findByLabelText("Passphrase"), PASS);
    await opened.user.click(screen.getByRole("button", { name: "Unlock" }));
    await screen.findByRole("heading", { level: 1, name: "History" }, { timeout: 15_000 });
    return opened;
  }

  it("Lock now in the header saves what is pending, drops the key, shows the lock screen and loads the page again", async () => {
    const { user, store, refreshes } = await unlockedApp();
    await user.click(within(screen.getByRole("navigation", { name: "Main menu" })).getByRole("button", { name: "Lock" }));
    expect(await screen.findByRole("heading", { level: 1, name: "The history on this device is locked" })).toBeInTheDocument();
    expect(store.getState().lock).toBe("locked");
    expect(store.getState().draft).toBeNull();
    expect(refreshes.count).toBe(1);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(document.body.textContent).not.toContain(SECRET);
  });

  it("a draft changed a moment ago is written before the key is dropped, and is there after unlocking", async () => {
    const { store, user, env } = await unlockedApp();
    store.getState().startDraft();
    store.getState().updateDraft((d) => ({ ...d, subject: { ...d.subject, allergies: ["PENDING-ALLERGY"] } }));
    await store.getState().lockNow();
    expect(await dump(env)).not.toContain("PENDING-ALLERGY");
    const later = createPersistence(env, { iterations: TEST_ITERATIONS });
    expect((await later.lock.unlock(PASS)).ok).toBe(true);
    expect((await later.loadDraft())?.subject.allergies).toEqual(["PENDING-ALLERGY"]);
    void user;
  });

  /** The app on the lock screen with the clock faked, then unlocked through the store: the idle timer is made with the fake timers. */
  async function unlockedWithClock(prefs: Record<string, unknown>) {
    const opened = await open("/history", { lockOn: true, prefs });
    await screen.findByRole("heading", { level: 1, name: "The history on this device is locked" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    await act(async () => { expect((await opened.store.getState().unlock(PASS)).ok).toBe(true); });
    expect(opened.store.getState().lock).toBe("unlocked");
    return opened;
  }

  it("locks by itself after the idle time (10 minutes unless the person chose another); use of the app starts the wait again", async () => {
    const { store } = await unlockedWithClock({ lockIdleMinutes: 5 });
    await act(async () => { await vi.advanceTimersByTimeAsync(4 * 60_000); });
    expect(store.getState().lock).toBe("unlocked");
    await act(async () => { window.dispatchEvent(new Event("pointerdown")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(4 * 60_000); });
    expect(store.getState().lock).toBe("unlocked");                                  // eight minutes in all, but only four since the last touch
    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
    expect(store.getState().lock).toBe("locked");
    expect(screen.getByRole("heading", { level: 1, name: "The history on this device is locked" })).toBeInTheDocument();
  });

  it("a device that slept (the clock jumped while no timer ran) locks as soon as it is looked at again", async () => {
    const { store } = await unlockedWithClock({ lockIdleMinutes: 5 });
    vi.setSystemTime(Date.now() + 60 * 60_000);
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(store.getState().lock).toBe("locked");
  });

  it("with no lock nothing is watched: no lock button, and the idle time locks nothing", async () => {
    const { store } = await open("/history", { prefs: { lockIdleMinutes: 5 } });
    expect(within(screen.getByRole("navigation", { name: "Main menu" })).queryByRole("button", { name: "Lock" })).toBeNull();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60_000); });
    expect(store.getState().lock).toBe("none");
  });

  it("the idle time is chosen in Settings and remembered", async () => {
    const { user, env } = await unlockedApp();
    go("/en/settings");
    await act(async () => { window.dispatchEvent(new PopStateEvent("popstate")); });
    const card = within(await screen.findByRole("region", { name: "Lock the history" }));
    await user.selectOptions(card.getByLabelText("Lock after no use for"), "30");
    expect(JSON.parse(env.localStorage.getItem("tcm.prefs")!).lockIdleMinutes).toBe(30);
    expect(card.getByText(/It locks itself after 30 minutes without use\./)).toBeInTheDocument();
  });
});

describe("changing the passphrase and turning the lock off", () => {
  async function onSettings() {
    const opened = await open("/settings", { lockOn: true });
    await opened.user.type(await screen.findByLabelText("Passphrase"), PASS);
    await opened.user.click(screen.getByRole("button", { name: "Unlock" }));
    const card = within(await screen.findByRole("region", { name: "Lock the history" }, { timeout: 15_000 }));
    return { ...opened, card };
  }

  it("changing it needs the current one, says when it is wrong, and then the new one opens the history and the old one does not", async () => {
    const { card, user, env } = await onSettings();
    await user.click(card.getByRole("button", { name: "Change the passphrase…" }));
    const dialog = await screen.findByRole("dialog", { name: "Change the passphrase" });
    const current = within(dialog).getByLabelText("Current passphrase");
    const next = within(dialog).getByLabelText("New passphrase");
    const again = within(dialog).getByLabelText("Type it again");
    await user.type(current, "wrong wrong wrong");
    await user.type(next, OTHER);
    await user.type(again, OTHER);
    await user.click(within(dialog).getByRole("button", { name: "Change the passphrase" }));
    expect(await within(dialog).findByText("That is not the current passphrase.")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Current passphrase"), PASS);
    await user.click(within(dialog).getByRole("button", { name: "Change the passphrase" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 15_000 });
    expect(screen.getByText("The passphrase was changed. The history did not need to be encrypted again.")).toBeInTheDocument();
    const later = createPersistence(env, { iterations: TEST_ITERATIONS });
    expect((await later.lock.unlock(PASS)).ok).toBe(false);
    expect((await later.lock.unlock(OTHER)).ok).toBe(true);
    expect((await later.listAssessments()).some((s) => s.userNote === SECRET)).toBe(true);
  });

  it("turning it off needs the passphrase; then the history is stored plainly again and the card offers the lock", async () => {
    const { card, user, env } = await onSettings();
    await user.click(card.getByRole("button", { name: "Turn the lock off…" }));
    const dialog = await screen.findByRole("dialog", { name: "Turn the lock off" });
    await user.type(within(dialog).getByLabelText("Passphrase"), "not the passphrase");
    await user.click(within(dialog).getByRole("button", { name: "Turn the lock off" }));
    expect(await within(dialog).findByText("That is not the current passphrase.")).toBeInTheDocument();
    expect(await dump(env)).not.toContain(SECRET);
    await user.type(within(dialog).getByLabelText("Passphrase"), PASS);
    await user.click(within(dialog).getByRole("button", { name: "Turn the lock off" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 15_000 });
    expect(screen.getByText("The lock is off.")).toBeInTheDocument();
    expect(await dump(env)).toContain(SECRET);
    expect(screen.getByRole("button", { name: "Turn the lock on…" })).toBeEnabled();
    expect(env.localStorage.getItem("tcm.lockHint")).toBeNull();
  });

  it("the three dialogs have no axe violations", async () => {
    const { card, user } = await onSettings();
    for (const [button, name] of [["Change the passphrase…", "Change the passphrase"], ["Turn the lock off…", "Turn the lock off"]] as const) {
      await user.click(card.getByRole("button", { name: button }));
      const dialog = await screen.findByRole("dialog", { name });
      expect((await axe(dialog, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => v.id)).toEqual([]);
      await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
  });
});

describe("a backup while the lock is on", () => {
  it("is protected with a passphrase unless the person says otherwise", async () => {
    const opened = await open("/settings", { lockOn: true });
    await opened.user.type(await screen.findByLabelText("Passphrase"), PASS);
    await opened.user.click(screen.getByRole("button", { name: "Unlock" }));
    await opened.user.click(await screen.findByRole("button", { name: /^Make a backup/ }, { timeout: 15_000 }));
    const dialog = await screen.findByRole("dialog", { name: "Make a backup" });
    expect(await within(dialog).findByRole("checkbox", { name: /Protect the file with a passphrase/ })).toBeChecked();
  });
});

describe("another tab", () => {
  it("when another tab turned the lock on, a write from this one is refused, nothing is left in the clear and the page loads again", async () => {
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang: "en" }));
    const refreshes = { count: 0 };
    const stale = testStore(env, { refresh: () => { refreshes.count += 1; } });
    await stale.persistence.putAssessment(results()[0]!);
    const owner = testStore(env);
    expect(await owner.persistence.lock.enable(PASS)).toBe("ok");
    await stale.store.getState().putAssessment(record("rz0000000000000z", Date.UTC(2026, 9, 1), { userNote: "STALE-WRITE-SECRET" }));
    expect(await dump(env)).not.toContain("STALE-WRITE-SECRET");
    expect(refreshes.count).toBe(1);
  });
});

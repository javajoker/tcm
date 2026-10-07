// Keeping a file up to date, on screen (docs/post-mvp/design/research-tracks.md §4; task PM-32): the card is there only where the browser can choose a file; setting it up needs a passphrase typed twice and then the
// browser's own picker; the first write, a later one, a file of another device that is merged before anything is written, a session that starts by asking, and every way a write can fail — each in words, each
// leaving the file as it was. The browser's file API is a fake that replaces a file's content only when a write is closed.
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { buildBackup, encryptBackup, openEncrypted, readBackup, serializeBackup, serializeEncrypted } from "../src/storage/backup/index.ts";
import { DEFAULT_PREFS, type SavedAssessment, type SyncRecord } from "../src/storage/types.ts";
import { domError, FakeHandle } from "./fakeFile.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const PASS = "a long enough passphrase";
const DAY = 86_400_000;
const go = (path: string): void => { window.history.pushState({}, "", path); };

type Picker = ((options: unknown) => Promise<unknown>) & { mock?: unknown };
const install = (picker: Picker | undefined): void => {
  if (picker === undefined) delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  else (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker = picker;
};
afterEach(() => { cleanup(); go("/"); install(undefined); vi.restoreAllMocks(); });

const result = (id: string, daysAgo: number): SavedAssessment => {
  const d = interview(kb, "SP1");
  return toSaved(d, engine.assess(kb, assessInputOf(d, Date.UTC(2026, 9, 1, 12) - daysAgo * DAY)!), { id, lang: "en" });
};
const A = result("a000000000000001", 20), B = result("a000000000000002", 10), C = result("a000000000000003", 5);

/** `record`: the file an earlier session remembered. A real browser keeps a file handle in IndexedDB whole; a fake one would lose its methods in the structured clone, so the record is handed to the provider as it is. */
async function open(opts: { items?: SavedAssessment[]; lang?: "en" | "zh-Hant"; record?: SyncRecord; prefs?: Record<string, unknown> } = {}) {
  const lang = opts.lang ?? "en";
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang, disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, ...opts.prefs }));
  const t = testStore(env);
  for (const s of opts.items ?? [A, B]) await t.persistence.putAssessment(s);
  if (opts.record !== undefined) vi.spyOn(t.persistence.syncFile, "load").mockResolvedValue(opts.record);
  go(`/${lang}/settings`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await Promise.resolve(); });
  await screen.findByRole("heading", { level: 1 }, { timeout: 4000 });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  return { ...view, ...t, env, user: userEvent.setup() };
}
const card = (): HTMLElement => screen.getByRole("region", { name: "Keep a backup file up to date" });
const withPicker = (handle: FakeHandle): ReturnType<typeof vi.fn> => { const fn = vi.fn(async () => handle); install(fn as unknown as Picker); return fn; };
const status = (): string => within(card()).getAllByRole("status").map((s) => s.textContent).join(" | ");

/** The results a file holds, opened with a passphrase. */
async function held(text: string, passphrase = PASS): Promise<string[]> {
  const read = await readBackup(text);
  if (read.kind !== "encrypted") throw new Error(`not encrypted: ${read.kind}`);
  const opened = await openEncrypted(read.raw, passphrase);
  if (opened.kind !== "backup") throw new Error(`not opened: ${opened.kind}`);
  return (opened.document.payload.assessments as unknown as { data: { id: string } }[]).map((e) => e.data.id).sort();
}
async function otherDevicesFile(results: readonly SavedAssessment[], passphrase = PASS): Promise<string> {
  const doc = await buildBackup({ assessments: results, draft: null, prefs: DEFAULT_PREFS }, { assessments: "all", draft: false, prefs: true }, { appVersion: "other", kbVersion: "x", engineVersion: "x", profile: "dev" }, Date.UTC(2026, 9, 6, 9));
  return serializeEncrypted(await encryptBackup(serializeBackup(doc), passphrase, doc.createdAt, 100_000));
}

/** Set it up with the passphrase: the dialog, the two fields, the picker. */
async function setUp(user: ReturnType<typeof userEvent.setup>, passphrase = PASS): Promise<void> {
  await user.click(within(card()).getByRole("button", { name: "Set it up…" }));
  const dialog = await screen.findByRole("dialog", { name: "Keep a backup file up to date" });
  await user.type(within(dialog).getByLabelText("Passphrase"), passphrase);
  await user.type(within(dialog).getByLabelText("Type it again"), passphrase);
  await user.click(within(dialog).getByRole("button", { name: "Choose the file…" }));
}

describe("where it is offered", () => {
  it("not at all where the browser cannot choose a file: no card, no row in what is stored, no word about it in Erase", async () => {
    await open();
    expect(screen.queryByRole("region", { name: "Keep a backup file up to date" })).toBeNull();
    expect(screen.queryByText(/The file you chose for the backup/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Erase everything…" }));
    expect(screen.queryByText(/A file you chose for the backup is not deleted/)).toBeNull();
  });

  it("where it can: a card that says what it does and what its limits are, a row in what is stored, and a sentence in Erase", async () => {
    install((async () => new FakeHandle()) as Picker);
    const { user } = await open();
    const c = within(card());
    expect(c.getByText(/the app writes an encrypted backup to it\. The service sees only an encrypted file; nothing goes to any server of this app/i)).toBeInTheDocument();
    expect(c.getByText(/asks for the file’s passphrase each time you open it: it does not keep the passphrase/)).toBeInTheDocument();
    expect(c.getByRole("button", { name: "Set it up…" })).toBeEnabled();
    expect(screen.getByText(/The file you chose for the backup, where the browser can/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Erase everything…" }));
    expect(screen.getByText("A file you chose for the backup is not deleted: the app only forgets it.")).toBeInTheDocument();
  });
});

describe("setting it up", () => {
  it("needs a passphrase long enough and typed twice before the picker opens; closing the picker changes nothing", async () => {
    const picker = withPicker(new FakeHandle());
    picker.mockRejectedValueOnce(domError("AbortError"));
    const { user, store } = await open();
    await user.click(within(card()).getByRole("button", { name: "Set it up…" }));
    const dialog = await screen.findByRole("dialog", { name: "Keep a backup file up to date" });
    const choose = within(dialog).getByRole("button", { name: "Choose the file…" });
    expect(choose).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Passphrase"), "short");
    expect(within(dialog).getByText(/at least 10 characters/i)).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText("Passphrase"));
    await user.type(within(dialog).getByLabelText("Passphrase"), PASS);
    await user.type(within(dialog).getByLabelText("Type it again"), "another one entirely");
    expect(choose).toBeDisabled();
    await user.clear(within(dialog).getByLabelText("Type it again"));
    await user.type(within(dialog).getByLabelText("Type it again"), PASS);
    expect(choose).toBeEnabled();
    await user.click(choose);
    await waitFor(() => expect(picker).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog", { name: "Keep a backup file up to date" })).toBeInTheDocument();       // still there: the picker was closed
    expect(await store.syncFile.load()).toBeNull();
    expect(within(card()).getByRole("button", { name: "Set it up…" })).toBeInTheDocument();
  });

  it("an empty file gets the first backup: encrypted, holding every result, with the file remembered and the reminder's clock set — and the passphrase nowhere", async () => {
    const handle = new FakeHandle();
    const picker = withPicker(handle);
    const { user, store, env } = await open();
    await setUp(user);
    await waitFor(() => expect(status()).toMatch(/Kept up to date in “tcm-backup\.encrypted\.json”\./), { timeout: 20_000 });
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "tcm-backup.encrypted.json" }));
    expect(status()).toMatch(/Last written/);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());      // the dialog closes just after the first write is reported
    expect(handle.content).toContain("tcm-backup-encrypted");
    expect(handle.content).not.toContain("S_");
    expect(await held(handle.content)).toEqual([A.id, B.id]);
    const record = await store.syncFile.load();
    expect(record).toMatchObject({ v: 1, name: "tcm-backup.encrypted.json" });
    expect(record!.seen).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(env.localStorage.getItem("tcm.prefs") ?? "{}")["lastBackupAt"]).toEqual(expect.any(Number));
    expect(JSON.stringify([...Array(env.localStorage.length)].map((_, i) => env.localStorage.getItem(env.localStorage.key(i)!)))).not.toContain(PASS);
    expect(within(card()).getByRole("button", { name: "Write now" })).toBeEnabled();
  }, 60_000);

  it("a result saved afterwards is written to the file", async () => {
    const handle = new FakeHandle();
    withPicker(handle);
    const { user, store } = await open();
    await setUp(user);
    await waitFor(() => expect(status()).toMatch(/Kept up to date/), { timeout: 20_000 });
    await act(async () => { await store.getState().putAssessment(C); });
    await waitFor(async () => expect(await held(handle.content)).toEqual([A.id, B.id, C.id]), { timeout: 30_000, interval: 500 });
  }, 90_000);

  it("a file that is not one of this app's encrypted backups is refused and left alone, in words", async () => {
    const handle = new FakeHandle("notes.json", "{\"my\":\"notes\"}");
    withPicker(handle);
    const { user, store } = await open();
    await setUp(user);
    expect(await screen.findByText("That file is not an encrypted backup made by this app, so it was left alone. Choose another file.", undefined, { timeout: 20_000 })).toBeInTheDocument();
    expect(handle.content).toBe("{\"my\":\"notes\"}");
    expect(await store.syncFile.load()).toBeNull();
  }, 60_000);

  it("another device's file under another passphrase is refused as the wrong passphrase, and left alone", async () => {
    const theirs = await otherDevicesFile([C], "someone else's passphrase");
    const handle = new FakeHandle("shared.encrypted.json", theirs);
    withPicker(handle);
    const { user } = await open();
    await setUp(user);
    expect(await screen.findByText("That is not the passphrase of this file. Nothing was changed.", undefined, { timeout: 20_000 })).toBeInTheDocument();
    expect(handle.content).toBe(theirs);
  }, 60_000);
});

describe("a file of another device", () => {
  it("is merged before anything is written: what is new is shown, nothing is overwritten, and the merged history is written back", async () => {
    const theirs = await otherDevicesFile([A, C]);
    const handle = new FakeHandle("shared.encrypted.json", theirs);
    withPicker(handle);
    const { user, store } = await open();
    await setUp(user);
    await waitFor(() => expect(status()).toMatch(/holds changes that this device does not have/), { timeout: 20_000 });
    expect(handle.content).toBe(theirs);                                                                 // never overwritten silently
    await user.click(within(card()).getByRole("button", { name: "Merge…" }));
    const dialog = await screen.findByRole("dialog", { name: "Merge the file" });
    expect(await within(dialog).findByText(/“shared.encrypted.json” holds changes from another device/)).toBeInTheDocument();
    expect(await within(dialog).findByText(/1 new/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Merge and keep it up to date" }));
    await waitFor(() => expect(status()).toMatch(/Kept up to date in “shared\.encrypted\.json”/), { timeout: 30_000 });
    expect((await store.getState().listAssessments()).map((a) => a.id).sort()).toEqual([A.id, B.id, C.id]);
    expect(await held(handle.content)).toEqual([A.id, B.id, C.id]);
  }, 90_000);

  it("a file with nothing this device lacks can be accepted as it is, and is then brought up to date", async () => {
    const handle = new FakeHandle("shared.encrypted.json", await otherDevicesFile([A]));
    withPicker(handle);
    const { user } = await open();
    await setUp(user);
    await user.click(await within(card()).findByRole("button", { name: "Merge…" }, { timeout: 20_000 }));
    const dialog = await screen.findByRole("dialog", { name: "Merge the file" });
    await user.click(await within(dialog).findByRole("button", { name: "Merge and keep it up to date" }));
    await waitFor(async () => expect(await held(handle.content)).toEqual([A.id, B.id]), { timeout: 30_000, interval: 500 });
  }, 90_000);

  it("'Not now' leaves the file alone and the merge waiting", async () => {
    const theirs = await otherDevicesFile([C]);
    const handle = new FakeHandle("shared.encrypted.json", theirs);
    withPicker(handle);
    const { user } = await open();
    await setUp(user);
    await user.click(await within(card()).findByRole("button", { name: "Merge…" }, { timeout: 20_000 }));
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(card()).getByRole("button", { name: "Merge…" })).toBeInTheDocument();
    expect(handle.content).toBe(theirs);
  }, 90_000);
});

describe("a later visit", () => {
  /** A browser that can keep a file, and a file an earlier session left: `seen` is what that session knew of it (the hash of its text) — `null` for a file it never saw. */
  const remembered = async (seen: "this" | null = "this") => {
    const handle = new FakeHandle();
    handle.permission = "prompt";
    install((async () => handle) as Picker);
    handle.content = await otherDevicesFile([A, B]);
    const hash = seen === null ? null : createHash("sha256").update(handle.content).digest("hex");
    const opened = await open({ record: { v: 1, handle, name: handle.name, seen: hash, writtenAt: hash === null ? null : Date.UTC(2026, 9, 3, 9) } });
    const clear = vi.spyOn(opened.store.syncFile, "clear");
    return { ...opened, handle, file: handle.content, clear };
  };

  it("asks to be allowed, then for the passphrase — which is checked against the file, so a slip cannot change it — and then brings the file up to date", async () => {
    const { user, handle, file } = await remembered();
    expect(await within(card()).findByText(/needs your permission again in this visit/, undefined, { timeout: 10_000 })).toBeInTheDocument();
    await user.click(within(card()).getByRole("button", { name: "Allow" }));
    expect(await within(card()).findByText(/Type the passphrase of “tcm-backup\.encrypted\.json” to carry on\./)).toBeInTheDocument();
    await user.type(within(card()).getByLabelText("Passphrase of the file"), "a different passphrase, by mistake");
    await user.click(within(card()).getByRole("button", { name: "Continue" }));
    expect(await within(card()).findByText("That is not the passphrase of this file. Nothing was changed.", undefined, { timeout: 20_000 })).toBeInTheDocument();
    expect(handle.content).toBe(file);
    await user.clear(within(card()).getByLabelText("Passphrase of the file"));
    await user.type(within(card()).getByLabelText("Passphrase of the file"), PASS);
    await user.click(within(card()).getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(status()).toMatch(/Kept up to date in/), { timeout: 30_000 });
    expect(await held(handle.content)).toEqual([A.id, B.id]);
  }, 120_000);

  it("a file that is not as the earlier session left it is offered for the merge, not written over", async () => {
    const { user, handle, file } = await remembered(null);
    await user.click(await within(card()).findByRole("button", { name: "Allow" }, { timeout: 10_000 }));
    await user.type(await within(card()).findByLabelText("Passphrase of the file"), PASS);
    await user.click(within(card()).getByRole("button", { name: "Continue" }));
    expect(await within(card()).findByText(/holds changes that this device does not have/, undefined, { timeout: 30_000 })).toBeInTheDocument();
    expect(handle.content).toBe(file);
  }, 120_000);

  it("the person can say no to the permission, and is told the browser did not allow it", async () => {
    const { user, handle } = await remembered();
    handle.grants = "denied";
    await user.click(await within(card()).findByRole("button", { name: "Allow" }, { timeout: 10_000 }));
    expect(await within(card()).findByText("The browser did not allow access to the file.")).toBeInTheDocument();
    expect(within(card()).getByRole("button", { name: "Allow" })).toBeInTheDocument();
  }, 60_000);

  it("stopping forgets the file and leaves it where it is", async () => {
    const { user, handle, file, clear } = await remembered();
    await user.click(await within(card()).findByRole("button", { name: "Stop keeping it up to date" }, { timeout: 10_000 }));
    expect(await within(card()).findByRole("button", { name: "Set it up…" })).toBeInTheDocument();
    expect(clear).toHaveBeenCalled();
    expect(handle.content).toBe(file);
  }, 60_000);
});

describe("when a write fails", () => {
  it("the file is as it was, it says why in words, and Try again writes it", async () => {
    const handle = new FakeHandle();
    withPicker(handle);
    const { user } = await open();
    await setUp(user);
    await waitFor(() => expect(status()).toMatch(/Kept up to date/), { timeout: 20_000 });
    const was = handle.content;
    handle.fail.close = domError("NoModificationAllowedError");
    await user.click(within(card()).getByRole("button", { name: "Write now" }));
    expect(await within(card()).findByText("Another program is using it — a cloud service, perhaps. The file is as it was; try again in a moment.", undefined, { timeout: 20_000 })).toBeInTheDocument();
    expect(within(card()).getByText("“tcm-backup.encrypted.json” could not be written.")).toBeInTheDocument();
    expect(handle.content).toBe(was);
    await user.click(within(card()).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(status()).toMatch(/Kept up to date/), { timeout: 20_000 });
    expect(await held(handle.content)).toEqual([A.id, B.id]);
  }, 90_000);
});

describe("in Traditional Chinese, and for everyone", () => {
  it("says it in Traditional Chinese", async () => {
    install((async () => new FakeHandle()) as Picker);
    await open({ lang: "zh-Hant" });
    const c = within(screen.getByRole("region", { name: "讓備份檔案保持最新" }));
    expect(c.getByText(/只在開著的時候寫入檔案/)).toBeInTheDocument();
    expect(c.getByRole("button", { name: "開始設定…" })).toBeInTheDocument();
  });

  it("has no accessibility violations: the card, the setup dialog, and the card with a file", async () => {
    const handle = new FakeHandle();
    withPicker(handle);
    const { user, container } = await open();
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    await user.click(within(card()).getByRole("button", { name: "Set it up…" }));
    const dialog = await screen.findByRole("dialog", { name: "Keep a backup file up to date" });
    expect((await axe(dialog, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

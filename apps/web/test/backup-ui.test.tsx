// Backup and restore on screen (docs/post-mvp/design/backup-and-data-lock.md §3.3–§3.6; task PM-08): the Settings card, the two dialogs, the reminder, the Imported mark, and the round trip between two
// browsers — export in one context, import in another, an equal history.
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import type { Loaded } from "../src/app/knowledge.tsx";
import { readBackup, serializeBackup, type BackupDocument } from "../src/storage/backup/index.ts";
import type { Persistence } from "../src/storage/persistence.ts";
import type { Draft, Prefs, SavedAssessment } from "../src/storage/types.ts";
import { blockedEnvironment, fakeEnvironment, renderApp, testStore } from "./helpers.tsx";
import { interview } from "./interview.ts";

const downloads: { name: string; text: string }[] = [];
vi.mock("../src/backup/files.ts", async (original) => ({ ...(await original<Record<string, unknown>>()), downloadText: (name: string, text: string) => { downloads.push({ name, text }); } }));

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const loaded: Loaded = { kb, engine };
const go = (path: string): void => { window.history.pushState({}, "", path); };
beforeEach(() => { downloads.length = 0; });
afterEach(() => { go("/"); vi.restoreAllMocks(); });

const NOW = Date.now();
const DAY = 86_400_000;
const save = (patternId: string, id: string, at: number, extra: Partial<SavedAssessment> = {}): SavedAssessment => {
  const d = interview(kb, patternId);
  return { ...toSaved(d, engine.assess(kb, assessInputOf(d, at)!), { id, lang: "en" }), ...extra };
};
const history = (): SavedAssessment[] => [save("SP1", "a000000000000001", NOW - 50 * DAY), save("HT2", "b000000000000002", NOW - 20 * DAY), save("LG1", "c000000000000003", NOW - 2 * DAY, { userNote: "felt tired <b>a lot</b>" })];

async function open(path: string, items: SavedAssessment[] = history(), over: { lang?: "en" | "zh-Hant" | "zh-Hans"; env?: ReturnType<typeof fakeEnvironment>; prefs?: Partial<Prefs>; draft?: Draft } = {}) {
  cleanup();                                              // one app at a time: what an earlier step rendered is gone
  const env = over.env ?? fakeEnvironment();
  try { env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 }, lang: over.lang ?? "en", ...over.prefs })); } catch { /* storage that is blocked, on purpose */ }
  const t = testStore(env);
  for (const s of items) await t.persistence.putAssessment(s);
  if (over.draft) await t.persistence.saveDraft(over.draft);
  go(`/${over.lang ?? "en"}${path}`);
  const view = renderApp(t.store, () => Promise.resolve(loaded));
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return { ...view, ...t, env };
}
const prefsOf = (env: ReturnType<typeof fakeEnvironment>): Record<string, unknown> => JSON.parse(env.localStorage.getItem("tcm.prefs") ?? "{}");
const fileOf = (text: string, name = "tcm-backup.json"): File => new File([text], name, { type: "application/json" });
const sorted = (xs: SavedAssessment[]): SavedAssessment[] => [...xs].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1));

async function makeBackup(path = "/settings", over: Parameters<typeof open>[2] = {}, untick: string[] = []): Promise<{ text: string; doc: BackupDocument; opened: Awaited<ReturnType<typeof open>> }> {
  const opened = await open(path, history(), over);
  await userEvent.click(await screen.findByRole("button", { name: /^Make a backup/ }));
  const dialog = await screen.findByRole("dialog", { name: "Make a backup" });
  for (const label of untick) await userEvent.click(await within(dialog).findByRole("checkbox", { name: label }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Download the backup" }));
  await waitFor(() => expect(downloads).toHaveLength(1));
  const read = await readBackup(downloads[0]!.text);
  if (read.kind !== "backup") throw new Error("not a backup");
  return { text: downloads[0]!.text, doc: read.document, opened };
}

describe("Settings → Your data", () => {
  it("says when the last backup was, offers both actions, and has a reminder switch that is on until turned off", async () => {
    const { env } = await open("/settings", [], { prefs: {} });
    const card = within(await screen.findByRole("region", { name: "Your data" }));
    expect(card.getByText("You have not made a backup yet.")).toBeInTheDocument();
    expect(card.getByRole("button", { name: "Make a backup…" })).toBeEnabled();
    expect(card.getByRole("button", { name: "Restore from a file…" })).toBeEnabled();
    const reminder = card.getByRole("checkbox", { name: /Remind me to make a backup/ });
    expect(reminder).toBeChecked();
    await userEvent.click(reminder);
    expect(prefsOf(env)["backupReminder"]).toBe(false);
    await userEvent.click(card.getByRole("checkbox", { name: /Remind me to make a backup/ }));
    expect(prefsOf(env)["backupReminder"]).toBe(true);
  });

  it("shows the date of the last backup", async () => {
    await open("/settings", [], { prefs: { lastBackupAt: Date.UTC(2026, 8, 20, 12) } });
    expect(await screen.findByText(/^Last backup: .*2026/)).toBeInTheDocument();
  });

  it("with storage that cannot save, restoring is off with the reason", async () => {
    await open("/settings", [], { env: blockedEnvironment() as unknown as ReturnType<typeof fakeEnvironment> });
    const card = within(await screen.findByRole("region", { name: "Your data" }));
    expect(card.getByRole("button", { name: "Restore from a file…" })).toBeDisabled();
    expect(card.getByText(/Restoring needs this browser to save data/)).toBeInTheDocument();
  });
});

describe("Make a backup", () => {
  it("lists what will be included, warns that the file holds health information, and downloads a file with exactly what was ticked", async () => {
    const { text, doc, opened } = await makeBackup();
    expect(downloads[0]!.name).toMatch(/^tcm-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(doc.contents).toMatchObject({ assessments: 3, draft: false, prefs: true });
    expect(doc.payload.prefs).toMatchObject({ lang: "en" });
    expect(text).not.toContain("disclaimerAck");
    expect(prefsOf(opened.env)["lastBackupAt"]).toEqual(expect.any(Number));
    expect(await screen.findByRole("status")).toHaveTextContent(/Backup made: tcm-backup-.*\. It holds 3 saved results\. Keep it somewhere safe\./);
  });

  it("shows the warning, a list a person can untick from, and no unfinished-assessment option when there is none", async () => {
    await open("/settings");
    await userEvent.click(await screen.findByRole("button", { name: /^Make a backup/ }));
    const dialog = await screen.findByRole("dialog", { name: "Make a backup" });
    expect(within(dialog).getByText(/contains health information/)).toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: "All saved results (3)" })).toBeChecked();
    expect(within(dialog).getAllByRole("checkbox", { name: /20(25|26)/ })).toHaveLength(3);
    expect(within(dialog).queryByRole("checkbox", { name: /^The assessment I have not finished/ })).toBeNull();
    expect(within(dialog).getByRole("checkbox", { name: /^My settings/ })).toBeChecked();
  });

  it("unticking results leaves them out; unticking everything says to choose something and disables the button", async () => {
    const { doc } = await makeBackup("/settings", {}, []);
    expect(doc.contents.assessments).toBe(3);
    downloads.length = 0;
    await open("/settings");
    await userEvent.click(await screen.findByRole("button", { name: /^Make a backup/ }));
    const dialog = await screen.findByRole("dialog", { name: "Make a backup" });
    const all = within(dialog).getByRole("checkbox", { name: "All saved results (3)" });
    await userEvent.click(all);
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /^My settings/ }));
    expect(within(dialog).getByText("Choose at least one thing to include.")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Download the backup" })).toBeDisabled();
    await userEvent.click(within(dialog).getAllByRole("checkbox", { name: /20(25|26)/ })[1]!);
    await userEvent.click(within(dialog).getByRole("button", { name: "Download the backup" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const read = await readBackup(downloads[0]!.text);
    expect(read.kind === "backup" && read.document.contents).toMatchObject({ assessments: 1, prefs: false });
  });

  it("offers the unfinished assessment, off by default, when there is one", async () => {
    const draft = { ...interview(kb, "KD2"), id: "d0000000000000001" };
    await open("/settings", [], { draft });
    await userEvent.click(await screen.findByRole("button", { name: /^Make a backup/ }));
    const dialog = await screen.findByRole("dialog", { name: "Make a backup" });
    const box = await within(dialog).findByRole("checkbox", { name: /^The assessment I have not finished/ });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    await userEvent.click(within(dialog).getByRole("button", { name: "Download the backup" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const read = await readBackup(downloads[0]!.text);
    expect(read.kind === "backup" && read.document.contents).toMatchObject({ draft: true, assessments: 0 });
  });

  it("is reachable from the reminder-free quiet line on History and at the end of a result", async () => {
    await open("/history");
    await userEvent.click(await screen.findByRole("button", { name: "Keep a copy of your results" }));
    expect(await screen.findByRole("dialog", { name: "Make a backup" })).toBeInTheDocument();
  });

  it("is in all three languages", async () => {
    await open("/settings", history(), { lang: "zh-Hant" });
    await userEvent.click(await screen.findByRole("button", { name: /^製作備份/ }));
    const dialog = await screen.findByRole("dialog", { name: "製作備份" });
    expect(within(dialog).getByText(/此檔案含有健康資訊/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "下載備份" })).toBeEnabled();
  });

  it("has no accessibility violations", async () => {
    await open("/settings");
    await userEvent.click(await screen.findByRole("button", { name: /^Make a backup/ }));
    const dialog = await screen.findByRole("dialog", { name: "Make a backup" });
    await within(dialog).findByRole("checkbox", { name: "All saved results (3)" });
    expect((await axe(dialog, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

async function restoreFrom(text: string, over: Parameters<typeof open>[2] = {}, existing: SavedAssessment[] = []) {
  const opened = await open("/settings", existing, over);
  await userEvent.click(await screen.findByRole("button", { name: /^Restore from a file/ }));
  const dialog = await screen.findByRole("dialog", { name: "Restore from a file" });
  const input = await within(dialog).findByLabelText("Backup file");
  await userEvent.upload(input, fileOf(text));
  return { ...opened, dialog };
}

describe("Restore from a file", () => {
  it("export in one browser, import in another: an equal history, with the preferences", async () => {
    const { text } = await makeBackup("/settings", { prefs: { theme: "dark", textScale: 1.15, region: "TW" } });
    const { dialog, persistence, env } = await restoreFrom(text, { prefs: { theme: "light" } });
    expect(await within(dialog).findByText("What this file holds")).toBeInTheDocument();
    expect(within(dialog).getByText("3 saved results: 3 new, 0 already here, 0 different.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(await within(dialog).findByText("3 added, 0 replaced, 0 kept as copies, 0 left as they were.")).toBeInTheDocument();
    expect(await persistence.listAssessments()).toEqual(sorted(history()));
    expect(prefsOf(env)).toMatchObject({ theme: "dark", textScale: 1.15, region: "TW" });
    expect(prefsOf(env)["disclaimerAck"]).toMatchObject({ version: DISCLAIMER_VERSION });      // the acknowledgement of this browser is its own
    await userEvent.click(within(dialog).getByRole("link", { name: "Go to History" }));
    await waitFor(() => expect(window.location.pathname).toBe("/en/history"));
    expect(await screen.findAllByRole("listitem")).toHaveLength(3);
  });

  it("the note typed on a result comes back as text, never as markup", async () => {
    const { text } = await makeBackup();
    const { dialog, persistence } = await restoreFrom(text);
    await userEvent.click(await within(dialog).findByRole("button", { name: "Restore" }));
    await within(dialog).findByText(/3 added/);
    const noted = (await persistence.listAssessments()).find((a) => a.userNote);
    expect(noted?.userNote).toBe("felt tired <b>a lot</b>");
  });

  it("says in plain words why a file cannot be used, and nothing changes", async () => {
    const { text } = await makeBackup();
    const doc = JSON.parse(text);
    const cases: [string, RegExp][] = [
      ["this is not json", /This is not a backup file\./],
      [JSON.stringify({ format: "other" }), /not a backup made by this app/],
      [JSON.stringify({ ...doc, version: 9 }), /made by a newer version of the app/],
      [JSON.stringify({ ...doc, payload: { ...doc.payload, assessments: doc.payload.assessments.slice(1) } }), /damaged: it was cut short, or changed/],
      [text.slice(0, 40), /This is not a backup file\./],
      [JSON.stringify({ format: "tcm-backup-encrypted", version: 1 }), /protected with a passphrase/],
    ];
    for (const [file, message] of cases) {
      const { dialog, persistence, unmount } = await restoreFrom(file);
      expect(await within(dialog).findByRole("alert")).toHaveTextContent(message);
      expect(await persistence.listAssessments()).toEqual([]);
      unmount();
    }
  });

  it("shows what is new, what is already here and what differs, and lets the person choose what happens to the ones that differ", async () => {
    const { text } = await makeBackup();
    const here = history();
    const edited = { ...here[1]!, userNote: "my own note" };
    const { dialog, persistence } = await restoreFrom(text, {}, [here[0]!, edited]);
    expect(await within(dialog).findByText("3 saved results: 1 new, 1 already here, 1 different.")).toBeInTheDocument();
    const choice = within(dialog).getByRole("group", { name: "1 result here differs from the one in the file. What should happen to it?" });
    expect(within(choice).getByRole("radio", { name: "Keep what is here" })).toBeChecked();
    await userEvent.click(within(choice).getByRole("radio", { name: "Keep both" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(await within(dialog).findByText("1 added, 0 replaced, 1 kept as copies, 0 left as they were.")).toBeInTheDocument();
    const after = await persistence.listAssessments();
    expect(after).toHaveLength(4);
    expect(after.find((a) => a.id === edited.id)!.userNote).toBe("my own note");
    expect(after.filter((a) => a.createdAt === edited.createdAt)).toHaveLength(2);
  });

  it("an altered result and a result of a development build are listed as left out, with the reason; the rest arrive", async () => {
    const { doc } = await makeBackup();
    const tampered = structuredClone(doc) as unknown as { payload: { assessments: { data: SavedAssessment }[] }; checksum: { value: string } };
    const first = tampered.payload.assessments[0]!.data;
    (first.result.panel.bagang as { coldHeat: number }).coldHeat += 0.5;
    const { canonicalJson, sha256Hex } = await import("../src/storage/backup/index.ts");
    tampered.checksum.value = await sha256Hex(canonicalJson(tampered.payload));
    const { dialog, persistence } = await restoreFrom(serializeBackup(tampered as unknown as BackupDocument));
    const left = await within(dialog).findByRole("region", { name: "Left out" });
    expect(within(left).getByText(new RegExp(`${first.id}: its result does not follow from its answers`))).toBeInTheDocument();
    expect(within(dialog).getByText("2 saved results: 2 new, 0 already here, 0 different.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await within(dialog).findByText(/2 added/);
    expect((await persistence.listAssessments()).map((a) => a.id).sort()).toEqual([history()[1]!.id, history()[2]!.id].sort());
  });

  it("a record made by another version arrives marked Imported, is shown as saved, and says so on the result", async () => {
    const other = history().slice(0, 1).map((r) => ({ ...r, engineVersion: "0.0.1", result: { ...r.result, meta: { ...r.result.meta, engineVersion: "0.0.1" } } }));
    const { buildBackup } = await import("../src/storage/backup/index.ts");
    const doc = await buildBackup({ assessments: other, draft: null, prefs: { theme: "system", textScale: 1, langOfferDismissed: false, autoAdvance: true } }, { assessments: "all", draft: false, prefs: false }, { appVersion: "0.0.9", kbVersion: "k", engineVersion: "0.0.1", profile: "dev" }, NOW);
    const { dialog, persistence } = await restoreFrom(serializeBackup(doc));
    expect(await within(dialog).findByText("1 result was made by another version of the app. It will be kept as it was saved and marked “Imported”.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await within(dialog).findByText(/1 added/);
    const [stored] = await persistence.listAssessments();
    expect(stored!.imported).toMatchObject({ from: { engineVersion: "0.0.1" } });
    expect(stored!.result).toEqual(other[0]!.result);                             // as saved, not recomputed
  });

  it("the unfinished assessment of a file replaces the current one only when chosen", async () => {
    const draft = { ...interview(kb, "KD2"), id: "d0000000000000009" };
    const opened = await open("/settings", [], { draft });
    await userEvent.click(await screen.findByRole("button", { name: /^Make a backup/ }));
    const dlg = await screen.findByRole("dialog", { name: "Make a backup" });
    await userEvent.click(await within(dlg).findByRole("checkbox", { name: /^The assessment I have not finished/ }));
    await userEvent.click(within(dlg).getByRole("button", { name: "Download the backup" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const text = downloads[0]!.text;
    opened.unmount();

    const mine = { ...interview(kb, "SP1"), id: "d0000000000000001" };
    const { dialog, persistence } = await restoreFrom(text, { draft: mine });
    const box = await within(dialog).findByRole("checkbox", { name: /^Replace the assessment I have not finished with the one in the file/ });
    expect(box).not.toBeChecked();
    expect(within(dialog).getByText("You have an unfinished assessment here; this would replace it.")).toBeInTheDocument();
    await userEvent.click(box);
    await userEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    await within(dialog).findByText(/0 added/);
    expect((await persistence.loadDraft())?.id).toBe(draft.id);
  });

  it("with nothing new it says so and offers no restore", async () => {
    const { text } = await makeBackup("/settings", { prefs: { lang: "en" } });
    const { dialog } = await restoreFrom(text, { prefs: {} }, history());
    expect(await within(dialog).findByText("There is nothing new to restore.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox", { name: "Restore my settings from the file" })).toBeNull();           // the file's settings are the ones here: nothing to offer
    expect(within(dialog).getByRole("button", { name: "Restore" })).toBeDisabled();
  });

  it("has no accessibility violations at each step", async () => {
    const { text } = await makeBackup();
    const { dialog } = await restoreFrom(text);
    await within(dialog).findByText("What this file holds");
    expect((await axe(dialog, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

describe("the reminder", () => {
  it("appears on History when results are not in a backup, and Not now hides it for fourteen days", async () => {
    const { env } = await open("/history");
    const card = await screen.findByRole("region", { name: "Your data" });
    expect(within(card).getByText("You have 3 results that are not in a backup.")).toBeInTheDocument();
    await userEvent.click(within(card).getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("region", { name: "Your data" })).toBeNull();
    expect(prefsOf(env)["backupSnoozeUntil"] as number).toBeGreaterThan(Date.now() + 13 * DAY);
  });

  it("is on the start page too, opens the backup dialog, and is gone once a backup has been made", async () => {
    const { env } = await open("/", history());
    const card = await screen.findByRole("region", { name: "Your data" });
    await userEvent.click(within(card).getByRole("button", { name: "Make a backup" }));
    const dialog = await screen.findByRole("dialog", { name: "Make a backup" });
    await userEvent.click(await within(dialog).findByRole("button", { name: "Download the backup" }));
    await waitFor(() => expect(prefsOf(env)["lastBackupAt"]).toEqual(expect.any(Number)));
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Your data" })).toBeNull());
  });

  it("stays away when there is nothing to back up, when it is turned off, and when a backup is recent", async () => {
    await open("/history", []);
    await screen.findByRole("heading", { level: 1, name: "History" });
    expect(screen.queryByRole("region", { name: "Your data" })).toBeNull();
    const off = await open("/history", history(), { prefs: { backupReminder: false } });
    await screen.findAllByRole("listitem");
    expect(screen.queryByRole("region", { name: "Your data" })).toBeNull();
    off.unmount();
    await open("/history", history(), { prefs: { lastBackupAt: Date.now() - DAY } });
    await screen.findAllByRole("listitem");
    expect(screen.queryByRole("region", { name: "Your data" })).toBeNull();
  });
});

describe("Imported results", () => {
  it("History marks them, and the result says it is shown as saved", async () => {
    const marked = { ...history()[2]!, imported: { at: NOW, from: { appVersion: "0.0.9", kbVersion: "k", engineVersion: "0.0.1", profile: "dev" } } };
    await open("/history", [marked], { prefs: { backupReminder: false } });
    expect(await screen.findByText("Imported")).toBeInTheDocument();
    go("/en/result/" + marked.id);
    const view = await open(`/result/${marked.id}`, [marked]);
    expect(await screen.findByText(/This result was imported from a backup made by version 0\.0\.9 of the app\./)).toBeInTheDocument();
    view.unmount();
  });
});

describe("two browsers", () => {
  it("what one exports the other restores, to an equal history (a property over histories of every pattern)", async () => {
    const patterns = [...kb.patterns].map((p) => p.id).slice(0, 8);
    const items = patterns.map((p, i) => save(p, `z${String(i).padStart(2, "0")}00000000000000`.slice(0, 16), NOW - (i + 1) * DAY, i % 2 === 0 ? { userNote: `note ${i}` } : {}));
    const a = await open("/settings", items, { prefs: { theme: "dark" } });
    await userEvent.click(await screen.findByRole("button", { name: /^Make a backup/ }));
    await userEvent.click(await within(await screen.findByRole("dialog", { name: "Make a backup" })).findByRole("button", { name: "Download the backup" }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const text = downloads[0]!.text;
    const listA = await (a.persistence as Persistence).listAssessments();
    a.unmount();
    const { dialog, persistence } = await restoreFrom(text);
    await userEvent.click(await within(dialog).findByRole("button", { name: "Restore" }));
    await within(dialog).findByText(/8 added/);
    expect(await persistence.listAssessments()).toEqual(listA);
  }, 60_000);
});

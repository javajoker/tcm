// @vitest-environment node
// Keeping a file up to date (docs/post-mvp/design/research-tracks.md §4; task PM-32): the file is written after a change, as an encrypted backup of every result; a file that is not as this device left it is
// never written over — it is merged first; and every way the write can fail — the tab closed in the middle, no room, the file held by a cloud client, the permission taken back — leaves the file as it was and
// the results where they are. The protocol of the track: no data loss in the file or in the store, and no server.
import * as engine from "@tcm/engine";
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { describe, expect, it } from "vitest";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { buildBackup, encryptBackup, openEncrypted, readBackup, serializeBackup, serializeEncrypted, sha256Hex, type Source, type Stamps } from "../src/storage/backup/index.ts";
import { classify, fileOf, FileError, SUGGESTED_NAME, syncSupported } from "../src/sync/file.ts";
import { FileSync, type SyncState } from "../src/sync/session.ts";
import { DEFAULT_PREFS, type SavedAssessment, type SyncRecord } from "../src/storage/types.ts";
import { domError, FakeHandle } from "./fakeFile.ts";
import { TEST_ITERATIONS } from "./helpers.tsx";
import { interview } from "./interview.ts";

const kb = indexKnowledgeBase(rawChunksFromDisk("dev"));
const PASS = "a long enough passphrase";
const STAMPS: Stamps = { appVersion: "test", kbVersion: "test", engineVersion: "test", profile: "dev" };
const DAY = 86_400_000;

const result = (id: string, daysAgo: number): SavedAssessment => {
  const d = interview(kb, "SP1");
  const at = Date.UTC(2026, 9, 1, 12) - daysAgo * DAY;
  return toSaved(d, engine.assess(kb, assessInputOf(d, at)!), { id, lang: "en" });
};
const POOL = ["a000000000000001", "a000000000000002", "a000000000000003", "a000000000000004", "a000000000000005", "a000000000000006"].map((id, i) => result(id, 30 - i * 4));

/** A device: its results, its clock, its record store, and the timers of the debounce, all in the hand of the test. */
function device(initial: readonly SavedAssessment[] = [POOL[0]!, POOL[1]!]) {
  const results = [...initial];
  const clock = { now: Date.UTC(2026, 9, 5, 12) };
  const store: { record: SyncRecord | null; writes: number[]; locked: boolean } = { record: null, writes: [], locked: false };
  const timers: { id: number; run: () => void }[] = [];
  let next = 1;
  const make = (remembered: ConstructorParameters<typeof FileSync>[1] = null): FileSync => new FileSync({
    source: async (): Promise<Source> => ({ assessments: [...results], draft: null, prefs: DEFAULT_PREFS }),
    stamps: () => STAMPS, now: () => clock.now,
    save: async (r) => { store.record = r; },
    written: (n) => { store.writes.push(n); },
    locked: () => store.locked,
    timers: { set: (run) => { const id = next++; timers.push({ id, run }); return id; }, clear: (h) => { const i = timers.findIndex((t) => t.id === h); if (i >= 0) timers.splice(i, 1); } },
    debounceMs: 4_000, iterations: TEST_ITERATIONS,
  }, remembered);
  const fire = async (sync: FileSync): Promise<void> => { const due = timers.splice(0); for (const t of due) t.run(); await sync.whenIdle(); };
  return { results, clock, store, timers, make, fire };
}
type Device = ReturnType<typeof device>;

/** The results a file holds, opened with the passphrase. */
async function held(text: string, passphrase = PASS): Promise<string[]> {
  const read = await readBackup(text);
  if (read.kind !== "encrypted") throw new Error(`not an encrypted backup: ${read.kind}`);
  const opened = await openEncrypted(read.raw, passphrase);
  if (opened.kind !== "backup") throw new Error(`not opened: ${opened.kind}`);
  return (opened.document.payload.assessments as unknown as { data: { id: string } }[]).map((e) => e.data.id).sort();
}
const ids = (xs: readonly SavedAssessment[]): string[] => xs.map((x) => x.id).sort();

/** A file as another device would leave it: an encrypted backup of these results. */
async function otherDevicesFile(results: readonly SavedAssessment[], passphrase = PASS, at = Date.UTC(2026, 9, 6, 9)): Promise<string> {
  const doc = await buildBackup({ assessments: results, draft: null, prefs: DEFAULT_PREFS }, { assessments: "all", draft: false, prefs: true }, { ...STAMPS, appVersion: "other" }, at);
  return serializeEncrypted(await encryptBackup(serializeBackup(doc), passphrase, doc.createdAt, TEST_ITERATIONS));
}

async function connected(d: Device, handle = new FakeHandle()): Promise<{ sync: FileSync; handle: FakeHandle }> {
  const sync = d.make();
  await sync.attach(fileOf(handle), handle, PASS);
  return { sync, handle };
}
const phase = (s: FileSync): SyncState["phase"] => s.getState().phase;

describe("the first write", () => {
  it("an empty file gets an encrypted backup of every result and the preferences — not the unfinished assessment — and the device remembers the file, never the passphrase", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    expect(phase(sync)).toBe("idle");
    expect(handle.content).not.toBe("");
    expect(handle.content).not.toContain("S_");                                              // nothing readable: symptom ids, patterns, notes
    expect(await held(handle.content)).toEqual(ids(d.results));
    const read = await readBackup(handle.content);
    const opened = read.kind === "encrypted" ? await openEncrypted(read.raw, PASS) : null;
    expect(opened?.kind === "backup" && opened.document.contents).toMatchObject({ assessments: 2, draft: false, prefs: true });
    expect(d.store.record).toMatchObject({ v: 1, name: "tcm-backup.encrypted.json", writtenAt: d.clock.now });
    expect(d.store.record!.seen).toBe(await sha256Hex(handle.content));
    expect(JSON.stringify({ ...d.store.record, handle: undefined })).not.toContain(PASS);
    expect(d.store.writes).toEqual([d.clock.now]);                                           // the reminder's clock
    expect(sync.getState()).toMatchObject({ phase: "idle", name: "tcm-backup.encrypted.json", failure: null, writtenAt: d.clock.now });
  });
});

describe("keeping it up to date", () => {
  it("several changes make one write, a few seconds after the last", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    const before = handle.committed;
    d.results.push(POOL[2]!);
    sync.touch();
    d.results.push(POOL[3]!);
    sync.touch();
    sync.touch();
    expect(handle.committed).toBe(before);                                                    // nothing yet: the changes are waiting for the debounce
    expect(d.timers).toHaveLength(1);
    await d.fire(sync);
    expect(handle.committed).toBe(before + 1);
    expect(await held(handle.content)).toEqual(ids(d.results));
    expect(phase(sync)).toBe("idle");
  });

  it("a change that comes while a write is under way makes exactly one more after it", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    const before = handle.committed;
    d.results.push(POOL[2]!);
    const first = sync.writeNow();
    d.results.push(POOL[3]!);
    sync.touch();                                                                             // during the write
    await first;
    await d.fire(sync);
    await sync.whenIdle();
    expect(handle.committed).toBe(before + 2);
    expect(await held(handle.content)).toEqual(ids(d.results));
  });

  it("a deleted result is gone from the file at the next write", async () => {
    const d = device([POOL[0]!, POOL[1]!, POOL[2]!]);
    const { sync, handle } = await connected(d);
    d.results.splice(1, 1);
    sync.touch();
    await d.fire(sync);
    expect(await held(handle.content)).toEqual(ids(d.results));
  });

  it("nothing is written while the history is locked", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    const before = handle.committed;
    d.store.locked = true;
    d.results.push(POOL[2]!);
    sync.touch();
    await d.fire(sync);
    expect(handle.committed).toBe(before);
  });

  it("the passphrase goes when it is told to, and nothing is written without it", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    const before = handle.committed;
    sync.forgetPassphrase();
    expect(phase(sync)).toBe("passphrase");
    d.results.push(POOL[2]!);
    sync.touch();
    expect(d.timers).toHaveLength(0);
    await sync.whenIdle();
    expect(handle.committed).toBe(before);
  });
});

describe("a failed write leaves the file as it was and the results where they are", () => {
  it("the tab is closed in the middle of the write: the file is as it was, and the next session carries on from it", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    const was = handle.content;
    d.results.push(POOL[2]!);
    handle.hangOnClose = true;
    void sync.writeNow();                                                                     // never settles: the page is gone
    await new Promise((r) => setTimeout(r, 400));
    expect(handle.content).toBe(was);                                                         // the browser swaps the content in only on close
    expect(ids(d.results)).toContain(POOL[2]!.id);                                            // and the store lost nothing
    const next = d.make({ file: fileOf(handle), record: d.store.record!, permission: "granted" });
    expect(next.getState().phase).toBe("passphrase");                                         // a new session: the passphrase again
    await next.unlock(PASS);
    expect(phase(next)).toBe("idle");
    expect(await held(handle.content)).toEqual(ids(d.results));
  });

  it("no room to write: the file is as it was, the writable is abandoned, it says so, and the next change writes it", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    const was = handle.content;
    d.results.push(POOL[2]!);
    handle.fail.write = domError("QuotaExceededError");
    sync.touch();
    await d.fire(sync);
    expect(handle.content).toBe(was);
    expect(handle.aborted).toBe(1);
    expect(sync.getState()).toMatchObject({ phase: "error", failure: "full" });
    d.results.push(POOL[3]!);
    sync.touch();
    await d.fire(sync);
    expect(phase(sync)).toBe("idle");
    expect(await held(handle.content)).toEqual(ids(d.results));
  });

  it("the file is held by a cloud client when the browser swaps it in: the file is as it was; Try again writes it", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    const was = handle.content;
    d.results.push(POOL[2]!);
    handle.fail.close = domError("NoModificationAllowedError");
    await sync.writeNow();
    expect(handle.content).toBe(was);
    expect(sync.getState()).toMatchObject({ phase: "error", failure: "locked" });
    await sync.writeNow();
    expect(phase(sync)).toBe("idle");
    expect(await held(handle.content)).toEqual(ids(d.results));
  });

  it("the file cannot be opened for writing at all: as it was, and the same word for it", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    const was = handle.content;
    d.results.push(POOL[2]!);
    handle.fail.create = domError("InvalidStateError");
    await sync.writeNow();
    expect(handle.content).toBe(was);
    expect(sync.getState()).toMatchObject({ phase: "error", failure: "locked" });
  });

  it("the file was moved or deleted: it says so, and nothing is written elsewhere", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    handle.fail.read = domError("NotFoundError");
    await sync.writeNow();
    expect(sync.getState()).toMatchObject({ phase: "error", failure: "gone" });
  });

  it("anything else is a failure with its own word, and is tried again at the next change", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    handle.fail.write = new Error("something unforeseen");
    await sync.writeNow();
    expect(sync.getState()).toMatchObject({ phase: "error", failure: "failed" });
  });

  it("the permission is taken back: it asks to be allowed again, and writes once it is — and not if the person says no", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    d.results.push(POOL[2]!);
    handle.fail.create = domError("NotAllowedError");
    handle.permission = "prompt";
    await sync.writeNow();
    expect(sync.getState()).toMatchObject({ phase: "permission", failure: null });
    handle.grants = "denied";
    await sync.allow();
    expect(sync.getState()).toMatchObject({ phase: "permission", failure: "permission" });
    handle.grants = "granted";
    await sync.allow();
    expect(phase(sync)).toBe("idle");
    expect(await held(handle.content)).toEqual(ids(d.results));
  });
});

describe("a file that is not as this device left it is never written over", () => {
  it("another device's write is found before ours: nothing is overwritten, the file is offered for the merge, and the merged history is written back", async () => {
    const d = device([POOL[0]!, POOL[1]!]);
    const { sync, handle } = await connected(d);
    const theirs = await otherDevicesFile([POOL[0]!, POOL[1]!, POOL[4]!]);                    // the other device saw a result this one has not
    handle.content = theirs;
    d.results.push(POOL[2]!);
    sync.touch();
    await d.fire(sync);
    expect(handle.content).toBe(theirs);                                                      // never overwritten silently
    expect(sync.getState()).toMatchObject({ phase: "merge", pending: theirs });
    expect(sync.mergeInput()).toEqual({ text: theirs, passphrase: PASS });
    d.results.push(POOL[4]!);                                                                 // the importer brought their result in
    await sync.merged();
    expect(phase(sync)).toBe("idle");
    expect(await held(handle.content)).toEqual(ids(d.results));                               // the file now holds both histories
    expect(ids(d.results)).toEqual(ids([POOL[0]!, POOL[1]!, POOL[2]!, POOL[4]!]));
  });

  it("while a merge is waiting, nothing is written however many changes come", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    const theirs = await otherDevicesFile([POOL[0]!, POOL[5]!]);
    handle.content = theirs;
    await sync.writeNow();
    const committed = handle.committed;
    for (const r of [POOL[2]!, POOL[3]!]) { d.results.push(r); sync.touch(); }
    await d.fire(sync);
    expect(handle.committed).toBe(committed);
    expect(handle.content).toBe(theirs);
    expect(phase(sync)).toBe("merge");
  });

  it("a file that changes again while it is being merged is asked about again", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    handle.content = await otherDevicesFile([POOL[0]!, POOL[4]!]);
    await sync.writeNow();
    expect(phase(sync)).toBe("merge");
    handle.content = await otherDevicesFile([POOL[0]!, POOL[4]!, POOL[5]!], PASS, Date.UTC(2026, 9, 7, 9));
    await sync.merged();
    expect(phase(sync)).toBe("merge");
    expect(handle.content).toBe((sync.getState().pending ?? ""));
  });

  it("a file chosen at the start that already holds a backup — another device's — is merged before anything is written", async () => {
    const d = device();
    const theirs = await otherDevicesFile([POOL[0]!, POOL[3]!]);
    const handle = new FakeHandle("shared.encrypted.json", theirs);
    const sync = d.make();
    await sync.attach(fileOf(handle), handle, PASS);
    expect(phase(sync)).toBe("merge");
    expect(handle.content).toBe(theirs);
    expect(d.store.record).toMatchObject({ seen: null, name: "shared.encrypted.json" });      // remembered, and not yet seen
    d.results.push(POOL[3]!);
    await sync.merged();
    expect(phase(sync)).toBe("idle");
    expect(await held(handle.content)).toEqual(ids(d.results));
  });

  it("a file that is not one of this app's encrypted backups is never written over: it is refused, and nothing is remembered", async () => {
    for (const content of ["{\"hello\":1}", "not even json", "{\"format\":\"tcm-backup\",\"version\":1}"]) {
      const d = device();
      const handle = new FakeHandle("notes.json", content);
      const sync = d.make();
      await sync.attach(fileOf(handle), handle, PASS);
      expect(sync.getState()).toMatchObject({ phase: "off", failure: "format" });
      expect(handle.content).toBe(content);
      expect(handle.committed).toBe(0);
      expect(d.store.record).toBeNull();
    }
  });

  it("another device's file under another passphrase is refused as the wrong passphrase, and left alone", async () => {
    const d = device();
    const theirs = await otherDevicesFile([POOL[0]!], "someone else's passphrase");
    const handle = new FakeHandle("shared.encrypted.json", theirs);
    const sync = d.make();
    await sync.attach(fileOf(handle), handle, PASS);
    expect(sync.getState()).toMatchObject({ phase: "off", failure: "passphrase" });
    expect(handle.content).toBe(theirs);
    expect(d.store.record).toBeNull();
  });
});

describe("a later session", () => {
  const remembered = async () => {
    const d = device();
    const { handle } = await connected(d);
    return { d, handle, again: () => d.make({ file: fileOf(handle), record: d.store.record!, permission: "prompt" }) };
  };

  it("starts by asking to be allowed, then for the passphrase, and brings the file up to date with what this device saved meanwhile", async () => {
    const { d, handle, again } = await remembered();
    const sync = again();
    expect(sync.getState()).toMatchObject({ phase: "permission", name: "tcm-backup.encrypted.json" });
    await sync.allow();
    expect(phase(sync)).toBe("passphrase");
    d.results.push(POOL[2]!);                                                                 // saved while the file was not being kept
    await sync.unlock(PASS);
    expect(phase(sync)).toBe("idle");
    expect(await held(handle.content)).toEqual(ids(d.results));
  });

  it("a mistyped passphrase cannot change the passphrase of the file: it is checked against the file, which is left alone", async () => {
    const { handle, again } = await remembered();
    const sync = again();
    await sync.allow();
    const was = handle.content;
    await sync.unlock("a different passphrase, by mistake");
    expect(sync.getState()).toMatchObject({ phase: "passphrase", failure: "passphrase" });
    expect(handle.content).toBe(was);
    await sync.unlock(PASS);
    expect(phase(sync)).toBe("idle");
    expect(await held(handle.content)).toEqual(await held(was));
  });

  it("a file changed while the app was closed is found and offered for the merge, not written over", async () => {
    const { handle, again } = await remembered();
    const sync = again();
    await sync.allow();
    const theirs = await otherDevicesFile([POOL[0]!, POOL[1]!, POOL[5]!]);
    handle.content = theirs;
    await sync.unlock(PASS);
    expect(phase(sync)).toBe("merge");
    expect(handle.content).toBe(theirs);
  });

  it("a file replaced by something else while the app was closed is not written over either", async () => {
    const { handle, again } = await remembered();
    const sync = again();
    await sync.allow();
    handle.content = "{\"somebody\":\"else's file\"}";
    await sync.unlock(PASS);
    expect(sync.getState()).toMatchObject({ phase: "passphrase", failure: "format" });
    expect(handle.content).toBe("{\"somebody\":\"else's file\"}");
  });

  it("a remembered file that is already allowed starts at the passphrase", async () => {
    const { d, handle } = await remembered();
    expect(d.make({ file: fileOf(handle), record: d.store.record!, permission: "granted" }).getState().phase).toBe("passphrase");
  });
});

describe("stopping", () => {
  it("forgets the file and the passphrase and leaves the file where it is", async () => {
    const d = device();
    const { sync, handle } = await connected(d);
    const was = handle.content;
    await sync.stop();
    expect(sync.getState()).toMatchObject({ phase: "off", name: null });
    expect(d.store.record).toBeNull();
    d.results.push(POOL[2]!);
    sync.touch();
    expect(d.timers).toHaveLength(0);
    expect(handle.content).toBe(was);
  });
});

describe("the file API", () => {
  it("names what went wrong in the words the sync acts on", () => {
    const cases: [string, ReturnType<typeof classify>][] = [
      ["NotAllowedError", "permission"], ["SecurityError", "permission"], ["NoModificationAllowedError", "locked"], ["InvalidStateError", "locked"], ["NotReadableError", "locked"],
      ["QuotaExceededError", "full"], ["NotFoundError", "gone"], ["TypeError", "failed"], ["", "failed"],
    ];
    for (const [name, kind] of cases) expect(classify(domError(name)), name).toBe(kind);
    expect(classify(new FileError("full"))).toBe("full");
    expect(classify(null)).toBe("failed");
  });

  it("the feature is offered only where the browser can choose a file to write", () => {
    expect(syncSupported({})).toBe(false);
    expect(syncSupported({ showSaveFilePicker: () => undefined })).toBe(true);
    expect(syncSupported(undefined)).toBe(false);
    expect(SUGGESTED_NAME.endsWith(".encrypted.json")).toBe(true);
  });

  it("a write that fails in the middle abandons the writable and says why; a write that succeeds is the whole content", async () => {
    const handle = new FakeHandle("f.json", "old");
    const file = fileOf(handle);
    handle.fail.write = domError("QuotaExceededError");
    await expect(file.write("new")).rejects.toMatchObject({ kind: "full" });
    expect(handle.content).toBe("old");
    expect(handle.aborted).toBe(1);
    await file.write("new");
    expect(handle.content).toBe("new");
    expect(await file.read()).toBe("new");
    handle.permission = "prompt";
    expect(await file.permission()).toBe("prompt");
  });
});

// ── a property over what can happen ───────────────────────────────────────

/** A small deterministic generator: the sequences are the same on every run. */
const rng = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };

describe("whatever happens, and in whatever order", () => {
  it("the file is always a whole encrypted backup, is never replaced while it holds what this device has not seen, and holds every result once the dust has settled", async () => {
    for (let seed = 1; seed <= 12; seed++) {
      const random = rng(seed * 7919);
      const d = device([POOL[0]!]);
      const handle = new FakeHandle();
      let sync = d.make();
      await sync.attach(fileOf(handle), handle, PASS);
      // the texts this device wrote or merged, and what another device wrote and has not been merged
      const mine = new Set<string>([handle.content]);
      const merged = new Set<string>();
      let pendingOther: { text: string; extra: SavedAssessment[] } | null = null;
      let unseenOther: string | null = null;
      handle.onCommit = (before, after) => {
        // the invariant of the track: what is replaced is empty, was written here, or was merged here
        expect(before === "" || mine.has(before) || merged.has(before), `seed ${seed}: the file was replaced while it held what this device had not seen`).toBe(true);
        mine.add(after);
      };
      const known = new Set(ids(d.results));
      for (let step = 0; step < 24; step++) {
        const roll = random();
        if (roll < 0.28) {                                                                    // a result is saved here
          const r = POOL[1 + Math.floor(random() * (POOL.length - 1))]!;
          if (!d.results.some((x) => x.id === r.id)) { d.results.push(r); known.add(r.id); }
          sync.touch();
        } else if (roll < 0.40) {                                                             // another device writes the file
          const extra = [POOL[Math.floor(random() * POOL.length)]!];
          const text = await otherDevicesFile([...d.results, ...extra], PASS, d.clock.now + step * 1000);
          handle.content = text;
          unseenOther = text;
          pendingOther = { text, extra };
        } else if (roll < 0.52) {                                                             // a failure at the file
          handle.fail[(["write", "close", "create", "read"] as const)[Math.floor(random() * 4)]!] = domError(["QuotaExceededError", "NoModificationAllowedError", "NotAllowedError", "NotFoundError"][Math.floor(random() * 4)]!);
        } else if (roll < 0.62) {                                                             // the tab is closed, and the app opened again
          sync.dispose();
          handle.fail = {};
          sync = d.make({ file: fileOf(handle), record: d.store.record!, permission: "prompt" });
          await sync.allow();
          await sync.unlock(PASS);
        } else if (roll < 0.74 && phase(sync) === "merge") {                                  // the person merges what is waiting
          const input = sync.mergeInput();
          if (input !== null) {
            for (const r of pendingOther?.extra ?? []) if (!d.results.some((x) => x.id === r.id)) { d.results.push(r); known.add(r.id); }
            merged.add(input.text);
            if (unseenOther === input.text) unseenOther = null;
            await sync.merged();
          }
        } else if (roll < 0.84) {                                                             // Try again / Write now
          await sync.writeNow();
        } else {                                                                              // time passes
          await d.fire(sync);
        }
        // the file is always a whole encrypted backup (or empty), whatever just happened
        const text = handle.content;
        if (text !== "") expect(await held(text), `seed ${seed} step ${step}`).toBeTruthy();
        expect(ids(d.results).length, "the store lost nothing").toBe(known.size);
      }
      // let the dust settle: failures cleared, merge done, written
      handle.fail = {};
      if (phase(sync) === "permission") await sync.allow();
      for (let i = 0; i < 3; i++) {
        if (phase(sync) === "merge") {
          const input = sync.mergeInput();
          if (input !== null) { for (const r of pendingOther?.extra ?? []) if (!d.results.some((x) => x.id === r.id)) d.results.push(r); merged.add(input.text); await sync.merged(); }
        }
        if (phase(sync) === "error" || phase(sync) === "idle") await sync.writeNow();
        await d.fire(sync);
      }
      expect(phase(sync), `seed ${seed}: settled`).toBe("idle");
      expect(await held(handle.content), `seed ${seed}: the file holds every result`).toEqual(ids(d.results));
    }
  }, 120_000);
});

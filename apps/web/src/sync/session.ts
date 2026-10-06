// Keeping a file up to date (docs/post-mvp/design/research-tracks.md §4; task PM-32): after a person has chosen a file — in a folder their own cloud client may synchronise — the app writes an **encrypted backup**
// to it after each change to the saved results, and, before it writes, looks at what is there: a file that is not as this device left it was changed by someone else, and it is **never overwritten silently** —
// the person merges it first, with the same importer and the same choices as any restore. No server is involved: the cloud service sees only an encrypted file the person chose.
//
// The honest limits are the design's: the file is written only while the app is open, a browser that cannot choose a file does not get the feature, the passphrase is asked for in each session and kept
// in memory only, and between reading the file and writing it another device can still write (no cloud client offers a lock) — the next write then finds the file changed and asks.
import { buildBackup, encryptBackup, openEncrypted, readBackup, serializeBackup, serializeEncrypted, sha256Hex, type Source, type Stamps } from "../storage/backup/index.ts";
import type { SyncRecord } from "../storage/types.ts";
import { classify, type FileFailure, type Permission, type SyncFile } from "./file.ts";

/** Why the sync stopped short: something at the file, or at the passphrase the person gave, or a file that is not one of this app's encrypted backups. */
export type SyncFailure = FileFailure | "passphrase" | "format";

export type SyncPhase =
  | "off"            // no file chosen
  | "permission"     // a file is remembered; the person must allow it again in this session (a click)
  | "passphrase"     // allowed; the passphrase is needed to read or write it
  | "idle"           // the file is as this device left it, and up to date
  | "writing"
  | "merge"          // the file holds something this device has not seen: merge it before anything is written
  | "error";         // the last write failed; the file is as it was. The next change, or *Try again*, tries once more

export interface SyncState {
  readonly phase: SyncPhase;
  readonly name: string | null;
  readonly writtenAt: number | null;
  /** What went wrong, with `error`, and with `passphrase` or `off` when a passphrase was refused. */
  readonly failure: SyncFailure | null;
  /** With `merge`: the text of the file as it was just read. */
  readonly pending: string | null;
}

const OFF: SyncState = { phase: "off", name: null, writtenAt: null, failure: null, pending: null };

export interface SyncDeps {
  /** What to back up: the store's backup source. */
  readonly source: () => Promise<Source>;
  readonly stamps: () => Stamps;
  readonly now: () => number;
  /** Keep the record of the file between sessions (never the passphrase); `null` forgets it. */
  readonly save: (record: SyncRecord | null) => Promise<void>;
  /** A backup has been made, now: the reminder's clock. */
  readonly written: (now: number) => void;
  /** The local lock is on and the key is not in memory: nothing of the history can be read, so nothing is written. */
  readonly locked: () => boolean;
  /** Timers, replaceable by a test. */
  readonly timers?: { readonly set: (run: () => void, ms: number) => unknown; readonly clear: (handle: unknown) => void };
  /** How long after a change the file is written (several changes make one write). */
  readonly debounceMs?: number;
  /** The key-derivation iterations of the file (tests use the smallest a reader accepts). */
  readonly iterations?: number;
}

/** A file remembered from an earlier session. */
export interface Remembered { readonly file: SyncFile; readonly record: SyncRecord; readonly permission: Permission }

export class FileSync {
  private state: SyncState;
  private file: SyncFile | null = null;
  private record: SyncRecord | null = null;
  private passphrase: string | null = null;
  private timer: unknown = null;
  private flight: Promise<void> | null = null;
  private again = false;
  private readonly subscribers = new Set<() => void>();
  private readonly deps: SyncDeps;

  constructor(deps: SyncDeps, remembered: Remembered | null = null) {
    this.deps = deps;
    if (remembered === null) { this.state = OFF; return; }
    this.file = remembered.file;
    this.record = remembered.record;
    this.state = { phase: remembered.permission === "granted" ? "passphrase" : "permission", name: remembered.record.name, writtenAt: remembered.record.writtenAt, failure: null, pending: null };
  }

  // ── what the screen reads ───────────────────────────────────────────────

  getState = (): SyncState => this.state;
  subscribe = (listener: () => void): (() => void) => { this.subscribers.add(listener); return () => { this.subscribers.delete(listener); }; };
  /** For the restore dialog: the file's text as it was read and the passphrase it was opened with, while a merge is waiting. */
  mergeInput(): { readonly text: string; readonly passphrase: string } | null {
    return this.state.phase === "merge" && this.state.pending !== null && this.passphrase !== null ? { text: this.state.pending, passphrase: this.passphrase } : null;
  }

  private set(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of [...this.subscribers]) l();
  }

  // ── choosing a file ─────────────────────────────────────────────────────

  /**
   * A file has just been chosen. An empty file gets the first backup. A file with something in it must be an encrypted backup of this app that the passphrase opens — never anything else, which is not written over —
   * and is then **merged before anything is written**: it may be the file of another device. Resolves when the file is up to date or waiting for the merge; a refused file leaves nothing behind.
   */
  async attach(file: SyncFile, handle: unknown, passphrase: string): Promise<void> {
    this.clearTimer();
    this.file = file;
    this.passphrase = passphrase;
    this.record = { v: 1, handle, name: file.name, seen: null, writtenAt: null };
    this.set({ phase: "writing", name: file.name, writtenAt: null, failure: null, pending: null });
    try {
      const text = await file.read();
      if (text.trim() !== "") {
        const verdict = await this.verify(text, passphrase);
        if (verdict !== "ok") { this.forgetFile(); this.set({ ...OFF, failure: verdict }); return; }
        await this.deps.save(this.record);
        this.set({ phase: "merge", pending: text });
        return;
      }
      await this.deps.save(this.record);
      await this.run();
    } catch (e) {
      this.forgetFile();
      this.set({ ...OFF, failure: classify(e) });
    }
  }

  /** Does the passphrase open this file, and is it one of ours? */
  private async verify(text: string, passphrase: string): Promise<"ok" | "passphrase" | "format"> {
    const read = await readBackup(text);
    if (read.kind !== "encrypted") return "format";
    const opened = await openEncrypted(read.raw, passphrase);
    if (opened.kind === "backup") return "ok";
    return opened.kind === "locked" && opened.error === "wrong-passphrase" ? "passphrase" : "format";
  }

  // ── a session of a file already chosen ──────────────────────────────────

  /** The person allows the file again in this session (called from a click: the browser refuses otherwise). */
  async allow(): Promise<void> {
    if (this.file === null) return;
    const answer = await this.file.request();
    if (answer !== "granted") { this.set({ failure: "permission" }); return; }
    this.set({ phase: this.passphrase === null ? "passphrase" : "idle", failure: null });
    if (this.passphrase !== null) await this.run();
  }

  /**
   * The passphrase of the file, for this session. It is checked against the file — the same passphrase as before, or the file is left alone — so that a slip of the keyboard cannot change the passphrase of the
   * file the other devices read. Then the file is brought up to date, unless it was changed meanwhile: then it waits for the merge.
   */
  async unlock(passphrase: string): Promise<void> {
    const file = this.file;
    if (file === null) return;
    this.set({ phase: "writing", failure: null });
    try {
      const text = await file.read();
      if (text.trim() !== "") {
        const verdict = await this.verify(text, passphrase);
        if (verdict !== "ok") { this.set({ phase: "passphrase", failure: verdict }); return; }
        this.passphrase = passphrase;
        if (this.record?.seen !== (await sha256Hex(text))) { this.set({ phase: "merge", pending: text }); return; }
      } else this.passphrase = passphrase;
      await this.run();
    } catch (e) { this.fail(e); }
  }

  // ── writing ─────────────────────────────────────────────────────────────

  /** The saved results changed: write the file soon (several changes make one write). */
  touch(): void {
    if (this.file === null || this.passphrase === null) return;
    if (this.state.phase === "idle" || this.state.phase === "error") this.schedule();
    else if (this.state.phase === "writing") this.again = true;
  }

  /** *Write now*, or *Try again*. */
  writeNow(): Promise<void> {
    this.clearTimer();
    return this.run();
  }

  /** Resolves when no write is under way (and none is waiting behind it). */
  async whenIdle(): Promise<void> {
    while (this.flight !== null) await this.flight;
  }

  private schedule(): void {
    this.clearTimer();
    const timers = this.deps.timers ?? { set: (run: () => void, ms: number) => setTimeout(run, ms), clear: (h: unknown) => { clearTimeout(h as ReturnType<typeof setTimeout>); } };
    this.timer = timers.set(() => { this.timer = null; void this.run(); }, this.deps.debounceMs ?? 4_000);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    (this.deps.timers?.clear ?? ((h: unknown) => { clearTimeout(h as ReturnType<typeof setTimeout>); }))(this.timer);
    this.timer = null;
  }

  /** One write at a time; a change that comes during one makes another after it. */
  private run(): Promise<void> {
    if (this.flight !== null) { this.again = true; return this.flight; }
    this.flight = this.write().finally(() => {
      this.flight = null;
      if (this.again) { this.again = false; this.schedule(); }
    });
    return this.flight;
  }

  /**
   * Read what is there; if it is not as this device left it, stop and ask for the merge; otherwise write the whole file and wait for the browser to close — and so swap in — the new content. A failure of any
   * step leaves the file as it was, and says which.
   */
  private async write(): Promise<void> {
    const file = this.file;
    const passphrase = this.passphrase;
    if (file === null || passphrase === null || this.record === null || this.deps.locked()) return;
    this.set({ phase: "writing", failure: null });
    try {
      const current = await file.read();
      if (current.trim() !== "" && this.record.seen !== (await sha256Hex(current))) { this.set({ phase: "merge", pending: current }); return; }
      const source = await this.deps.source();
      const now = this.deps.now();
      const doc = await buildBackup({ ...source, draft: null }, { assessments: "all", draft: false, prefs: true }, this.deps.stamps(), now);
      const text = serializeEncrypted(await encryptBackup(serializeBackup(doc), passphrase, doc.createdAt, this.deps.iterations));
      await file.write(text);
      this.record = { ...this.record, seen: await sha256Hex(text), writtenAt: now };
      await this.deps.save(this.record);           // if this cannot be kept, the next session finds the file "changed", and merges nothing
      this.deps.written(now);
      this.set({ phase: "idle", writtenAt: now, failure: null, pending: null });
    } catch (e) { this.fail(e); }
  }

  private fail(e: unknown): void {
    const kind = classify(e);
    this.set(kind === "permission" ? { phase: "permission", failure: null } : { phase: "error", failure: kind });
  }

  // ── merging ─────────────────────────────────────────────────────────────

  /**
   * The file waiting in `merge` has been merged into this device's results (or the person saw that there was nothing to merge): it is now as this device knows it, and the merged history is written back.
   * A file that changed again in the meantime is found to have changed, and asked about again.
   */
  async merged(): Promise<void> {
    const text = this.state.pending;
    if (text === null || this.record === null) return;
    this.record = { ...this.record, seen: await sha256Hex(text) };
    await this.deps.save(this.record);
    this.set({ phase: "idle", pending: null, failure: null });
    await this.run();
  }

  // ── ending ──────────────────────────────────────────────────────────────

  /** Stop keeping the file up to date: forget it. The file itself stays where it is. */
  async stop(): Promise<void> {
    this.clearTimer();
    this.forgetFile();
    await this.deps.save(null);
    this.set({ ...OFF });
  }

  private forgetFile(): void {
    this.file = null;
    this.record = null;
    this.passphrase = null;
  }

  /** The local lock engaged, or the page is going away: the passphrase goes with it. */
  forgetPassphrase(): void {
    this.passphrase = null;
    this.clearTimer();
    if (this.file !== null && this.state.phase !== "permission" && this.state.phase !== "off") this.set({ phase: "passphrase", failure: null, pending: null });
  }

  dispose(): void {
    this.clearTimer();
    this.subscribers.clear();
  }
}

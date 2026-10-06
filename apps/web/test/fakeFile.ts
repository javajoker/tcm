// A file the way the browser's file-system access offers it, in memory (docs/post-mvp/design/research-tracks.md §4): the content is replaced only when a writable is **closed**; whatever is written before
// then — or when the write fails, or when the tab is closed in the middle — leaves it as it was. Failures are injected one at a time, as the browser would raise them.
import type { HandleLike, Permission } from "../src/sync/file.ts";

/** An error the way the DOM raises one: only its name matters to the sync. */
export const domError = (name: string): Error => Object.assign(new Error(name), { name });

export class FakeHandle implements HandleLike {
  readonly name: string;
  content: string;
  permission: Permission = "granted";
  /** What a click on *Allow* answers. */
  grants: Permission = "granted";
  /** Failures to raise, each once, at the step named. */
  fail: { read?: Error; create?: Error; write?: Error; close?: Error } = {};
  /** The next close never settles: the tab was closed in the middle of the write. */
  hangOnClose = false;
  committed = 0;
  aborted = 0;
  /** Called with the old and the new content at every commit. */
  onCommit: ((before: string, after: string) => void) | null = null;

  constructor(name = "tcm-backup.encrypted.json", content = "") { this.name = name; this.content = content; }

  private raise(step: keyof FakeHandle["fail"]): void {
    const e = this.fail[step];
    if (e !== undefined) { delete this.fail[step]; throw e; }
  }

  async getFile(): Promise<{ text(): Promise<string> }> {
    this.raise("read");
    const snapshot = this.content;
    return { text: async () => snapshot };
  }

  async createWritable() {
    this.raise("create");
    let buffer = "";
    return {
      write: async (data: string): Promise<void> => { this.raise("write"); buffer += data; },
      close: async (): Promise<void> => {
        if (this.hangOnClose) { this.hangOnClose = false; return new Promise<void>(() => undefined); }
        this.raise("close");
        const before = this.content;
        this.content = buffer;
        this.committed += 1;
        this.onCommit?.(before, buffer);
      },
      abort: async (): Promise<void> => { this.aborted += 1; },
    };
  }

  async queryPermission(): Promise<Permission> { return this.permission; }
  async requestPermission(): Promise<Permission> { if (this.grants === "granted") this.permission = "granted"; return this.grants; }
}

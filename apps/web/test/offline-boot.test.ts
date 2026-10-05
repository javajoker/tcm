// The boot guard (docs/post-mvp/design/offline-and-install.md §3.5, §5): two starts in a row that never rendered drop the offline copy, once, and anything else leaves it alone.
import { describe, expect, it } from "vitest";
import { BOOT_KEY, bootRendered, bootStarted, FAILED_STARTS, RECOVERY_QUIET_MS, type BootEnv } from "../src/offline/boot.ts";

class Mem {
  readonly map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
}
function env(over: Partial<BootEnv> & { stored?: Record<string, string> } = {}) {
  const storage = new Mem();
  for (const [k, v] of Object.entries(over.stored ?? {})) storage.setItem(k, v);
  const log = { unregistered: 0, deleted: [] as string[], reloads: 0 };
  const caches = ["tcm-app-a", "tcm-app-b", "other"];
  const e: BootEnv = {
    storage: "storage" in over ? over.storage! : storage,
    now: over.now ?? (() => 1_000_000),
    container: "container" in over ? over.container : { getRegistrations: async () => [{ unregister: async () => { log.unregistered++; return true; } }] },
    caches: "caches" in over ? over.caches : { keys: async () => [...caches], delete: async (n) => { log.deleted.push(n); return true; } },
    reload: () => { log.reloads++; },
  };
  return { e, storage, log };
}

describe("counting starts", () => {
  it("raises the counter when the page starts and clears it after the first render", async () => {
    const { e, storage } = env();
    expect(await bootStarted(e)).toBe(false);
    expect(storage.getItem(BOOT_KEY)).toBe("1");
    bootRendered(e);
    expect(storage.getItem(BOOT_KEY)).toBeNull();
  });

  it("a start that never rendered is counted again by the next one", async () => {
    const { e, storage, log } = env();
    await bootStarted(e);
    await bootStarted(e);
    expect(storage.getItem(BOOT_KEY)).toBe("2");
    expect(log).toEqual({ unregistered: 0, deleted: [], reloads: 0 });
  });
});

describe("two failed starts in a row", () => {
  it("drop the offline copy — the worker, the caches of this application only — and load once from the network", async () => {
    expect(FAILED_STARTS).toBe(2);
    const { e, storage, log } = env({ stored: { [BOOT_KEY]: "2" } });
    expect(await bootStarted(e)).toBe(true);
    expect(log).toEqual({ unregistered: 1, deleted: ["tcm-app-a", "tcm-app-b"], reloads: 1 });
    expect(storage.getItem(BOOT_KEY)).toBe("0");                       // the new load counts from the start again
  });

  it("only once in a while: a build that is broken for another reason cannot reload forever", async () => {
    let clock = 1_000_000;
    const { e, storage, log } = env({ stored: { [BOOT_KEY]: "2" }, now: () => clock });
    await bootStarted(e);
    storage.setItem(BOOT_KEY, "2");                                      // it still does not render
    clock += RECOVERY_QUIET_MS - 1;
    expect(await bootStarted(e)).toBe(false);
    expect(log.reloads).toBe(1);
    storage.setItem(BOOT_KEY, "2");
    clock += 2;                                                          // the quiet period is over
    expect(await bootStarted(e)).toBe(true);
    expect(log.reloads).toBe(2);
  });

  it("one failed start is not enough: a tab closed while loading must not take the offline copy away", async () => {
    const { e, log } = env({ stored: { [BOOT_KEY]: "1" } });
    expect(await bootStarted(e)).toBe(false);
    expect(log.reloads).toBe(0);
  });

  it("a browser that refuses to unregister, or has no cache storage, still reloads", async () => {
    const { e, log } = env({ stored: { [BOOT_KEY]: "2" }, container: { getRegistrations: async () => { throw new Error("no"); } }, caches: { keys: async () => { throw new Error("no"); }, delete: async () => false } });
    expect(await bootStarted(e)).toBe(true);
    expect(log.reloads).toBe(1);
    const none = env({ stored: { [BOOT_KEY]: "2" }, container: undefined, caches: undefined });
    expect(await bootStarted(none.e)).toBe(true);
    expect(none.log.reloads).toBe(1);
  });
});

describe("without storage", () => {
  it("there is no guard and nothing else is affected", async () => {
    const { e, log } = env({ storage: null });
    expect(await bootStarted(e)).toBe(false);
    bootRendered(e);
    expect(log).toEqual({ unregistered: 0, deleted: [], reloads: 0 });
  });

  it("a storage that throws is no guard either", async () => {
    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    const { e, log } = env({ storage: broken });
    expect(await bootStarted(e)).toBe(false);
    expect(() => bootRendered(e)).not.toThrow();
    expect(log.reloads).toBe(0);
  });

  it("a counter that is not a number counts as none", async () => {
    const { e, storage } = env({ stored: { [BOOT_KEY]: "banana" } });
    expect(await bootStarted(e)).toBe(false);
    expect(storage.getItem(BOOT_KEY)).toBe("1");
  });
});

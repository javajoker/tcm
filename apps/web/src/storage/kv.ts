// A string key/value store over `localStorage` that never throws: if the storage is missing, blocked or full it keeps the value in memory instead.

export interface KV {
  get(key: string): string | null;
  /** Returns whether the value reached durable storage. */
  set(key: string, value: string): boolean;
  remove(key: string): void;
  /** Whether durable storage works at all (probed once at creation). */
  readonly durable: boolean;
  /** Removes everything this origin keeps in durable storage, and the memory copy. Returns false if the durable part could not be cleared. */
  clear(): boolean;
}

export function createKV(storage: Storage | null | undefined): KV {
  const memory = new Map<string, string>();
  let durable = false;
  if (storage) {
    try {
      const probe = "tcm.probe";
      storage.setItem(probe, "1");
      storage.removeItem(probe);
      durable = true;
    } catch { durable = false; }
  }
  return {
    get durable() { return durable; },
    get(key) {
      if (durable) { try { return storage!.getItem(key); } catch { durable = false; } }
      return memory.get(key) ?? null;
    },
    set(key, value) {
      if (durable) { try { storage!.setItem(key, value); memory.delete(key); return true; } catch { durable = false; } }
      memory.set(key, value);
      return false;
    },
    remove(key) {
      memory.delete(key);
      if (durable) { try { storage!.removeItem(key); } catch { durable = false; } }
    },
    clear() {
      memory.clear();
      if (!storage) return true;
      try { storage.clear(); return true; } catch { return false; }
    },
  };
}

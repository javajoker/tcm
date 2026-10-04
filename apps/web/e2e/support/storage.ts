// Looking at what the app has written to the device, from the outside (docs/privacy.md §6).
import type { Page } from "@playwright/test";

export interface DeviceState { readonly localStorage: readonly string[]; readonly databases: readonly string[]; readonly caches: readonly string[] }

export async function deviceState(page: Page): Promise<DeviceState> {
  return page.evaluate(async () => ({
    localStorage: Object.keys(localStorage),
    databases: ((await indexedDB.databases?.()) ?? []).map((d) => d.name ?? ""),
    caches: await caches.keys(),
  }));
}

/** Every record of an object store of the app's database (`drafts`, `assessments`, `meta`), as `[key, value]` pairs. */
export async function idbRecords(page: Page, store: "drafts" | "assessments" | "meta"): Promise<[string, unknown][]> {
  return page.evaluate(async (name) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("tcm-app"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const keys: IDBValidKey[] = await new Promise((res) => { const r = db.transaction(name).objectStore(name).getAllKeys(); r.onsuccess = () => res(r.result); });
    const values: unknown[] = await new Promise((res) => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => res(r.result); });
    db.close();
    return keys.map((k, i) => [String(k), values[i]] as [string, unknown]);
  }, store);
}

export async function idbPut(page: Page, store: "drafts" | "assessments" | "meta", key: string, value: unknown): Promise<void> {
  await page.evaluate(async ({ name, k, v }) => {
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open("tcm-app"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise<void>((res, rej) => { const t = db.transaction(name, "readwrite"); t.objectStore(name).put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
    db.close();
  }, { name: store, k: key, v: value });
}

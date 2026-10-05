// The page's side of the service worker (docs/post-mvp/design/offline-and-install.md §3.3, §3.5): register it once the page has loaded and the browser is idle, ask it to keep the knowledge files
// of the script in use, say in a word where that stands, notice a newer build and apply it only when the person asks, and remove the offline copy on request. No DOM and no globals here: the
// browser's service-worker container and cache storage are passed in, so every path is tested with fakes.
import type { Script } from "../sw/build.ts";

/**
 * `unsupported` (this browser has no service workers) · `preparing` · `ready` (the page's own files and the knowledge files of the script in use are cached) · `update-ready` (a newer build
 * waits, or has taken over under a page that still runs the old one) · `failed` · `removed` (the person removed the offline copy; the next visit installs it again).
 */
export type OfflineStatus = "unsupported" | "preparing" | "ready" | "update-ready" | "failed" | "removed";

/** What the screens read: the status, whether the person has dismissed the update notice, and the scripts that can be used without a connection. A new object whenever any of it changes. */
export interface OfflineView {
  readonly status: OfflineStatus;
  readonly updateDismissed: boolean;
  readonly cachedScripts: readonly Script[];
}

/** The part of `ServiceWorkerContainer` this uses (a fake in the tests). */
export interface Container {
  readonly controller: unknown;
  register(url: string, options: { scope: string; updateViaCache: "none" }): Promise<Registration>;
  getRegistrations(): Promise<readonly { unregister(): Promise<boolean> }[]>;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "controllerchange", listener: () => void): void;
}
export interface Registration {
  readonly installing: Worker | null;
  readonly waiting: Worker | null;
  readonly active: Worker | null;
  addEventListener(type: "updatefound", listener: () => void): void;
}
export interface Worker {
  readonly state: string;
  postMessage(message: unknown): void;
  addEventListener(type: "statechange", listener: () => void): void;
}
export interface CacheStorageLike { keys(): Promise<string[]>; delete(name: string): Promise<boolean> }

export interface OfflineEnv {
  /** `undefined` where the browser has no service workers. */
  readonly container: Container | undefined;
  readonly caches: CacheStorageLike | undefined;
  /** Resolves when the page has loaded and the browser has nothing better to do, so the first visit is not slowed. */
  readonly whenIdle: () => Promise<void>;
  /** Reload the page (after the person has applied an update). */
  readonly reload: () => void;
}

export interface Offline {
  getStatus(): OfflineStatus;
  getView(): OfflineView;
  subscribe(listener: () => void): () => void;
  /** Register the worker (the first time only) and make sure the offline copy holds the knowledge files `script` needs. Safe to call again, for example when the language changes. */
  ensure(script: Script): Promise<void>;
  /** Let the waiting build take over, then reload once. Only ever called because the person chose to: nothing applies an update by itself. */
  applyUpdate(): Promise<void>;
  /** Hide the update notice for this visit (the Settings card and the landing page still say it). */
  dismissUpdate(): void;
  /** Delete the offline copy and unregister the worker. The page keeps working; the next visit installs the copy again. */
  remove(): Promise<void>;
}

const WORKER_URL = "/sw.js";
const CACHE_PREFIX = "tcm-app-";

export function createOffline(env: OfflineEnv): Offline {
  const container = env.container;
  const listeners = new Set<() => void>();
  const cached = new Set<Script>();
  let wanted: Script | null = null;
  let updateReady = false, failed = false, removed = false, dismissed = false, applying = false, reloaded = false;
  let registering: Promise<Registration | null> | null = null;
  let registration: Registration | null = null;

  const statusNow = (): OfflineStatus => container === undefined ? "unsupported" : removed ? "removed" : updateReady ? "update-ready" : failed ? "failed" : wanted !== null && cached.has(wanted) ? "ready" : "preparing";
  const viewNow = (): OfflineView => ({ status: statusNow(), updateDismissed: dismissed, cachedScripts: [...cached].sort() });
  let view = viewNow();
  const publish = (): void => {
    const next = viewNow();
    if (next.status === view.status && next.updateDismissed === view.updateDismissed && next.cachedScripts.join() === view.cachedScripts.join()) return;
    view = next;
    for (const l of [...listeners]) l();
  };

  const watch = (worker: Worker | null): void => {
    if (worker === null) return;
    worker.addEventListener("statechange", () => { if (worker.state === "installed" && container?.controller) { updateReady = true; publish(); } });
  };

  const register = async (): Promise<Registration | null> => {
    if (container === undefined) return null;
    try {
      await env.whenIdle();
      if (removed) return null;
      let controlled = container.controller !== null && container.controller !== undefined;
      const reg = await container.register(WORKER_URL, { scope: "/", updateViaCache: "none" });
      container.addEventListener("message", (event) => {
        const data = event.data as { type?: unknown; script?: unknown; ok?: unknown; scripts?: unknown } | null;
        if (data?.type !== "KB_READY" || (data.script !== "Hant" && data.script !== "Hans")) return;
        if (data.ok === true) {
          cached.add(data.script);
          failed = false;
          if (Array.isArray(data.scripts)) for (const s of data.scripts) if (s === "Hant" || s === "Hans") cached.add(s);
        } else failed = true;
        publish();
      });
      // A build that takes over under this page is a newer one: when the person asked for it, the page reloads at once; when it happened on its own (another tab closed), the page keeps running
      // as it is and says a new version is ready — it is not reloaded under anyone. The first worker ever to take over a page that had none (a first visit) is not an update; every change after it is.
      container.addEventListener("controllerchange", () => {
        if (!controlled) { controlled = true; return; }
        if (reloaded) return;
        if (applying) { reloaded = true; env.reload(); return; }
        updateReady = true;
        publish();
      });
      reg.addEventListener("updatefound", () => watch(reg.installing));
      if (reg.waiting !== null && container.controller) updateReady = true;
      watch(reg.installing);
      registration = reg;
      publish();
      return reg;
    } catch {
      failed = true;
      publish();
      return null;
    }
  };

  /** The worker that is active, once there is one (the first visit installs it in the background). */
  const active = (reg: Registration): Promise<Worker | null> => new Promise((resolve) => {
    if (reg.active !== null) { resolve(reg.active); return; }
    const pending = reg.installing ?? reg.waiting;
    if (pending === null) { resolve(null); return; }
    const settle = (): void => { if (pending.state === "activated") resolve(reg.active); else if (pending.state === "redundant") resolve(null); };
    pending.addEventListener("statechange", settle);
    settle();
  });

  return {
    getStatus: () => view.status,
    getView: () => view,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async ensure(script) {
      if (container === undefined || removed) return;
      wanted = script;
      failed = false;
      publish();
      registering ??= register();
      const reg = await registering;
      if (reg === null) return;
      const worker = await active(reg);
      if (worker === null) { failed = true; publish(); return; }
      if (cached.has(script) && !failed) { publish(); return; }
      worker.postMessage({ type: "CACHE_KB", script });
    },
    async applyUpdate() {
      const reg = registration ?? await registering;
      if (reg?.waiting == null) {
        if (updateReady) { reloaded = true; env.reload(); }           // a newer build already took over under this page: all that is left is to load it
        return;
      }
      applying = true;
      reg.waiting.postMessage({ type: "SKIP_WAITING" });
    },
    dismissUpdate() { dismissed = true; publish(); },
    async remove() {
      if (container === undefined) return;
      removed = true;
      updateReady = false;
      cached.clear();
      publish();
      try { for (const r of await container.getRegistrations()) await r.unregister(); } catch { /* the browser refused: the caches below are still removed */ }
      try { if (env.caches) for (const name of (await env.caches.keys()).filter((k) => k.startsWith(CACHE_PREFIX))) await env.caches.delete(name); } catch { /* nothing to remove */ }
    },
  };
}

/** After the page has loaded, when the browser is idle (or after a short wait where there is no idle callback). */
export function afterLoadAndIdle(): Promise<void> {
  return new Promise((resolve) => {
    const idle = (): void => { if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(() => resolve(), { timeout: 4000 }); else setTimeout(resolve, 1500); };
    if (document.readyState === "complete") idle(); else window.addEventListener("load", idle, { once: true });
  });
}

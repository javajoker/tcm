// The page's side of the service worker (docs/post-mvp/design/offline-and-install.md §3.5): register it once the page has loaded and the browser is idle, ask it to keep the knowledge files
// of the script in use, and say in a word where that stands. No DOM and no globals here: the browser's service-worker container is passed in, so every path is tested with fakes.
import type { Script } from "../sw/build.ts";

/** `unsupported` (this browser has no service workers) · `preparing` · `ready` (the page's own files and the knowledge files of the script in use are cached) · `update-ready` (a newer build waits) · `failed`. */
export type OfflineStatus = "unsupported" | "preparing" | "ready" | "update-ready" | "failed";

/** The part of `ServiceWorkerContainer` this uses (a fake in the tests). */
export interface Container {
  readonly controller: unknown;
  register(url: string, options: { scope: string; updateViaCache: "none" }): Promise<Registration>;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
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

export interface OfflineEnv {
  /** `undefined` where the browser has no service workers. */
  readonly container: Container | undefined;
  /** Resolves when the page has loaded and the browser has nothing better to do, so the first visit is not slowed. */
  readonly whenIdle: () => Promise<void>;
}

export interface Offline {
  getStatus(): OfflineStatus;
  subscribe(listener: () => void): () => void;
  /** Register the worker (the first time only) and make sure the offline copy holds the knowledge files `script` needs. Safe to call again, for example when the language changes. */
  ensure(script: Script): Promise<void>;
}

const WORKER_URL = "/sw.js";

export function createOffline(env: OfflineEnv): Offline {
  const container = env.container;
  const listeners = new Set<() => void>();
  const cached = new Set<Script>();
  let wanted: Script | null = null;
  let updateReady = false, failed = false;
  let registering: Promise<Registration | null> | null = null;

  const status = (): OfflineStatus => container === undefined ? "unsupported" : updateReady ? "update-ready" : failed ? "failed" : wanted !== null && cached.has(wanted) ? "ready" : "preparing";
  let last = status();
  const publish = (): void => { const now = status(); if (now !== last) { last = now; for (const l of [...listeners]) l(); } };

  const watch = (worker: Worker | null): void => {
    if (worker === null) return;
    worker.addEventListener("statechange", () => { if (worker.state === "installed" && container?.controller) { updateReady = true; publish(); } });
  };

  const register = async (): Promise<Registration | null> => {
    if (container === undefined) return null;
    try {
      await env.whenIdle();
      const reg = await container.register(WORKER_URL, { scope: "/", updateViaCache: "none" });
      container.addEventListener("message", (event) => {
        const data = event.data as { type?: unknown; script?: unknown; ok?: unknown } | null;
        if (data?.type !== "KB_READY" || (data.script !== "Hant" && data.script !== "Hans")) return;
        if (data.ok === true) { cached.add(data.script); failed = false; } else failed = true;
        publish();
      });
      reg.addEventListener("updatefound", () => watch(reg.installing));
      if (reg.waiting !== null && container.controller) updateReady = true;
      watch(reg.installing);
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
    getStatus: () => status(),
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async ensure(script) {
      if (container === undefined) return;
      wanted = script;
      failed = false;
      publish();
      registering ??= register();
      const reg = await registering;
      if (reg === null) return;
      const worker = await active(reg);
      if (worker === null) { failed = true; publish(); return; }
      if (cached.has(script)) { publish(); return; }
      worker.postMessage({ type: "CACHE_KB", script });
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

// The boot guard (docs/post-mvp/design/offline-and-install.md §3.5, §5): the last line of defence against a service worker that serves a page that cannot start. A counter in `localStorage` is
// raised when the page's scripts begin and cleared after the first render; when the two starts before this one never got that far, the page stops trusting the offline copy — it unregisters the
// worker, deletes the caches and loads once from the network. Once in a while, so a build that is broken for another reason cannot reload forever. No DOM and no globals: the browser's objects are
// passed in (the browser's own are picked by `browserEnvironment` of the storage layer, the one place that touches them; `bootEnvironment` below puts them together).
import { browserEnvironment } from "../storage/browser.ts";

export const BOOT_KEY = "tcm.boot";
const RECOVERED_KEY = "tcm.boot.recovered";
/** How long after a recovery another one is not made: "once per visit" for a counter that survives a reload. */
export const RECOVERY_QUIET_MS = 10 * 60_000;
/** The starts in a row that never rendered, before this one, at which the offline copy is dropped. */
export const FAILED_STARTS = 2;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export interface BootEnv {
  /** `localStorage` (`null` where it is blocked: then there is no guard, and nothing else is affected). */
  readonly storage: Store | null;
  readonly now: () => number;
  readonly container: { getRegistrations(): Promise<readonly { unregister(): Promise<boolean> }[]> } | undefined;
  readonly caches: { keys(): Promise<string[]>; delete(name: string): Promise<boolean> } | undefined;
  readonly reload: () => void;
}

const guarded = <T>(f: () => T, otherwise: T): T => { try { return f(); } catch { return otherwise; } };

/** Called first thing when the page's scripts start. Resolves `true` when it dropped the offline copy and asked for a reload (the page need not go on). */
export async function bootStarted(env: BootEnv): Promise<boolean> {
  const failed = guarded(() => Number(env.storage?.getItem(BOOT_KEY) ?? "0") || 0, 0);
  guarded(() => env.storage?.setItem(BOOT_KEY, String(failed + 1)), undefined);
  const last = guarded(() => Number(env.storage?.getItem(RECOVERED_KEY) ?? "0") || 0, 0);
  if (failed < FAILED_STARTS || env.now() - last < RECOVERY_QUIET_MS) return false;
  guarded(() => env.storage?.setItem(RECOVERED_KEY, String(env.now())), undefined);
  guarded(() => env.storage?.setItem(BOOT_KEY, "0"), undefined);
  try { for (const r of await env.container?.getRegistrations() ?? []) await r.unregister(); } catch { /* the browser refused: the caches below still go */ }
  try { if (env.caches) for (const name of (await env.caches.keys()).filter((k) => k.startsWith("tcm-app-"))) await env.caches.delete(name); } catch { /* nothing to delete */ }
  env.reload();
  return true;
}

/** Called after the first render: the start succeeded. */
export function bootRendered(env: Pick<BootEnv, "storage">): void {
  guarded(() => env.storage?.removeItem(BOOT_KEY), undefined);
}


/** What the boot guard works with in a browser: the storage, worker container and caches the storage layer picks, and the page's own reload. */
export function bootEnvironment(): BootEnv {
  const browser = browserEnvironment();
  return {
    storage: browser.localStorage ?? null,
    now: () => Date.now(),
    container: typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : undefined,
    caches: browser.caches ?? undefined,
    reload: () => { window.location.reload(); },
  };
}

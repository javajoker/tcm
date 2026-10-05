import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { scriptOf } from "@tcm/i18n";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { afterLoadAndIdle, createOffline, type Container, type Offline } from "./worker.ts";

/** The page's one connection to the service worker. A release build in a browser that has service workers registers it; anything else is `unsupported` and does nothing. */
export const offline: Offline = createOffline({
  container: __APP_PROFILE__ === "release" && typeof navigator !== "undefined" && "serviceWorker" in navigator ? (navigator.serviceWorker as unknown as Container) : undefined,
  whenIdle: afterLoadAndIdle,
});

/** The offline copy's state, for the screens that say it. */
export const useOfflineStatus = (): ReturnType<Offline["getStatus"]> => useSyncExternalStore(offline.subscribe, offline.getStatus);

/** Registers the worker after the page is up, and keeps the knowledge files of the script in use in the offline copy (again when the person switches between Traditional and Simplified). */
export function OfflineEffects(): ReactNode {
  const { lang } = useI18n();
  const script = scriptOf(lang);
  useEffect(() => { void offline.ensure(script); }, [script]);
  return null;
}

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { scriptOf } from "@tcm/i18n";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { bootEnvironment, bootRendered } from "./boot.ts";
import { offline as browserOffline } from "./index.ts";
import type { Offline, OfflineView } from "./worker.ts";

const OfflineContext = createContext<Offline>(browserOffline);
/** Gives the screens a different connection to the worker (the tests give them a fake one). */
export const OfflineProvider = OfflineContext.Provider;
export const useOffline = (): Offline => useContext(OfflineContext);

/** The offline copy's state, for the screens that say it. */
export function useOfflineView(): OfflineView {
  const offline = useOffline();
  return useSyncExternalStore(offline.subscribe, offline.getView);
}

/** Tells the boot guard (boot.ts) that the page got as far as its first render. */
function BootDone(): ReactNode {
  useEffect(() => { bootRendered(bootEnvironment()); }, []);
  return null;
}

/** Registers the worker after the page is up, and keeps the knowledge files of the script in use in the offline copy (again when the person switches between Traditional and Simplified). */
export function OfflineEffects(): ReactNode {
  const { lang } = useI18n();
  const offline = useOffline();
  const script = scriptOf(lang);
  useEffect(() => { void offline.ensure(script); }, [offline, script]);
  return <BootDone />;
}

import { createContext, useContext, useSyncExternalStore } from "react";
import { install as browserInstall } from "./index.ts";
import type { Install, InstallState } from "./install.ts";

const InstallContext = createContext<Install>(browserInstall);
/** Gives the screens a different connection to the browser's install offer (the tests give them a fake one). */
export const InstallProvider = InstallContext.Provider;
export const useInstall = (): Install => useContext(InstallContext);

export function useInstallState(): InstallState {
  const install = useInstall();
  return useSyncExternalStore(install.subscribe, install.getState);
}

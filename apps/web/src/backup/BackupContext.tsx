import { createContext, lazy, Suspense, useContext, useMemo, useState, type ReactNode } from "react";

// The dialogs are their own chunks (they carry the backup engine, the validators and the engine's version): the start page only needs to know how to open them.
const BackupDialog = lazy(() => import("./BackupDialog.tsx").then((m) => ({ default: m.BackupDialog })));
const RestoreDialog = lazy(() => import("./RestoreDialog.tsx").then((m) => ({ default: m.RestoreDialog })));

interface Dialogs { readonly openBackup: () => void; readonly openRestore: () => void }
const Ctx = createContext<Dialogs>({ openBackup: () => undefined, openRestore: () => undefined });

/** The two backup dialogs, once for the whole app: any screen can open them (Settings, the reminder, the quiet line on History and on a result). */
export const useBackupDialogs = (): Dialogs => useContext(Ctx);

export function BackupProvider({ children }: { children: ReactNode }): ReactNode {
  const [open, setOpen] = useState<"backup" | "restore" | null>(null);
  const value = useMemo<Dialogs>(() => ({ openBackup: () => setOpen("backup"), openRestore: () => setOpen("restore") }), []);
  return (
    <Ctx.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        {open === "backup" ? <BackupDialog onClose={() => setOpen(null)} /> : null}
        {open === "restore" ? <RestoreDialog onClose={() => setOpen(null)} /> : null}
      </Suspense>
    </Ctx.Provider>
  );
}

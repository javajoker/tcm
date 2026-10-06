// What the file sync needs from the app (PM-32), made once the sync is wanted: the store's backup source, the stamps of this build, the record of the file, the reminder's clock and the lock. A chunk of its own with
// the session and the backup engine it carries — the start page needs none of it until a file has been chosen.
import { ENGINE_VERSION } from "@tcm/engine";
import type { Loaded } from "../app/knowledge.tsx";
import { APP_BUILD, APP_PROFILE } from "../app/profile.ts";
import type { AppStore } from "../app/store.tsx";
import { FileSync, type Remembered } from "./session.ts";

/** A sync session for this app: nothing remembered (`remembered` is `null`) or a file from an earlier session. */
export function makeSync(store: AppStore, loaded: () => Loaded | null, remembered: Remembered | null): FileSync {
  return new FileSync({
    source: () => store.getState().backupSource(),
    stamps: () => ({ appVersion: APP_BUILD, kbVersion: loaded()?.kb.version ?? "unknown", engineVersion: ENGINE_VERSION, profile: loaded()?.kb.profile ?? APP_PROFILE }),
    now: () => Date.now(),
    save: async (record) => { if (record === null) await store.syncFile.clear(); else await store.syncFile.save(record); },
    written: (now) => { store.getState().setPrefs({ lastBackupAt: now }); },
    locked: () => { const l = store.getState().lock; return l === "locked" || l === "unknown"; },
  }, remembered);
}

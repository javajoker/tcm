import { DEFAULT_PREFS, LOCK_IDLE_MINUTES, TEXT_SCALES, THEMES, type Prefs } from "./types.ts";

export const PREFS_KEY = "tcm.prefs";

const isTime = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 4_102_444_800_000;
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Reads whatever is stored, keeping every valid field and defaulting the rest: a corrupt or hand-edited value never breaks the app. */
export function parsePrefs(raw: string | null): Prefs {
  if (raw === null) return DEFAULT_PREFS;
  let x: unknown;
  try { x = JSON.parse(raw); } catch { return DEFAULT_PREFS; }
  if (!isRecord(x)) return DEFAULT_PREFS;
  const ack = x["disclaimerAck"];
  return {
    ...(x["lang"] === "zh-Hant" || x["lang"] === "zh-Hans" || x["lang"] === "en" ? { lang: x["lang"] } : {}),
    theme: (THEMES as readonly unknown[]).includes(x["theme"]) ? (x["theme"] as Prefs["theme"]) : DEFAULT_PREFS.theme,
    textScale: (TEXT_SCALES as readonly unknown[]).includes(x["textScale"]) ? (x["textScale"] as Prefs["textScale"]) : DEFAULT_PREFS.textScale,
    ...(isRecord(ack) && typeof ack["version"] === "string" && typeof ack["at"] === "number" ? { disclaimerAck: { version: ack["version"], at: ack["at"] } } : {}),
    langOfferDismissed: x["langOfferDismissed"] === true,
    autoAdvance: x["autoAdvance"] !== false,
    ...(x["rememberBirthDefault"] === true ? { rememberBirthDefault: true } : {}),
    ...(typeof x["region"] === "string" && /^[A-Z]{2,5}$/.test(x["region"]) ? { region: x["region"] } : {}),
    ...(isTime(x["lastBackupAt"]) ? { lastBackupAt: x["lastBackupAt"] } : {}),
    ...(isTime(x["backupSnoozeUntil"]) ? { backupSnoozeUntil: x["backupSnoozeUntil"] } : {}),
    ...(x["backupReminder"] === false ? { backupReminder: false } : {}),
    ...((LOCK_IDLE_MINUTES as readonly unknown[]).includes(x["lockIdleMinutes"]) ? { lockIdleMinutes: x["lockIdleMinutes"] as (typeof LOCK_IDLE_MINUTES)[number] } : {}),
  };
}

export const serializePrefs = (p: Prefs): string => JSON.stringify(p);

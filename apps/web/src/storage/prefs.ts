import { AI_MODULES, DEFAULT_PREFS, LOCK_IDLE_MINUTES, ROLE_CHOICES, SEASON_BASES, SEASON_MODELS, TEXT_SCALES, THEMES, type AiConsent, type AiModule, type Prefs, type RoleChoice } from "./types.ts";

export const PREFS_KEY = "tcm.prefs";

const isTime = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 4_102_444_800_000;
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** The consents to AI help that are well formed; none → absent. */
function aiConsents(x: unknown): Prefs["ai"] | undefined {
  if (!isRecord(x)) return undefined;
  const out: Partial<Record<AiModule, AiConsent>> = {};
  for (const m of AI_MODULES) {
    const c = x[m];
    if (isRecord(c) && isTime(c["at"]) && typeof c["version"] === "string" && c["version"].length <= 40) out[m] = { at: c["at"], version: c["version"] };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A declared role that is well formed, or none. */
export function roleChoice(x: unknown): RoleChoice | undefined {
  if (!isRecord(x) || !(ROLE_CHOICES as readonly unknown[]).includes(x["role"]) || !isTime(x["at"]) || typeof x["version"] !== "string" || x["version"].length > 40) return undefined;
  return { role: x["role"] as RoleChoice["role"], at: x["at"], version: x["version"] };
}

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
    ...((SEASON_BASES as readonly unknown[]).includes(x["seasons"]) ? { seasons: x["seasons"] as (typeof SEASON_BASES)[number] } : {}),
    ...((SEASON_MODELS as readonly unknown[]).includes(x["seasonModel"]) ? { seasonModel: x["seasonModel"] as (typeof SEASON_MODELS)[number] } : {}),
    ...(aiConsents(x["ai"]) !== undefined ? { ai: aiConsents(x["ai"])! } : {}),
    ...(roleChoice(x["role"]) !== undefined ? { role: roleChoice(x["role"])! } : {}),
    ...(x["roleOffered"] === true ? { roleOffered: true } : {}),
  };
}

export const serializePrefs = (p: Prefs): string => JSON.stringify(p);

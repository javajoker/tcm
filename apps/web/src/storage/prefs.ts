import { DEFAULT_PREFS, TEXT_SCALES, THEMES, type Prefs } from "./types.ts";

export const PREFS_KEY = "tcm.prefs";

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
  };
}

export const serializePrefs = (p: Prefs): string => JSON.stringify(p);

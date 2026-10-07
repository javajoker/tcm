// Consent to AI help, per module (docs/privacy.md §2, §5; impact assessment §8). It is kept in the preferences of this device with the time and the version of the statement the person
// read; a new version of the statement asks again. It never travels in a backup (backupPrefs keeps a fixed list), and withdrawing it is one switch.
import type { AiConsent, AiModule, Prefs } from "../storage/types.ts";

/** The version of the consent statement (the dialog of AiCard): change it when the statement changes, and every person is asked again. */
export const AI_STATEMENT_VERSION = "2026-10-08";

export function consentOf(prefs: Prefs, module: AiModule): AiConsent | null {
  const c = prefs.ai?.[module];
  return c !== undefined && c.version === AI_STATEMENT_VERSION ? c : null;
}

export const withConsent = (prefs: Prefs, module: AiModule, at: number): Pick<Prefs, "ai"> => ({ ai: { ...prefs.ai, [module]: { at, version: AI_STATEMENT_VERSION } } });

export function withoutConsent(prefs: Prefs, module: AiModule): Pick<Prefs, "ai"> {
  const rest = { ...prefs.ai };
  delete rest[module];
  return { ai: rest };
}

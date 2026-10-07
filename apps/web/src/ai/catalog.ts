// The `ai` messages (AI help, PM-46). They are loaded with AI help's own code, never by i18n/catalogs.ts, so a build without AI help — every release build today — carries none of
// them. `scripts/check-i18n.ts` checks them like every other namespace.
import { createI18n, type I18n, type Lang, type Message } from "@tcm/i18n";
import en from "../i18n/en/ai.json";
import hans from "../i18n/zh-Hans/ai.json";
import zh from "../i18n/zh-Hant/ai.json";

export type AiKey = keyof typeof zh;
export type Ai = I18n<AiKey>;

export function aiI18n(lang: Lang): Ai {
  return createI18n<AiKey>({ "zh-Hant": zh as Readonly<Record<AiKey, Message>>, en, "zh-Hans": hans }, lang);
}

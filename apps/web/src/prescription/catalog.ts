// The `rx` messages (the personalised prescription, PM-41). They are loaded with the prescription's own code, never by i18n/catalogs.ts, so a build that
// cannot show a prescription (every release build today) carries none of them. `scripts/check-i18n.ts` checks them like every other namespace.
import { createI18n, type I18n, type Lang, type Message } from "@tcm/i18n";
import en from "../i18n/en/rx.json";
import hans from "../i18n/zh-Hans/rx.json";
import zh from "../i18n/zh-Hant/rx.json";

export type RxKey = keyof typeof zh;
export type Rx = I18n<RxKey>;

/** The `rx` messages in `lang`; `display` is the knowledge base's display function for Simplified text (as the app's own translator uses it). */
export function rxI18n(lang: Lang, display?: (text: string) => string): Rx {
  return createI18n<RxKey>({ "zh-Hant": zh as Readonly<Record<RxKey, Message>>, en, "zh-Hans": hans }, lang, display ? { zh: display } : {});
}

// The words of the practitioner reference (PM-65): the app's own catalogs, with the few lines that speak to the person who used the app given in the practitioner's
// voice, and the reference's own words — the `practitioner` namespace, which only the skill's script loads (no build of the app carries it). The app's renderers
// (the practitioner summary, the medication plan) then write the reference as they write the app's summary: the same model, another reader.
import { createI18n, type I18n, type Message } from "@tcm/i18n";
import { catalogs, type MessageKey } from "../i18n/catalogs.ts";
import type { T } from "../i18n/I18nProvider.tsx";
import pEn from "../i18n/en/practitioner.json";
import rxEn from "../i18n/en/rx.json";
import pZh from "../i18n/zh-Hant/practitioner.json";
import rxZh from "../i18n/zh-Hant/rx.json";
import type { Rx, RxKey } from "../prescription/catalog.ts";
import type { CaseLang } from "./case.ts";

export type PKey = keyof typeof pZh;
export type PWords = I18n<PKey>;

/** The app's lines that address the person who used the app, and the practitioner's wording of each (the same placeholders: a test checks it). */
export const VOICE: Readonly<Partial<Record<MessageKey, PKey>>> = {
  "report.change.item": "practitioner.voice.changeItem",
  "report.pract.constitution": "practitioner.voice.constitution",
  "report.pract.symptoms": "practitioner.voice.symptoms",
  "report.pract.observations": "practitioner.voice.observations",
};
export const RX_VOICE: Readonly<Partial<Record<RxKey, PKey>>> = {
  "rx.intro": "practitioner.voice.rxIntro",
  "rx.footer": "practitioner.voice.rxFooter",
  "rx.change.classical.add": "practitioner.voice.rxClassicalAdd",
  "rx.change.remove.allergy": "practitioner.voice.rxRemoveAllergy",
  "rx.change.remove.interaction": "practitioner.voice.rxRemoveInteraction",
  "rx.reason.allergy": "practitioner.voice.rxReasonAllergy",
  "rx.reason.interaction": "practitioner.voice.rxReasonInteraction",
};

const voiced = <K extends string>(base: Readonly<Partial<Record<K, Message>>>, map: Readonly<Partial<Record<K, PKey>>>, own: Readonly<Record<PKey, Message>>): Record<K, Message> =>
  ({ ...base, ...Object.fromEntries(Object.entries(map).map(([k, p]) => [k, own[p as PKey]])) }) as Record<K, Message>;

/**
 * The app's words in the practitioner's voice (`t`, `rx`) and the reference's own (`p`), in the practitioner's language. In English a name of the knowledge base keeps its
 * Chinese beside it — "Ginseng (人參)", "Spleen qi deficiency (脾氣虛)" — as a practitioner names herbs, patterns and formulas by their Chinese.
 */
export function wordsOf(lang: CaseLang): { readonly t: T; readonly rx: Rx; readonly p: PWords } {
  const zh = pZh as Readonly<Record<PKey, Message>>, en = pEn as Readonly<Record<PKey, Message>>;
  const app = createI18n<MessageKey>({ "zh-Hant": voiced<MessageKey>(catalogs["zh-Hant"], VOICE, zh), en: voiced<MessageKey>(catalogs.en, VOICE, en) }, lang);
  return {
    t: lang === "en" ? { ...app, localized: (v) => (v.en ? { text: `${v.en} (${v["zh-Hant"]})`, fellBack: false } : app.localized(v)) } : app,
    rx: createI18n<RxKey>({ "zh-Hant": voiced<RxKey>(rxZh as Record<RxKey, Message>, RX_VOICE, zh), en: voiced<RxKey>(rxEn as Partial<Record<RxKey, Message>>, RX_VOICE, en) }, lang),
    p: createI18n<PKey>({ "zh-Hant": zh, en }, lang),
  };
}

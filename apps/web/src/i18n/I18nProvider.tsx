import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { createI18n, type I18n, type Lang } from "@tcm/i18n";
import { catalogs, type MessageKey } from "./catalogs.ts";

export type T = I18n<MessageKey>;

interface Value { readonly t: T; readonly lang: Lang; readonly setLang: (lang: Lang) => void; /** The formatter of a specific language, for text that must appear in a language other than the current one (the "View in English" offer). */ readonly forLang: (lang: Lang) => T }
const Ctx = createContext<Value | null>(null);

/** Diagnostic only (dev inspector, tests): keys the English UI answered with zh-Hant text, and keys missing in both languages (prefixed "!"). */
export const i18nFallbacks = new Set<string>();

/** Provides the formatter for the current language and keeps `<html lang>` in step (accessibility, tech spec §9). The page title is set per screen by `usePageTitle`. */
export function I18nProvider({ lang, setLang, children }: { lang: Lang; setLang: (l: Lang) => void; children: ReactNode }): ReactNode {
  const formatters = useMemo(() => {
    const make = (l: Lang): T => createI18n<MessageKey>(catalogs, l, { onFallback: (k) => i18nFallbacks.add(k), onMissing: (k) => i18nFallbacks.add(`!${k}`) });
    return { "zh-Hant": make("zh-Hant"), en: make("en") } as const;
  }, []);
  const t = formatters[lang];
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo<Value>(() => ({ t, lang, setLang, forLang: (l) => formatters[l] }), [t, lang, setLang, formatters]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): Value {
  const v = useContext(Ctx);
  if (v === null) throw new Error("useI18n must be used inside <I18nProvider>");
  return v;
}

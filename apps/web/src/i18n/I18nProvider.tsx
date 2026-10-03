import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { createI18n, type I18n, type Lang } from "@tcm/i18n";
import { catalogs, type MessageKey } from "./catalogs.ts";

export type T = I18n<MessageKey>;

interface Value { readonly t: T; readonly lang: Lang; readonly setLang: (lang: Lang) => void }
const Ctx = createContext<Value | null>(null);

/** Diagnostic only (dev inspector, tests): keys the English UI answered with zh-Hant text, and keys missing in both languages (prefixed "!"). */
export const i18nFallbacks = new Set<string>();

/** Provides the formatter for the current language and keeps `<html lang>` in step (accessibility, tech spec §9). The page title is set per screen by `usePageTitle`. */
export function I18nProvider({ lang, setLang, children }: { lang: Lang; setLang: (l: Lang) => void; children: ReactNode }): ReactNode {
  const t = useMemo(() => createI18n<MessageKey>(catalogs, lang, { onFallback: (k) => i18nFallbacks.add(k), onMissing: (k) => i18nFallbacks.add(`!${k}`) }), [lang]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const value = useMemo<Value>(() => ({ t, lang, setLang }), [t, lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): Value {
  const v = useContext(Ctx);
  if (v === null) throw new Error("useI18n must be used inside <I18nProvider>");
  return v;
}

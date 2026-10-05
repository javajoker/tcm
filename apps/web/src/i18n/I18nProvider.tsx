import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createI18n, pseudoize, type I18n, type Lang, type Message, type PseudoMode } from "@tcm/i18n";
import { catalogs, loadHansCatalog, type MessageKey } from "./catalogs.ts";
import { DisplayContext } from "./display.ts";

export type T = I18n<MessageKey>;

interface Value { readonly t: T; readonly lang: Lang; readonly setLang: (lang: Lang) => void; /** The formatter of a specific language, for text that must appear in a language other than the current one (the "View in English" offer). */ readonly forLang: (lang: Lang) => T }
const Ctx = createContext<Value | null>(null);

/** Diagnostic only (dev inspector, tests): keys the English UI answered with zh-Hant text, and keys missing in both languages (prefixed "!"). */
export const i18nFallbacks = new Set<string>();

/** Provides the formatter for the current language and keeps `<html lang>` in step (accessibility, tech spec §9). The page title is set per screen by `usePageTitle`. */
export function I18nProvider({ lang, setLang, pseudo = null, children }: { lang: Lang; setLang: (l: Lang) => void; /** Dev only: a pseudo-locale transform applied to every message of the page language (docs/i18n-guide.md §8). */ pseudo?: PseudoMode | null; children: ReactNode }): ReactNode {
  // the Simplified catalogue is generated and lazy: fetched when the page language first is Simplified, and until then (or if it cannot be fetched) the source language answers, reported
  const [hans, setHans] = useState<Readonly<Partial<Record<MessageKey, Message>>> | null>(null);
  const [hansFailed, setHansFailed] = useState(false);
  useEffect(() => {
    if (lang !== "zh-Hans" || hans !== null || hansFailed) return;
    let cancelled = false;
    loadHansCatalog().then((c) => { if (!cancelled) setHans(c); }, () => { if (!cancelled) setHansFailed(true); });
    return () => { cancelled = true; };
  }, [lang, hans, hansFailed]);
  // `kb.zh` arrives with the knowledge base, after the page first renders: the formatters are made again when it does (everything below re-renders then anyway)
  const display = useContext(DisplayContext);
  const formatters = useMemo(() => {
    const cats = { ...catalogs, "zh-Hans": hans ?? {} };
    const make = (l: Lang, mode: PseudoMode | null): T => createI18n<MessageKey>(cats, l, { zh: display, onFallback: (k) => i18nFallbacks.add(k), onMissing: (k) => i18nFallbacks.add(`!${k}`), ...(__APP_PROFILE__ === "dev" && mode ? { transform: (s: string) => pseudoize(mode, s) } : {}) });
    return { "zh-Hant": make("zh-Hant", pseudo), "zh-Hans": make("zh-Hans", pseudo), en: make("en", pseudo) } as const;
  }, [pseudo, hans, display]);
  const t = formatters[lang];
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { if (pseudo) document.documentElement.dataset.pseudo = pseudo; else delete document.documentElement.dataset.pseudo; return () => { delete document.documentElement.dataset.pseudo; }; }, [pseudo]);
  const value = useMemo<Value>(() => ({ t, lang, setLang, forLang: (l) => formatters[l] }), [t, lang, setLang, formatters]);
  if (lang === "zh-Hans" && hans === null && !hansFailed) return <div role="status" aria-busy="true" />;     // a moment: the catalogue chunk is on its way
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): Value {
  const v = useContext(Ctx);
  if (v === null) throw new Error("useI18n must be used inside <I18nProvider>");
  return v;
}

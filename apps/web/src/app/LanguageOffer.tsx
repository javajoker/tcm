import { useState, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/index.ts";
import { useApp } from "./store.tsx";
import { languageOffer } from "./routing.ts";
import styles from "./AppShell.module.css";

/**
 * One-time, dismissible offer (i18n guide §1): the app opens in zh-Hant for everyone, and offers English to a browser whose first language is English, or Simplified Chinese to one whose first
 * language is zh-CN, zh-SG or zh-Hans — only while the user has not chosen a language and has not dismissed the offer. The text is in the language it offers, whatever the page language is;
 * the Simplified text lives in the zh-Hant (and en) catalogue, so that offering it does not download the Simplified catalogue.
 */
export function LanguageOffer({ languages }: { languages?: readonly string[] }): ReactNode {
  const { lang, setLang, forLang } = useI18n();
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const chooseLang = useApp((s) => s.chooseLang);
  const [langs] = useState(() => languages ?? (typeof navigator === "undefined" ? [] : navigator.languages));
  const offer = languageOffer(langs);
  if (lang !== "zh-Hant" || prefs.lang !== undefined || prefs.langOfferDismissed || offer === null) return null;
  const text = offer === "en" ? forLang("en") : forLang("zh-Hant");
  const k = (name: "text" | "action" | "dismiss"): string => text.t(offer === "en" ? `common.langOffer.${name}` : `common.langOffer.hans.${name}`);
  return (
    <div className={styles.offer} lang={offer} role="region" aria-label={offer === "en" ? forLang("en").t("common.lang.label") : forLang("zh-Hant").t("common.langOffer.hans.label")}>
      <span>{k("text")}</span>
      <Button variant="primary" onClick={() => { chooseLang(offer); setLang(offer); }}>{k("action")}</Button>
      <Button variant="ghost" onClick={() => setPrefs({ langOfferDismissed: true })}>{k("dismiss")}</Button>
    </div>
  );
}

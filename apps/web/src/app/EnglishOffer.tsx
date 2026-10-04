import { useState, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/index.ts";
import { useApp } from "./store.tsx";
import { browserPrefersEnglish } from "./routing.ts";
import styles from "./AppShell.module.css";

/**
 * One-time, dismissible offer for English browsers (i18n guide §1): the app opens in zh-Hant for everyone, and offers English only while the user has
 * not chosen a language and has not dismissed the offer. The text is in English (the language it offers), whatever the page language is.
 */
export function EnglishOffer({ languages }: { languages?: readonly string[] }): ReactNode {
  const { lang, setLang, forLang } = useI18n();
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const chooseLang = useApp((s) => s.chooseLang);
  const [langs] = useState(() => languages ?? (typeof navigator === "undefined" ? [] : navigator.languages));
  if (lang !== "zh-Hant" || prefs.lang !== undefined || prefs.langOfferDismissed || !browserPrefersEnglish(langs)) return null;
  const en = forLang("en");
  return (
    <div className={styles.offer} lang="en" role="region" aria-label={en.t("common.lang.label")}>
      <span>{en.t("common.langOffer.text")}</span>
      <Button variant="primary" onClick={() => { chooseLang("en"); setLang("en"); }}>{en.t("common.langOffer.action")}</Button>
      <Button variant="ghost" onClick={() => setPrefs({ langOfferDismissed: true })}>{en.t("common.langOffer.dismiss")}</Button>
    </div>
  );
}

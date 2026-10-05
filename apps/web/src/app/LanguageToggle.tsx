import type { ReactNode } from "react";
import type { Lang } from "@tcm/i18n";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { LANGS } from "./routing.ts";
import styles from "./AppShell.module.css";

/** 繁體 / 简体 / EN. Each button carries the `lang` of its own label so screen readers pronounce it correctly; `aria-pressed` marks the current one. */
export function LanguageToggle(): ReactNode {
  const { t, lang, setLang } = useI18n();
  return (
    <div role="group" aria-label={t.t("common.lang.label")} className={styles.langToggle}>
      {LANGS.map((l: Lang) => (
        <button key={l} type="button" lang={l} aria-pressed={l === lang} className={styles.langButton} onClick={() => { if (l !== lang) setLang(l); }}>
          {t.t(`common.lang.${l}`)}
        </button>
      ))}
    </div>
  );
}

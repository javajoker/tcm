import { useState, type ReactNode } from "react";
import { scriptOf, type Lang } from "@tcm/i18n";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useOfflineView } from "../offline/OfflineEffects.tsx";
import { LANGS } from "./routing.ts";
import styles from "./AppShell.module.css";

/**
 * 繁體 / 简体 / EN. Each button carries the `lang` of its own label so screen readers pronounce it correctly; `aria-pressed` marks the current one. Without a connection, a switch to the other
 * Chinese script whose files the offline copy does not hold yet says so instead of failing (offline design §3.5).
 */
export function LanguageToggle(): ReactNode {
  const { t, lang, setLang } = useI18n();
  const offline = useOfflineView();
  const [note, setNote] = useState<string | null>(null);
  const choose = (l: Lang): void => {
    if (l === lang) return;
    const needsConnection = typeof navigator !== "undefined" && navigator.onLine === false && offline.status !== "unsupported" && scriptOf(l) !== scriptOf(lang) && !offline.cachedScripts.includes(scriptOf(l));
    if (needsConnection) { setNote(t.t("common.offline.language", { language: t.t(`common.lang.name.${l}`) })); return; }
    setNote(null);
    setLang(l);
  };
  return (
    <>
      <div role="group" aria-label={t.t("common.lang.label")} className={styles.langToggle}>
        {LANGS.map((l: Lang) => (
          <button key={l} type="button" lang={l} aria-pressed={l === lang} className={styles.langButton} onClick={() => choose(l)}>
            {t.t(`common.lang.${l}`)}
          </button>
        ))}
      </div>
      <p aria-live="polite" className={styles.langNote}>{note}</p>
    </>
  );
}

import type { ReactNode } from "react";
import { Link } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { APP_PROFILE, IS_DEV_PROFILE } from "./profile.ts";
import { EnglishOffer } from "./EnglishOffer.tsx";
import { LanguageToggle } from "./LanguageToggle.tsx";
import { NotSavedChip } from "./NotSavedChip.tsx";
import styles from "./AppShell.module.css";

const DEV_BADGE = `DEV · ${APP_PROFILE}`;        // developer-facing text, present only in dev builds

/** Header, main landmark, permanent disclaimer footer, skip link. The dev badge exists only in dev builds (dead-code eliminated from release). */
export function AppShell({ children }: { children: ReactNode }): ReactNode {
  const { t } = useI18n();
  return (
    <>
      <a className={styles.skip} href="#main">{t.t("common.nav.skip")}</a>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link className={styles.brand} href="/">{t.t("common.app.name")}</Link>
          {IS_DEV_PROFILE ? <span className={styles.badge} data-testid="profile-badge">{DEV_BADGE}</span> : null}
          <NotSavedChip />
          <LanguageToggle />
        </div>
        <EnglishOffer />
      </header>
      <main id="main" className={styles.main} tabIndex={-1}>{children}</main>
      <footer className={styles.footer}>
        <div className={styles.footerBar}>
          <span>{t.t("common.footer.disclaimer")}</span>
        </div>
      </footer>
    </>
  );
}

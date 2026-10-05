import type { ReactNode } from "react";
import { Link } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { APP_BUILD, APP_PROFILE, IS_DEV_PROFILE } from "./profile.ts";
import { LanguageOffer } from "./LanguageOffer.tsx";
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
          {IS_DEV_PROFILE ? <Link href="/_dev" className={styles.badge} data-testid="profile-badge">{DEV_BADGE}</Link> : null}
          <NotSavedChip />
          <nav aria-label={t.t("common.nav.menu")} className={styles.menu}>
            <Link href="/history">{t.t("common.nav.history")}</Link>
            <Link href="/sources">{t.t("common.nav.sources")}</Link>
            <Link href="/settings">{t.t("common.nav.settings")}</Link>
          </nav>
          <LanguageToggle />
        </div>
        <LanguageOffer />
      </header>
      <main id="main" className={styles.main} tabIndex={-1}>{children}</main>
      <footer className={styles.footer}>
        <div className={styles.footerBar}>
          <span>{t.t("common.footer.disclaimer")}</span>
          <nav aria-label={t.t("common.footer.nav")} className={styles.footerNav}>
            <Link href="/settings#privacy">{t.t("common.footer.privacy")}</Link>
            <Link href="/sources">{t.t("common.footer.sources")}</Link>
            <span>{t.t("common.footer.version", { version: APP_BUILD })}</span>
          </nav>
        </div>
      </footer>
    </>
  );
}

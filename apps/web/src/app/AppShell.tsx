import type { ReactNode } from "react";
import { APP_PROFILE, IS_DEV_PROFILE } from "./profile.ts";
import styles from "./AppShell.module.css";

/** Header, main landmark, permanent disclaimer footer, skip link. The dev badge exists only in dev builds (dead-code eliminated from release). */
export function AppShell({ children }: { children: ReactNode }): ReactNode {
  return (
    <>
      <a className={styles.skip} href="#main">跳到主要內容</a>
      <header className={styles.header}>
        <div className={styles.bar}>
          <a className={styles.brand} href="/">中醫自我評估</a>
          {IS_DEV_PROFILE ? <span className={styles.badge} data-testid="profile-badge">DEV · {APP_PROFILE}</span> : null}
        </div>
      </header>
      <main id="main" className={styles.main} tabIndex={-1}>{children}</main>
      <footer className={styles.footer}>
        <div className={styles.footerBar}>
          <span>僅供教育參考，不是醫療診斷或處方。</span>
        </div>
      </footer>
    </>
  );
}

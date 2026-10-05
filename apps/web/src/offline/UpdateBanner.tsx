import type { ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { Button } from "../ui/index.ts";
import { useOffline, useOfflineView } from "./OfflineEffects.tsx";
import styles from "../app/AppShell.module.css";

/**
 * "A new version is ready" (docs/post-mvp/design/offline-and-install.md §3.3, §3.5): a status strip with *Reload* and *Later*. Nothing applies an update by itself — the page keeps running the build
 * it started with until the person reloads, or opens the app again. A modal notice makes the rest of the page inert, so it is not announced while one is open.
 */
export function UpdateBanner(): ReactNode {
  const { t } = useI18n();
  const offline = useOffline();
  const view = useOfflineView();
  if (view.status !== "update-ready" || view.updateDismissed) return null;
  return (
    <div className={styles.offer} role="status">
      <span>{t.t("common.offline.update.ready")}</span>
      <Button variant="primary" onClick={() => { void offline.applyUpdate(); }}>{t.t("common.offline.update.reload")}</Button>
      <Button variant="ghost" onClick={() => offline.dismissUpdate()}>{t.t("common.offline.update.later")}</Button>
    </div>
  );
}

/** A quiet line on the landing page while an update is still waiting after the strip was dismissed (one prompt at a time: the strip is the first, this the second). */
export function UpdateLine(): ReactNode {
  const { t } = useI18n();
  const offline = useOffline();
  const view = useOfflineView();
  if (view.status !== "update-ready" || !view.updateDismissed) return null;
  return <p className="muted">{t.t("common.offline.update.ready")} <Button variant="ghost" onClick={() => { void offline.applyUpdate(); }}>{t.t("common.offline.update.reload")}</Button></p>;
}

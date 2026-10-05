import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useOffline, useOfflineView } from "../../offline/OfflineEffects.tsx";
import { Button, Card } from "../../ui/index.ts";

const WORDS = { ready: "ready", preparing: "preparing", "update-ready": "updateReady", failed: "failed", removed: "removed", unsupported: "unsupported" } as const;

/** Settings → Offline use (docs/post-mvp/design/offline-and-install.md §3.5): the state of the offline copy in words, a way to load a waiting update, and a way to remove the copy. */
export function OfflineCard(): ReactNode {
  const { t } = useI18n();
  const offline = useOffline();
  const { status } = useOfflineView();
  return (
    <Card title={t.t("common.offline.card.title")} headingLevel={2} id="settings-offline">
      <p role="status">{t.t(`common.offline.status.${WORDS[status]}`)}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
        {status === "update-ready" ? <Button variant="primary" onClick={() => { void offline.applyUpdate(); }}>{t.t("common.offline.update.reload")}</Button> : null}
        {status !== "unsupported" && status !== "removed" ? <Button onClick={() => { void offline.remove(); }}>{t.t("common.offline.remove")}</Button> : null}
      </div>
      {status !== "unsupported" && status !== "removed" ? <p className="muted">{t.t("common.offline.remove.hint")}</p> : null}
    </Card>
  );
}

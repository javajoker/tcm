import { useState, type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useInstall, useInstallState } from "../../install/InstallContext.tsx";
import type { InstallOutcome } from "../../install/install.ts";
import { Button, Card } from "../../ui/index.ts";

/**
 * Settings → Install this app (docs/post-mvp/design/offline-and-install.md §3.6): the browser's own offer when it has made one — as a button, only ever on request — and, to everyone, the same
 * few words about "Add to Home Screen". Nothing here appears on a first visit, and nothing opens by itself.
 */
export function InstallCard(): ReactNode {
  const { t } = useI18n();
  const install = useInstall();
  const { installed, canPrompt } = useInstallState();
  const [outcome, setOutcome] = useState<InstallOutcome | null>(null);
  return (
    <Card title={t.t("common.install.title")} headingLevel={2} id="settings-install">
      <p role="status">
        {installed ? t.t("common.install.status.installed") : outcome === "accepted" ? t.t("common.install.status.accepted") : outcome === "dismissed" ? t.t("common.install.status.dismissed") : ""}
      </p>
      {installed ? null : (
        <>
          <p>{t.t("common.install.hint")}</p>
          {canPrompt ? <p><Button variant="primary" onClick={() => { void install.prompt().then(setOutcome); }}>{t.t("common.install.action")}</Button></p> : null}
          <p className="muted">{t.t("common.install.how")}</p>
        </>
      )}
    </Card>
  );
}

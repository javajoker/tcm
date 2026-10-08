// On the review (PM-54): when the reader should read with the study reference but it could not come (offline, a failed fetch), the result about to be made will have no quantities or medication
// plan — said before it is made, with a way to try again.
import type { ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useRetryKnowledge, useRoleByDefault, useRoleState } from "../app/knowledge.tsx";
import { Button, Notice } from "../ui/index.ts";

export function StudyUnavailable(): ReactNode {
  const { t } = useI18n();
  const state = useRoleState();
  const byDefault = useRoleByDefault();
  const retry = useRetryKnowledge();
  if (state !== "unavailable") return null;
  return (
    <Notice kind="caution" kindLabel={t.t("common.notice.caution")}>
      <p style={{ margin: 0 }}>{t.t(byDefault ? "common.settings.role.unavailableAll" : "common.settings.role.unavailable")} <Button onClick={retry}>{t.t("common.settings.role.retry")}</Button></p>
    </Notice>
  );
}

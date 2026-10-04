import type { ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { Chip, Tooltip } from "../ui/index.ts";
import { useApp } from "./store.tsx";

/** Shown while nothing can be saved (blocked storage, private window, failed write): the app still works, but the user is told plainly (privacy §3). */
export function NotSavedChip(): ReactNode {
  const { t } = useI18n();
  const status = useApp((s) => s.storage);
  if (status === "persistent") return null;
  return (
    <span data-testid="not-saved">
      <Chip tone="notice">⚠ {t.t("common.storage.notSaved")}</Chip>
      <Tooltip label={t.t("common.storage.notSavedLabel")}>{t.t("common.storage.notSavedHelp")}</Tooltip>
    </span>
  );
}

// The reading role in the header (PM-53): on every page while a learner or a practitioner reads, a link to the switch that changes it; it says when the reference could not come
// and the content shown is a general reader's.
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useRoleState } from "../app/knowledge.tsx";
import { roleOf } from "../app/role.ts";
import { useApp } from "../app/store.tsx";
import { Chip } from "../ui/index.ts";

export function RoleChip(): ReactNode {
  const { t } = useI18n();
  const role = useApp((s) => roleOf(s.prefs));
  const state = useRoleState();
  if (role === null) return null;
  return (
    <Link href="/settings#settings-role" aria-label={t.t("common.role.chip.label", { role: t.t(`common.settings.role.${role}`) })} data-testid="role-on">
      <Chip tone="notice">{t.t(`common.role.chip.${role}`)}{state === "unavailable" ? t.t("common.role.chip.unavailable") : ""}</Chip>
    </Link>
  );
}

// The reading role in the header (PM-53): on every page while a learner or a practitioner declared the role, a link to the switch that changes it; it says when the study reference could
// not come and the content shown is a general reader's. A reader who has the study reference by the build's default (PM-54) did not choose it, so the header carries no chip for them.
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useRoleState } from "../app/knowledge.tsx";
import { declaredOf } from "../app/role.ts";
import { useApp } from "../app/store.tsx";
import { Chip } from "../ui/index.ts";

export function RoleChip(): ReactNode {
  const { t } = useI18n();
  const declared = useApp((s) => declaredOf(s.prefs));
  const state = useRoleState();
  if (declared === null || declared === "general") return null;
  return (
    <Link href="/settings#settings-role" aria-label={t.t("common.role.chip.label", { role: t.t(`common.settings.role.${declared}`) })} data-testid="role-on">
      <Chip tone="notice">{t.t(`common.role.chip.${declared}`)}{state === "unavailable" ? t.t("common.role.chip.unavailable") : ""}</Chip>
    </Link>
  );
}

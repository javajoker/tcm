import type { ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { usePageTitle } from "./usePageTitle.ts";

/** Placeholder until U-06 (S01 Landing and disclaimer). */
export function Landing(): ReactNode {
  const { t } = useI18n();
  usePageTitle(null);
  return <h1>{t.t("common.app.name")}</h1>;
}

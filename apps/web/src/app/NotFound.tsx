import type { ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { LinkButton } from "../ui/index.ts";
import { usePageTitle } from "./usePageTitle.ts";

export function NotFound(): ReactNode {
  const { t } = useI18n();
  usePageTitle("common.notFound.title");
  return (
    <>
      <h1>{t.t("common.notFound.title")}</h1>
      <p>{t.t("common.notFound.body")}</p>
      <LinkButton href="/" variant="primary">{t.t("common.nav.home")}</LinkButton>
    </>
  );
}

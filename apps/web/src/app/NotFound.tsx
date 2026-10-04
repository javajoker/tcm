import type { ReactNode } from "react";
import { useRouter } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { LinkButton } from "../ui/index.ts";
import { useApp } from "./store.tsx";
import { usePageTitle } from "./usePageTitle.ts";

/** S19 404 (UX spec §4.16): a way back to the start and, when an assessment is in progress, back to where the person left off. */
export function NotFound(): ReactNode {
  const { t, lang } = useI18n();
  const router = useRouter();
  const draft = useApp((s) => s.draft);
  usePageTitle("common.notFound.title");
  // without a language segment the router has no base: the link to the flow must then carry the language itself
  const resume = draft === null ? null : router.base === "" ? `/${lang}${draft.position.route}` : draft.position.route;
  return (
    <>
      <h1>{t.t("common.notFound.title")}</h1>
      <p>{t.t("common.notFound.body")}</p>
      <p style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <LinkButton href="/" variant="primary">{t.t("common.nav.home")}</LinkButton>
        {resume !== null ? <LinkButton href={resume}>{t.t("common.notFound.resume")}</LinkButton> : null}
      </p>
    </>
  );
}

import { useId, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { useApp } from "../../app/store.tsx";
import { useDraft } from "../../app/useDraft.ts";
import { usePageTitle } from "../../app/usePageTitle.ts";
import { Button, LinkButton, Skeleton } from "../../ui/index.ts";
import { missingItems } from "./model.ts";
import { AboutCard, HealthCard, PregnancyCard } from "./ProfileCards.tsx";

/** S02 Basic profile (UX spec §4.2): the safety and scope inputs. The birth card (S03) is added to this screen by task U-08. */
export function Profile(): ReactNode {
  const { t, lang } = useI18n();
  const [, navigate] = useLocation();
  usePageTitle("intake.profile.title");
  const draft = useDraft("/start");
  const updateDraft = useApp((s) => s.updateDraft);
  const helpId = useId();
  if (draft === null) return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span><Skeleton height="2rem" width="50%" /></div>;

  const missing = missingItems(draft);
  const items = new Intl.ListFormat(lang === "en" ? "en" : "zh-Hant", { style: "long", type: "conjunction" }).format(missing.map((m) => t.t(`intake.profile.missing.${m}` as MessageKey)));
  return (
    <>
      <h1>{t.t("intake.profile.title")}</h1>
      <p>{t.t("intake.profile.intro")}</p>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <AboutCard draft={draft} change={updateDraft} />
        <PregnancyCard draft={draft} change={updateDraft} />
        <HealthCard draft={draft} change={updateDraft} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
        <LinkButton href="/">{t.t("intake.profile.saveExit")}</LinkButton>
        <Button variant="primary" disabled={missing.length > 0} aria-describedby={missing.length > 0 ? helpId : undefined} onClick={() => navigate("/screen")}>{t.t("intake.profile.continue")}</Button>
      </div>
      {missing.length > 0 ? <p id={helpId} className="muted">{t.t("intake.profile.continueHelp", { items })}</p> : null}
    </>
  );
}

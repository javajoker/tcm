import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { FlowGuard } from "../../app/FlowGuard.tsx";
import { NeedsKnowledge, useLoaded } from "../../app/knowledge.tsx";
import { useDraft } from "../../app/useDraft.ts";
import { usePageTitle } from "../../app/usePageTitle.ts";
import type { Draft } from "../../storage/types.ts";
import { Button, Card, LinkButton, Skeleton } from "../../ui/index.ts";
import { pulseIds, tongueIds } from "./model.ts";

function Hub({ draft }: { draft: Draft }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const [, navigate] = useLocation();
  const flags = kb.config.profile.tongue_pulse;
  const present = (ids: string[]): number => ids.filter((id) => draft.findings[id]?.state === "present").length;
  const touched = (ids: string[]): boolean => ids.length > 0;
  const card = (key: "tongue" | "pulse", ids: string[], href: string): ReactNode => (
    <Card title={t.t(`observe.hub.${key}`)} headingLevel={2} id={`observe-${key}`}>
      <p>{touched(ids) ? t.plural("observe.hub.status.some", present(ids) || ids.length) : t.t("observe.hub.status.none")}</p>
      <LinkButton href={href} variant={touched(ids) ? "secondary" : "primary"}>{touched(ids) ? t.t("observe.hub.edit") : t.t("observe.hub.start")}</LinkButton>
    </Card>
  );
  return (
    <>
      <h1>{t.t("observe.title")}</h1>
      <p>{t.t("observe.intro")}</p>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        {card("tongue", tongueIds(draft), "/observe/tongue")}
        {flags.pulse_input ? card("pulse", pulseIds(draft), "/observe/pulse") : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
        <LinkButton href="/inquiry">{t.t("common.action.back")}</LinkButton>
        <Button variant="primary" onClick={() => navigate("/review")}>{tongueIds(draft).length + pulseIds(draft).length > 0 ? t.t("observe.hub.continue") : t.t("observe.hub.skip")}</Button>
      </div>
    </>
  );
}

/** The observation stage (S08–S10, UX spec §4.5–4.7): tongue and pulse, each optional; the person may go on without either. */
export function Observe(): ReactNode {
  const { t } = useI18n();
  usePageTitle("observe.title");
  const draft = useDraft("/observe");
  if (draft === null) return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span><Skeleton height="2rem" width="50%" /></div>;
  return <NeedsKnowledge><FlowGuard draft={draft}><Hub draft={draft} /></FlowGuard></NeedsKnowledge>;
}

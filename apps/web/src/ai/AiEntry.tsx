// The way into the conversation (PM-47), on the module chooser of the inquiry (S06), in a build with AI help: for an adult who agreed, a card that starts — or continues — the
// conversation; for an adult who has not, one line that says AI help exists and where to turn it on. Nothing for a minor (PD-26).
import { useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useApp } from "../app/store.tsx";
import type { Draft } from "../storage/types.ts";
import { Card, LinkButton } from "../ui/index.ts";
import { AI_CONVERSATION } from "./build.ts";
import { aiI18n } from "./catalog.ts";
import { consentOf } from "./consent.ts";
import { useConversation } from "./conversation.ts";

export default function AiEntry({ draft }: { draft: Draft }): ReactNode {
  const { lang } = useI18n();
  const a = useMemo(() => aiI18n(lang), [lang]);
  const consented = useApp((s) => consentOf(s.prefs, "conversation") !== null);
  const started = useConversation((c) => c.draftId === draft.id && c.messages.length > 0);
  if (!AI_CONVERSATION || (draft.subject.ageYears ?? 0) < 18) return null;
  if (!consented) return <p className="muted">{a.t("ai.entry.offer")} <Link href="/settings#settings-ai">{a.t("ai.entry.offer.link")}</Link></p>;
  return (
    <Card title={a.t("ai.entry.title")} headingLevel={2} id="inquiry-talk">
      <p>{a.t("ai.entry.body")}</p>
      <LinkButton href="/talk" variant="primary">{started ? a.t("ai.entry.resume") : a.t("ai.entry.start")}</LinkButton>
    </Card>
  );
}

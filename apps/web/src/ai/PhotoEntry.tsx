// The way into the photo of the tongue and of the face (PM-50), on the observation stage (S08–S10), in a development build with AI help: for an adult who agreed to that module, a link
// (the tongue's, inside its card) or a card (the face's); for an adult who has not, one line that says photo help exists and where to turn it on. Nothing for a minor (PD-26).
import { useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import type { ObserveModule } from "@tcm/ai";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useApp } from "../app/store.tsx";
import type { Draft } from "../storage/types.ts";
import { Card, LinkButton } from "../ui/index.ts";
import { AI_FACE, AI_TONGUE } from "./build.ts";
import { aiI18n } from "./catalog.ts";
import { consentOf } from "./consent.ts";
import { FACE_FEATURES } from "./photo/request.ts";

export default function PhotoEntry({ module, draft }: { module: ObserveModule; draft: Draft }): ReactNode {
  const { lang } = useI18n();
  const a = useMemo(() => aiI18n(lang), [lang]);
  const consented = useApp((s) => consentOf(s.prefs, module) !== null);
  const enabled = module === "tongue" ? AI_TONGUE : AI_FACE;
  if (!enabled || (draft.subject.ageYears ?? 0) < 18) return null;
  if (module === "tongue") {
    return consented
      ? <p><LinkButton href="/observe/photo/tongue" variant="ghost">{a.t("ai.photo.entry.tongue")}</LinkButton></p>
      : <p className="muted">{a.t("ai.photo.entry.offer")} <Link href="/settings#settings-ai">{a.t("ai.entry.offer.link")}</Link></p>;
  }
  if (!consented) return null;                                    // the tongue's line already tells where to turn the photos on
  const noted = FACE_FEATURES.some((f) => draft.findings[f.id]?.state === "present");
  return (
    <Card title={a.t("ai.photo.face.card")} headingLevel={2} id="observe-face">
      <p>{a.t("ai.photo.face.card.body")}</p>
      <p className="muted">{noted ? a.t("ai.photo.face.status.some") : a.t("ai.photo.face.status.none")}</p>
      <LinkButton href="/observe/photo/face" variant={noted ? "secondary" : "primary"}>{noted ? a.t("ai.photo.face.card.again") : a.t("ai.photo.face.card.start")}</LinkButton>
    </Card>
  );
}

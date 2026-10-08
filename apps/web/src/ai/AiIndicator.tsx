// The indicator while AI help is on (PM-46; design §5): in the header of every page, a link to the switch that turns it off — on while any module is agreed to (the conversation, the
// photo of the tongue or of the face, PM-50). Only a build with AI help has it.
import { useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useApp } from "../app/store.tsx";
import { Chip } from "../ui/index.ts";
import { aiI18n } from "./catalog.ts";
import { AI_MODULES } from "../storage/types.ts";
import { consentOf } from "./consent.ts";

export default function AiIndicator(): ReactNode {
  const { lang } = useI18n();
  const a = useMemo(() => aiI18n(lang), [lang]);
  const on = useApp((s) => AI_MODULES.some((m) => consentOf(s.prefs, m) !== null));
  if (!on) return null;
  return <Link href="/settings#settings-ai" aria-label={a.t("ai.indicator.label")} data-testid="ai-on"><Chip tone="primary">{a.t("ai.indicator")}</Chip></Link>;
}

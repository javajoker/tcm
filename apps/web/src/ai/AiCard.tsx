// Settings → AI help (PM-46, PM-50; docs/post-mvp/design/ai-assisted-intake.md §5): one switch per module — the conversation, and the photo of the tongue and of the face — a statement to
// agree to before anything is sent, the state of the service once consented, and what AI help stores and sends. Only a build with AI help has this card (Settings loads it behind
// AI_ENABLED); only the modules this build has appear (the photos exist in the development profile only).
import { useMemo, useState, useEffect, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useApp } from "../app/store.tsx";
import type { AiModule } from "../storage/types.ts";
import { Card, ConfirmDialog, Tile } from "../ui/index.ts";
import { DataTable } from "../screens/result/Panel.tsx";
import { AI_CONVERSATION, AI_ENDPOINT, AI_FACE, AI_TONGUE } from "./build.ts";
import { aiI18n, type Ai, type AiKey } from "./catalog.ts";
import { serviceState, type ServiceState } from "./client.ts";
import { AI_STATEMENT_VERSION, consentOf, withConsent, withoutConsent } from "./consent.ts";
import { useConversation } from "./conversation.ts";

interface Row { readonly module: AiModule; readonly on: boolean; readonly label: AiKey; readonly hint: AiKey; readonly title: AiKey }
const ROWS: readonly Row[] = [
  { module: "conversation", on: AI_CONVERSATION, label: "ai.settings.conversation", hint: "ai.settings.conversation.hint", title: "ai.consent.title" },
  { module: "tongue", on: AI_TONGUE, label: "ai.settings.tongue", hint: "ai.settings.tongue.hint", title: "ai.consent.tongue.title" },
  { module: "face", on: AI_FACE, label: "ai.settings.face", hint: "ai.settings.face.hint", title: "ai.consent.face.title" },
];

/** Whether the gateway serves `module` now. Mounted only once the person has consented to that module, so nothing is asked of the gateway before. */
function ServiceStatus({ a, module }: { a: Ai; module: AiModule }): ReactNode {
  const [state, setState] = useState<ServiceState | null>(null);
  useEffect(() => {
    if (AI_ENDPOINT === null) return;
    const ctl = new AbortController();
    void serviceState(AI_ENDPOINT, module, ctl.signal).then((s) => { if (!ctl.signal.aborted) setState(s); });
    return () => ctl.abort();
  }, [module]);
  const key = state === null ? "ai.settings.status.checking" : state.kind === "on" ? "ai.settings.status.on" : state.kind === "off" ? "ai.settings.status.off" : "ai.settings.status.unreachable";
  // the conversation's line is the plain sentence; a photo module's names the module
  const text = module === "conversation" ? a.t(key) : a.t("ai.settings.status.for", { module: a.t(`ai.module.${module}` as AiKey), state: a.t(key) });
  return <p role="status" data-testid={module === "conversation" ? "ai-service" : `ai-service-${module}`}>{text}</p>;
}

export default function AiCard(): ReactNode {
  const { t, lang } = useI18n();
  const a = useMemo(() => aiI18n(lang), [lang]);
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const [asking, setAsking] = useState<AiModule | null>(null);
  const [withdrawn, setWithdrawn] = useState(false);
  const rows = ROWS.filter((r) => r.on);
  const photos = AI_TONGUE || AI_FACE;
  const consented = rows.filter((r) => consentOf(prefs, r.module) !== null);
  const asked = rows.find((r) => r.module === asking);

  const privacy = [
    ...(["consent"] as const).map((r) => [a.t(`ai.privacy.${r}`), a.t(`ai.privacy.${r}.where`), a.t(`ai.privacy.${r}.until`), a.t(`ai.privacy.${r}.remove`)]),
    ...(AI_CONVERSATION ? (["conversation"] as const).map((r) => [a.t(`ai.privacy.${r}`), a.t(`ai.privacy.${r}.where`), a.t(`ai.privacy.${r}.until`), a.t(`ai.privacy.${r}.remove`)]) : []),
    ...(photos ? (["photo"] as const).map((r) => [a.t(`ai.privacy.${r}`), a.t(`ai.privacy.${r}.where`), a.t(`ai.privacy.${r}.until`), a.t(`ai.privacy.${r}.remove`)]) : []),
  ];
  return (
    <Card title={a.t("ai.settings.title")} headingLevel={2} id="settings-ai">
      <p>{a.t("ai.settings.intro")}</p>
      {rows.map((r) => (
        <Tile key={r.module} type="checkbox" name={`ai-${r.module}`} value="on" checked={consentOf(prefs, r.module) !== null} label={a.t(r.label)} description={a.t(r.hint)}
          onChange={(on) => {
            if (on) setAsking(r.module);
            else {
              setPrefs(withoutConsent(prefs, r.module));
              if (r.module === "conversation") useConversation.getState().reset(null);       // the conversation goes with the consent
              setWithdrawn(true);
            }
          }} />
      ))}
      {consented.map((r) => <ServiceStatus key={`${r.module}-${consentOf(prefs, r.module)!.at}`} a={a} module={r.module} />)}
      {consented.length === 0 && withdrawn ? <p role="status">{a.t("ai.settings.off")}</p> : null}
      <p className="muted">{photos ? a.t("ai.settings.photos.note") : a.t("ai.settings.photos")}</p>
      <DataTable caption={a.t("ai.privacy.caption")} head={["what", "where", "until", "remove"].map((c) => t.t(`common.settings.privacy.col.${c}` as Parameters<typeof t.t>[0]))} rows={privacy} />

      <ConfirmDialog open={asked !== undefined} title={asked === undefined ? "" : a.t(asked.title)} confirmLabel={a.t("ai.consent.confirm")} cancelLabel={a.t("ai.consent.cancel")} danger={false}
        onCancel={() => setAsking(null)}
        onConfirm={() => { if (asked === undefined) return; setAsking(null); setWithdrawn(false); setPrefs(withConsent(prefs, asked.module, Date.now())); }}>
        {asked?.module === "conversation" ? (
          <>
            <p>{a.t("ai.consent.change")}</p>
            <ul>
              <li>{a.t("ai.consent.sent")}</li>
              <li>{a.t("ai.consent.kept")}</li>
              <li>{a.t("ai.consent.never")}</li>
              <li>{a.t("ai.consent.adults")}</li>
              <li>{a.t("ai.consent.withdraw")}</li>
            </ul>
          </>
        ) : (
          <>
            <p>{a.t("ai.consent.photo.change")}</p>
            <ul>
              <li>{a.t("ai.consent.photo.sent")}</li>
              <li>{a.t("ai.consent.photo.kept")}</li>
              <li>{a.t("ai.consent.photo.never")}</li>
              <li>{a.t("ai.consent.adults")}</li>
              <li>{a.t("ai.consent.photo.unproven")}</li>
              <li>{a.t("ai.consent.withdraw")}</li>
            </ul>
          </>
        )}
        <p className="muted">{a.t("ai.consent.version", { version: AI_STATEMENT_VERSION })}</p>
      </ConfirmDialog>
    </Card>
  );
}

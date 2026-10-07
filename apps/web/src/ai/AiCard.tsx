// Settings → AI help (PM-46; docs/post-mvp/design/ai-assisted-intake.md §5): one switch per module, a statement to agree to before anything is sent, the state of the service once
// consented, and what AI help stores and sends. Only a build with AI help has this card (Settings loads it behind AI_ENABLED).
import { useMemo, useState, useEffect, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useApp } from "../app/store.tsx";
import { Card, ConfirmDialog, Tile } from "../ui/index.ts";
import { DataTable } from "../screens/result/Panel.tsx";
import { AI_CONVERSATION, AI_ENDPOINT } from "./build.ts";
import { aiI18n, type Ai } from "./catalog.ts";
import { serviceState, type ServiceState } from "./client.ts";
import { AI_STATEMENT_VERSION, consentOf, withConsent, withoutConsent } from "./consent.ts";
import { useConversation } from "./conversation.ts";

/** Whether the gateway serves the conversation now. Mounted only once the person has consented, so nothing is asked of the gateway before. */
function ServiceStatus({ a }: { a: Ai }): ReactNode {
  const [state, setState] = useState<ServiceState | null>(null);
  useEffect(() => {
    if (AI_ENDPOINT === null) return;
    const ctl = new AbortController();
    void serviceState(AI_ENDPOINT, "conversation", ctl.signal).then((s) => { if (!ctl.signal.aborted) setState(s); });
    return () => ctl.abort();
  }, []);
  const key = state === null ? "ai.settings.status.checking" : state.kind === "on" ? "ai.settings.status.on" : state.kind === "off" ? "ai.settings.status.off" : "ai.settings.status.unreachable";
  return <p role="status" data-testid="ai-service">{a.t(key)}</p>;
}

export default function AiCard(): ReactNode {
  const { t, lang } = useI18n();
  const a = useMemo(() => aiI18n(lang), [lang]);
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const [asking, setAsking] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);
  const consent = consentOf(prefs, "conversation");

  const rows = (["consent", "conversation"] as const).map((r) => [a.t(`ai.privacy.${r}`), a.t(`ai.privacy.${r}.where`), a.t(`ai.privacy.${r}.until`), a.t(`ai.privacy.${r}.remove`)]);
  return (
    <Card title={a.t("ai.settings.title")} headingLevel={2} id="settings-ai">
      <p>{a.t("ai.settings.intro")}</p>
      {AI_CONVERSATION ? (
        <Tile type="checkbox" name="aiConversation" value="on" checked={consent !== null} label={a.t("ai.settings.conversation")} description={a.t("ai.settings.conversation.hint")}
          onChange={(on) => {
            if (on) setAsking(true);
            else { setPrefs(withoutConsent(prefs, "conversation")); useConversation.getState().reset(null); setWithdrawn(true); }       // the conversation goes with the consent
          }} />
      ) : null}
      {consent !== null ? <ServiceStatus key={consent.at} a={a} /> : withdrawn ? <p role="status">{a.t("ai.settings.off")}</p> : null}
      <p className="muted">{a.t("ai.settings.photos")}</p>
      <DataTable caption={a.t("ai.privacy.caption")} head={["what", "where", "until", "remove"].map((c) => t.t(`common.settings.privacy.col.${c}` as Parameters<typeof t.t>[0]))} rows={rows} />

      <ConfirmDialog open={asking} title={a.t("ai.consent.title")} confirmLabel={a.t("ai.consent.confirm")} cancelLabel={a.t("ai.consent.cancel")} danger={false}
        onCancel={() => setAsking(false)}
        onConfirm={() => { setAsking(false); setWithdrawn(false); setPrefs(withConsent(prefs, "conversation", Date.now())); }}>
        <p>{a.t("ai.consent.change")}</p>
        <ul>
          <li>{a.t("ai.consent.sent")}</li>
          <li>{a.t("ai.consent.kept")}</li>
          <li>{a.t("ai.consent.never")}</li>
          <li>{a.t("ai.consent.adults")}</li>
          <li>{a.t("ai.consent.withdraw")}</li>
        </ul>
        <p className="muted">{a.t("ai.consent.version", { version: AI_STATEMENT_VERSION })}</p>
      </ConfirmDialog>
    </Card>
  );
}

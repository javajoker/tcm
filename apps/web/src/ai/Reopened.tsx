// On the screening (S04), when the conversation sent the person back to it (PM-47): why the open questions are open again, and that the conversation waits.
import { useMemo, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { Notice } from "../ui/index.ts";
import { aiI18n } from "./catalog.ts";

export default function Reopened(): ReactNode {
  const { t, lang } = useI18n();
  const a = useMemo(() => aiI18n(lang), [lang]);
  return (
    <div data-testid="ai-reopened" style={{ marginBottom: "var(--space-4)" }}>
      <Notice kind="caution" kindLabel={t.t("common.notice.caution")} title={a.t("ai.reopened.title")}>
        <p style={{ margin: 0 }}>{a.t("ai.reopened.body")}</p>
      </Notice>
    </div>
  );
}

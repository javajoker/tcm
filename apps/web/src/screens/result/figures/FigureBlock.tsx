import type { ReactNode } from "react";
import { useI18n } from "../../../i18n/I18nProvider.tsx";

/** A figure with its one-sentence description above it and its table twin behind a native disclosure ("View as table"): the table is always in the page. */
export function FigureBlock({ summary, figure, table }: { summary: string; figure: ReactNode; table: ReactNode }): ReactNode {
  const { t } = useI18n();
  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
      <p style={{ marginBottom: "var(--space-2)" }}>{summary}</p>
      {figure}
      <details>
        <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", color: "var(--link)" }}>{t.t("report.figure.viewTable")}</summary>
        {table}
      </details>
    </div>
  );
}

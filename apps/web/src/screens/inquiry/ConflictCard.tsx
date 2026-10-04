import { useState, type ReactNode } from "react";
import type { Conflict } from "@tcm/engine";
import type { KnowledgeBase } from "@tcm/kb";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Button, Card, Tile } from "../../ui/index.ts";

/** The follow-up for a contradiction in the answers (SOP §5.3): never a silent pick — the user decides which one fits, or says both are true. */
export function ConflictCard({ kb, conflict, onResolve }: { kb: KnowledgeBase; conflict: Conflict; onResolve: (keep: string | "both") => void }): ReactNode {
  const { t } = useI18n();
  const [keep, setKeep] = useState<string | null>(null);
  const group = kb.exclusions.groups.find((g) => g.id === conflict.group);
  const name = (id: string): string => kb.symptoms.get(id)?.["zh-Hant"] ?? id;
  const choices = [...conflict.symptoms.map((s) => ({ value: s, label: t.t("intake.inquiry.conflict.only", { symptom: name(s) }) })), ...(conflict.kind === "conflict" ? [{ value: "both", label: t.t("intake.inquiry.conflict.both") }] : [])];
  return (
    <Card title={t.t("intake.inquiry.conflict.title")} headingLevel={2}>
      <p>{t.t("intake.inquiry.conflict.intro")}</p>
      {group ? <p><strong>{t.localized(group.reason).text}</strong></p> : null}
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "var(--space-2)" }}>
        <legend style={{ fontWeight: 600, marginBottom: "var(--space-2)" }}>{t.t("intake.inquiry.conflict.ask")}</legend>
        {choices.map((c) => <Tile key={c.value} type="radio" name="conflict" value={c.value} checked={keep === c.value} label={c.label} onChange={() => setKeep(c.value)} />)}
      </fieldset>
      <p><Button variant="primary" disabled={keep === null} onClick={() => keep !== null && onResolve(keep)}>{t.t("intake.inquiry.conflict.confirm")}</Button></p>
    </Card>
  );
}

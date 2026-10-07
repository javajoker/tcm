// The personalised prescription on the formula page (PM-41; docs/post-mvp/design/prescription-model.md §7): what the rules made of the recommended formula for
// this person — the changes and why, the composition with its quantities and what adjusted each, what to note, and why it fits. Shown as it was made when the
// result was saved. Loaded only by a build that can show it (FormulaDetail.tsx): a release build has neither this card nor its words.
import { useMemo, type ReactNode } from "react";
import type { KnowledgeBase } from "@tcm/kb";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { DataTable } from "../screens/result/Panel.tsx";
import type { SavedAssessment } from "../storage/types.ts";
import { Card, Chip } from "../ui/index.ts";
import { rxI18n } from "./catalog.ts";
import { rxView } from "./view.ts";

export default function PrescriptionCard({ saved, kb }: { saved: SavedAssessment; kb: KnowledgeBase }): ReactNode {
  const { t } = useI18n();
  const rx = useMemo(() => rxI18n(t.lang, (s) => t.zh(s)), [t]);
  const p = saved.prescription;
  if (p === undefined) return null;
  const v = rxView(p, kb, t, rx);
  return (
    <Card title={v.title} headingLevel={2} id="formula-rx">
      <p>{v.intro}</p>
      <p className="muted">{v.draft}</p>
      {v.withheld !== null ? <p><strong>{v.withheld}</strong></p> : (
        <>
          <p>{v.base}</p>
          <h3>{rx.t("rx.changes.title")}</h3>
          <ul>{v.changes.map((c) => <li key={c}>{c}</li>)}</ul>
          {v.amounts ? (
            <DataTable caption={rx.t("rx.table.caption")} head={[rx.t("rx.col.role"), rx.t("rx.col.herb"), rx.t("rx.col.grams"), rx.t("rx.col.range"), rx.t("rx.col.why")]}
              rows={v.rows.map((r) => [r.role, <span key="h">{r.herb}{r.added ? <> <Chip tone="primary">{rx.t("rx.added")}</Chip></> : null}</span>, r.grams, r.range, r.why])} />
          ) : (
            <>
              <p className="muted">{rx.t("rx.noGrams")}</p>
              <ul>{v.rows.map((r) => <li key={r.herb}>{r.role} · {r.herb}{r.added ? ` (${rx.t("rx.added")})` : ""}</li>)}</ul>
            </>
          )}
          {v.cautions.length > 0 ? (<><h3>{rx.t("rx.cautions.title")}</h3><ul>{v.cautions.map((c) => <li key={c}>{c}</li>)}</ul></>) : null}
          {v.why.length > 0 ? (<><h3>{rx.t("rx.why.title")}</h3><ul>{v.why.map((w) => <li key={w}>{w}</li>)}</ul></>) : null}
        </>
      )}
      <p className="muted">{v.footer}</p>
      <p className="muted" style={{ fontSize: "var(--font-size-small, 0.875rem)" }}>{v.version}</p>
    </Card>
  );
}

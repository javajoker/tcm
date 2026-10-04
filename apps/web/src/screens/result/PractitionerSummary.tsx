import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { formatLocal } from "../../app/format.ts";
import { NeedsKnowledge, useLoaded } from "../../app/knowledge.tsx";
import { useApp } from "../../app/store.tsx";
import { usePageTitle } from "../../app/usePageTitle.ts";
import type { SavedAssessment } from "../../storage/types.ts";
import { Button, Card, LinkButton, Skeleton } from "../../ui/index.ts";
import { DataTable } from "./Panel.tsx";
import { usePrintExpand } from "./PrintSupport.tsx";
import { buildSummary, summaryToText } from "./summaryModel.ts";
import styles from "./Result.module.css";

function Page({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t, lang } = useI18n();
  const { kb } = useLoaded();
  const [copy, setCopy] = useState<"idle" | "ok" | "failed">("idle");
  usePrintExpand();
  const sections = buildSummary(saved, kb, t);
  const m = saved.result.meta;
  const footer = `${t.t("report.print.footer")} — ${t.t("report.footer.computed", { date: formatLocal(lang, m.computedAt), kb: m.kbVersion.slice(0, 8), engine: m.engineVersion, params: m.paramsFingerprint })}`;
  const onCopy = (): void => {
    navigator.clipboard.writeText(summaryToText(t.t("report.pract.title"), t.t("report.pract.intro"), sections, footer)).then(() => setCopy("ok"), () => setCopy("failed"));
  };
  return (
    <>
      <h1>{t.t("report.pract.title")}</h1>
      <p>{t.t("report.pract.intro")}</p>
      <div className={styles.actions}>
        <Button onClick={() => window.print()}>{t.t("report.actions.print")}</Button>
        <Button onClick={onCopy}>{t.t("report.pract.copy")}</Button>
        <LinkButton href={`/result/${saved.id}`}>{t.t("report.pract.back")}</LinkButton>
      </div>
      <p role="status">{copy === "ok" ? t.t("report.pract.copied") : copy === "failed" ? t.t("report.pract.copyFailed") : null}</p>
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        {sections.map((s) => (
          <Card key={s.id} title={s.title} headingLevel={2} id={`pract-${s.id}`}>
            {s.facts ? <dl style={{ margin: 0, display: "grid", gap: "var(--space-1)" }}>{s.facts.map(([a, b]) => <div key={a} style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}><dt style={{ fontWeight: 600, minWidth: "9rem" }}>{a}</dt><dd style={{ margin: 0, fontWeight: s.prominent ? 700 : 400 }}>{b || t.t("report.pract.noneRecorded")}</dd></div>)}</dl> : null}
            {s.items ? <ul>{s.items.map((x) => <li key={x}>{x}</li>)}</ul> : null}
            {s.table ? <DataTable caption={s.table.caption} head={[...s.table.head]} rows={s.table.rows.map((r) => [...r])} /> : null}
          </Card>
        ))}
      </div>
      <footer style={{ marginTop: "var(--space-5)" }}>
        <p className="muted">{footer}</p>
      </footer>
      <div className={styles.printFooter} aria-hidden="true">{t.t("report.print.footer")}</div>
    </>
  );
}

/** The practitioner summary (UX spec §12): demographics, medicines and allergies prominent, self-reported findings with quality classes, the panel table, pattern hypotheses. */
export function PractitionerSummary({ id }: { id: string }): ReactNode {
  const { t } = useI18n();
  usePageTitle("report.pract.title");
  const loadAssessment = useApp((s) => s.loadAssessment);
  const [state, setState] = useState<{ key: string; saved: SavedAssessment | null | undefined }>({ key: id, saved: undefined });
  useEffect(() => {
    let cancelled = false;
    void loadAssessment(id).then((saved) => { if (!cancelled) setState({ key: id, saved }); });
    return () => { cancelled = true; };
  }, [id, loadAssessment]);
  const saved = state.key === id ? state.saved : undefined;
  if (saved === undefined) return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("report.loading")}</span><Skeleton height="2rem" width="50%" /></div>;
  if (saved === null) return <><h1>{t.t("report.missing.title")}</h1><p>{t.t("report.missing.body")}</p><LinkButton href="/" variant="primary">{t.t("report.missing.home")}</LinkButton></>;
  return <NeedsKnowledge><Page saved={saved} /></NeedsKnowledge>;
}

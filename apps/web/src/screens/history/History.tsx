import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ENGINE_VERSION } from "@tcm/engine";
import { BackupLine, BackupReminder } from "../../backup/Reminder.tsx";
import { FollowUpNudge } from "../../followup/FollowUpNudge.tsx";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { formatLocal } from "../../app/format.ts";
import { NeedsKnowledge, useLoaded } from "../../app/knowledge.tsx";
import { IS_DEV_PROFILE } from "../../app/profile.ts";
import { useApp } from "../../app/store.tsx";
import { usePageTitle } from "../../app/usePageTitle.ts";
import type { SavedAssessment } from "../../storage/types.ts";
import { Button, Card, Chip, ConfirmDialog, LinkButton, Skeleton, Tabs } from "../../ui/index.ts";
import { BilingualName } from "../result/shared.tsx";
import { CompareView } from "./Compare.tsx";
import { trend, trendAvailable } from "./trend.ts";

const Trends = lazy(() => import("./Trends.tsx").then((m) => ({ default: m.Trends })));

const UNDO_MS = 10_000;

function Body({ items, reload }: { items: SavedAssessment[]; reload: () => void }): ReactNode {
  const { t, lang } = useI18n();
  const { kb } = useLoaded();
  const putAssessment = useApp((s) => s.putAssessment);
  const deleteAssessment = useApp((s) => s.deleteAssessment);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [undo, setUndo] = useState<SavedAssessment | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [view, setView] = useState("results");
  const showTrends = useMemo(() => trendAvailable(trend(items)), [items]);
  const longest = useMemo(() => trend(items).longest, [items]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const when = (s: SavedAssessment): string => formatLocal(lang, s.createdAt);
  const remove = (s: SavedAssessment): void => {
    void deleteAssessment(s.id).then(() => { setSelected((x) => x.filter((id) => id !== s.id)); reload(); });
    setUndo(s);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };
  const restore = (): void => { if (undo) void putAssessment(undo).then(reload); setUndo(null); };
  const chosen = items.filter((s) => selected.includes(s.id));

  if (comparing && chosen.length === 2) return <CompareView a={chosen[0]!} b={chosen[1]!} onBack={() => setComparing(false)} />;
  if (items.length === 0 && undo === null) {
    return (
      <>
        <h1>{t.t("report.history.title")}</h1>
        <Card title={t.t("report.history.empty.title")} headingLevel={2}>
          <p>{t.t("report.history.empty.body")}</p>
          <LinkButton href="/" variant="primary">{t.t("report.history.empty.start")}</LinkButton>
        </Card>
      </>
    );
  }
  const resultsPanel = (
    <>
      <ul aria-label={t.t("report.history.list")} style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-3)" }}>
        {items.map((s) => {
          const lead = s.result.verdict.status === "established" ? kb.patternById.get(s.result.verdict.patterns[0]!.id) : undefined;
          const older = s.kbVersion !== kb.version || s.engineVersion !== ENGINE_VERSION;
          const label = when(s);
          return (
            <li key={s.id}>
              <Card>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", minHeight: 44 }}>
                  <input type="checkbox" checked={selected.includes(s.id)} disabled={!selected.includes(s.id) && selected.length >= 2} aria-label={t.t("report.history.select", { when: label })}
                    onChange={(e) => { const on = e.currentTarget.checked; setSelected((x) => (on ? [...x, s.id] : x.filter((id) => id !== s.id))); }} style={{ width: "1.4rem", height: "1.4rem" }} />
                  <strong>{label}</strong>
                </label>
                <p style={{ margin: "var(--space-2) 0" }}>{lead ? <BilingualName v={lead.name} /> : t.t("report.history.insufficient")}</p>
                <p style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                  <Chip>{t.t("report.summary.confidence")}: {t.t(`report.confidence.${s.result.verdict.confidence}` as MessageKey)}</Chip>
                  {IS_DEV_PROFILE ? <Chip tone="notice">{t.t("report.dev.level", { level: s.result.policy.level })}</Chip> : null}
                  {older ? <Chip tone="notice">{t.t("report.history.older")}</Chip> : null}
                  {s.imported ? <Chip tone="notice">{t.t("common.backup.imported")}</Chip> : null}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
                  <LinkButton href={`/result/${s.id}`}>{t.t("report.history.open")}</LinkButton>
                  <Button variant="danger" aria-label={t.t("report.history.deleteLabel", { when: label })} onClick={() => remove(s)}>{t.t("report.history.delete")}</Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        <Button variant="primary" disabled={chosen.length !== 2} aria-describedby={chosen.length === 2 ? undefined : "compare-help"} onClick={() => setComparing(true)}>{t.t("report.history.compare")}</Button>
        <Button variant="danger" onClick={() => setConfirmAll(true)}>{t.t("report.history.deleteAll")}</Button>
      </div>
      {chosen.length === 2 ? null : <p id="compare-help" className="muted">{t.t("report.history.compareHelp")}</p>}
    </>
  );
  return (
    <>
      <h1>{t.t("report.history.title")}</h1>
      <p>{t.t("report.history.intro")}</p>
      <FollowUpNudge />
      <BackupReminder />
      <BackupLine />
      {undo !== null ? (
        <p role="status"><span>{t.t("report.history.deleted")}</span> <Button variant="ghost" onClick={restore}>{t.t("report.history.undo")}</Button></p>
      ) : <p role="status" />}
      {showTrends ? (
        <Tabs label={t.t("trends.tabs.label")} value={view} onChange={setView} tabs={[
          { id: "results", label: t.t("trends.tabs.results"), panel: <>{resultsPanel}</> },
          { id: "trends", label: t.t("trends.tabs.trends"), panel: <Suspense fallback={<p role="status" aria-busy="true">{t.t("trends.loading")}</p>}><Trends items={items} /></Suspense> },
        ]} />
      ) : (
        <>
          {resultsPanel}
          {items.length >= 3 ? <p className="muted">{t.plural("trends.need", longest)}</p> : null}
        </>
      )}
      <ConfirmDialog open={confirmAll} title={t.t("report.history.deleteAll.title")} confirmLabel={t.t("report.history.deleteAll.confirm")} cancelLabel={t.t("common.action.cancel")}
        onCancel={() => setConfirmAll(false)} onConfirm={() => { setConfirmAll(false); setUndo(null); setSelected([]); void Promise.all(items.map((s) => deleteAssessment(s.id))).then(reload); }}>
        <p>{t.t("report.history.deleteAll.body")}</p>
      </ConfirmDialog>
    </>
  );
}

/** S16 History and compare (UX spec §4.13): the results saved on this device; select two to compare; delete one (with a short undo) or all. */
export function History(): ReactNode {
  const { t } = useI18n();
  usePageTitle("report.history.title");
  const listAssessments = useApp((s) => s.listAssessments);
  const [state, setState] = useState<{ items: SavedAssessment[] | null; n: number }>({ items: null, n: 0 });
  useEffect(() => {
    let cancelled = false;
    void listAssessments().then((items) => { if (!cancelled) setState((s) => ({ ...s, items })); });
    return () => { cancelled = true; };
  }, [listAssessments, state.n]);
  if (state.items === null) return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span><Skeleton height="2rem" width="50%" /></div>;
  return <NeedsKnowledge><Body items={state.items} reload={() => setState((s) => ({ ...s, n: s.n + 1 }))} /></NeedsKnowledge>;
}

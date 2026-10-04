import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { draftFromSaved } from "../../app/assessment.ts";
import { NeedsKnowledge, useLoaded } from "../../app/knowledge.tsx";
import { useApp } from "../../app/store.tsx";
import { usePageTitle } from "../../app/usePageTitle.ts";
import { randomId } from "../../storage/ids.ts";
import type { SavedAssessment } from "../../storage/types.ts";
import { Chip, LinkButton, Skeleton } from "../../ui/index.ts";
import { Advice } from "./Advice.tsx";
import { Banner } from "./Banner.tsx";
import { Summary } from "./Summary.tsx";
import { Practitioner, ReportFooter, YourData } from "./Tail.tsx";
import styles from "./Result.module.css";

type State = { readonly status: "loading" } | { readonly status: "missing" } | { readonly status: "ready"; readonly saved: SavedAssessment };

function useSaved(id: string): State {
  const loadAssessment = useApp((s) => s.loadAssessment);
  const [state, setState] = useState<{ id: string; value: State }>({ id, value: { status: "loading" } });
  useEffect(() => {
    let cancelled = false;
    void loadAssessment(id).then((saved) => { if (!cancelled) setState({ id, value: saved ? { status: "ready", saved } : { status: "missing" } }); });
    return () => { cancelled = true; };
  }, [id, loadAssessment]);
  return state.id === id ? state.value : { status: "loading" };
}

const SECTIONS = [["summary", "sec-summary"], ["advice", "sec-advice"], ["data", "sec-data"]] as const;

function Report({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const [, navigate] = useLocation();
  const adoptDraft = useApp((s) => s.adoptDraft);
  const storage = useApp((s) => s.storage);
  const answerMore = (): void => { adoptDraft(draftFromSaved(kb, saved, randomId(), Date.now())); navigate("/inquiry"); };
  return (
    <>
      <div className={styles.head}>
        <h1>{t.t("report.title")}</h1>
        <Chip tone={storage === "persistent" ? "plain" : "notice"}>{storage === "persistent" ? `✓ ${t.t("report.saved")}` : `⚠ ${t.t("report.notSaved")}`}</Chip>
      </div>
      <nav aria-label={t.t("report.nav.label")} className={styles.chips}>
        {SECTIONS.map(([k, anchor]) => <a key={k} href={`#${anchor}`} className={styles.chip}>{t.t(`report.nav.${k}` as MessageKey)}</a>)}
      </nav>
      <div className={styles.sections}>
        <Banner saved={saved} />
        <Summary saved={saved} onAnswerMore={answerMore} />
        <Advice saved={saved} />
        <Practitioner />
        <YourData saved={saved} />
      </div>
      <ReportFooter saved={saved} />
    </>
  );
}

/** S13 Result report (UX spec §4.10): the saved assessment, rendered in the page language. */
export function Result({ id }: { id: string }): ReactNode {
  const { t } = useI18n();
  usePageTitle("report.title");
  const state = useSaved(id);
  if (state.status === "loading") return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("report.loading")}</span><Skeleton height="2rem" width="50%" /><br /><Skeleton /><br /><Skeleton /></div>;
  if (state.status === "missing") {
    return (
      <>
        <h1>{t.t("report.missing.title")}</h1>
        <p>{t.t("report.missing.body")}</p>
        <LinkButton href="/" variant="primary">{t.t("report.missing.home")}</LinkButton>
      </>
    );
  }
  return <NeedsKnowledge><Report saved={state.saved} /></NeedsKnowledge>;
}

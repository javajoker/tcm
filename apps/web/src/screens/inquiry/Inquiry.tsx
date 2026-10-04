import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { NeedsKnowledge, useLoaded } from "../../app/knowledge.tsx";
import { useApp } from "../../app/store.tsx";
import { useDraft } from "../../app/useDraft.ts";
import { usePageTitle } from "../../app/usePageTitle.ts";
import type { Draft } from "../../storage/types.ts";
import { Button, Card, LinkButton, Skeleton } from "../../ui/index.ts";
import { missingItems } from "../profile/model.ts";
import { pendingNotices, unanswered } from "../screening/model.ts";
import { ConflictCard } from "./ConflictCard.tsx";
import { ModuleChooser } from "./ModuleChooser.tsx";
import { applyAnswer, pendingConflicts, pickNext, resolveConflict, selectionOf, type Answer } from "./model.ts";
import { QuestionCard } from "./QuestionCard.tsx";
import { Rail } from "./Rail.tsx";
import styles from "./Inquiry.module.css";

type View = { readonly kind: "auto" } | { readonly kind: "chooser" } | { readonly kind: "edit"; readonly index: number };

function Body({ draft }: { draft: Draft }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const [, navigate] = useLocation();
  const updateDraft = useApp((s) => s.updateDraft);
  const autoAdvance = useApp((s) => s.prefs.autoAdvance);
  const params = new URLSearchParams(useSearch());
  const back_ = params.get("back");
  const returnTo = back_ === "/review" ? back_ : null;                   // only the review may send people here to edit
  const [view, setView] = useState<View>(() => {
    const at = draft.inquiry.history.indexOf(params.get("edit") ?? "");
    return returnTo !== null && at >= 0 ? { kind: "edit", index: at } : { kind: "auto" };
  });
  const [more, setMore] = useState(false);
  const [acted, setActed] = useState(false);          // the person has moved at least once: from now on focus follows the question

  const history = draft.inquiry.history;
  const next = pickNext(kb, draft);
  const conflict = pendingConflicts(kb, draft)[0];

  const confirmModules = (modules: readonly string[]): void => {
    setActed(true); updateDraft((d) => ({ ...d, inquiry: { ...d.inquiry, modules } })); setView({ kind: "auto" }); };
  const submit = (id: string, answer: Answer): void => {
    const q = kb.questionById.get(id)!;
    setActed(true);
    updateDraft((d) => applyAnswer(d, q, answer));
    if (returnTo !== null) { navigate(returnTo); return; }               // an edit started from the review goes straight back to it
    setView((v) => (v.kind === "edit" && v.index + 1 < history.length ? { kind: "edit", index: v.index + 1 } : { kind: "auto" }));
  };
  const back = (): void => { if (returnTo !== null) { navigate(returnTo); return; } setActed(true); setView((v) => (v.kind === "edit" ? (v.index > 0 ? { kind: "edit", index: v.index - 1 } : { kind: "chooser" }) : history.length > 0 ? { kind: "edit", index: history.length - 1 } : { kind: "chooser" })); };
  const finish = (): void => navigate("/observe");          // observation (tongue, pulse) is optional; the constitution quiz (U-14) will slot in after it

  let main: ReactNode;
  if (draft.inquiry.modules === null || view.kind === "chooser") {
    main = <ModuleChooser kb={kb} draft={draft} onConfirm={confirmModules} />;
  } else if (conflict !== undefined && view.kind !== "edit") {
    main = <ConflictCard key={conflict.group} kb={kb} conflict={conflict} onResolve={(keep) => updateDraft((d) => resolveConflict(d, conflict, keep))} />;
  } else if (view.kind === "edit") {
    const q = kb.questionById.get(history[view.index]!)!;
    main = <QuestionCard key={q.id} kb={kb} question={q} initial={selectionOf(draft, q)} reason={null} modules={draft.inquiry.modules} left={next?.engine.remainingCore ?? 0} coverage={next?.engine.coverage ?? 0}
      autoAdvance={autoAdvance} canBack focusOnArrival={acted} onSubmit={(a) => submit(q.id, a)} onBack={back} />;
  } else if (next !== null && next.done !== null && !more) {
    const enough = next.done === "enough";
    main = (
      <Card title={enough ? t.t("intake.inquiry.end.enough") : t.t("intake.inquiry.end.all")} headingLevel={2}>
        <p>{enough ? t.t("intake.inquiry.end.enoughBody") : t.t("intake.inquiry.end.allBody")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
          <Button variant="primary" onClick={finish}>{t.t("intake.inquiry.end.continue")}</Button>
          {enough && next.suggestion !== null ? <Button onClick={() => setMore(true)}>{t.t("intake.inquiry.end.more")}</Button> : null}
          <Button onClick={back}>{t.t("intake.inquiry.back")}</Button>
        </div>
      </Card>
    );
  } else if (next !== null && next.suggestion !== null) {
    const q = kb.questionById.get(next.suggestion.questionId)!;
    main = <QuestionCard key={q.id} kb={kb} question={q} initial={null} reason={next.suggestion.reason} modules={draft.inquiry.modules} left={next.engine.remainingCore} coverage={next.engine.coverage}
      autoAdvance={autoAdvance} canBack focusOnArrival={acted} onSubmit={(a) => submit(q.id, a)} onBack={back} />;
  } else {
    main = <Card title={t.t("intake.inquiry.end.all")} headingLevel={2}><p>{t.t("intake.inquiry.end.allBody")}</p><Button variant="primary" onClick={finish}>{t.t("intake.inquiry.end.continue")}</Button></Card>;
  }

  const inQuestions = draft.inquiry.modules !== null && view.kind !== "chooser";
  return (
    <div className={styles.layout}>
      <div className={styles.column}>
        {inQuestions ? <h1 className="visually-hidden">{t.t("intake.inquiry.title")}</h1> : null}
        {main}
        {inQuestions ? <p style={{ marginTop: "var(--space-5)" }}><LinkButton href="/" variant="ghost">{t.t("intake.profile.saveExit")}</LinkButton></p> : null}
      </div>
      {inQuestions ? <Rail kb={kb} draft={draft} /> : null}
    </div>
  );
}

/** S06/S07 Inquiry (UX spec §4.4). Needs a complete profile and a finished screening; otherwise it sends the person back to them. */
export function Inquiry(): ReactNode {
  const { t } = useI18n();
  usePageTitle("intake.inquiry.title");
  const draft = useDraft("/inquiry");
  const [, navigate] = useLocation();
  const incomplete = draft !== null && missingItems(draft).length > 0;
  useEffect(() => { if (incomplete) navigate("/start", { replace: true }); }, [incomplete, navigate]);
  if (draft === null || incomplete) return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span><Skeleton height="2rem" width="50%" /></div>;
  return <NeedsKnowledge><Guarded draft={draft} /></NeedsKnowledge>;
}

/** The screening must be finished and its blocking notices acknowledged before the questions start. */
function Guarded({ draft }: { draft: Draft }): ReactNode {
  const { kb } = useLoaded();
  const [, navigate] = useLocation();
  const screening = unanswered(kb, draft).length > 0 || pendingNotices(kb, draft).length > 0;
  useEffect(() => { if (screening) navigate("/screen", { replace: true }); }, [screening, navigate]);
  return screening ? null : <Body draft={draft} />;
}

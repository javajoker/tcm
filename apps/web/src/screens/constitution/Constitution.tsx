import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { FlowGuard } from "../../app/FlowGuard.tsx";
import { NeedsKnowledge, useLoaded } from "../../app/knowledge.tsx";
import { useApp } from "../../app/store.tsx";
import { useDraft } from "../../app/useDraft.ts";
import { usePageTitle } from "../../app/usePageTitle.ts";
import type { Draft } from "../../storage/types.ts";
import { Button, ChoiceGroup, LinkButton, Progress, Skeleton } from "../../ui/index.ts";
import { answeredCount, cleared, pages, quizItems, withAnswer } from "./model.ts";

function Quiz({ draft }: { draft: Draft }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const [, navigate] = useLocation();
  const updateDraft = useApp((s) => s.updateDraft);
  const items = quizItems(kb);
  const all = pages(items);
  const [page, setPage] = useState(0);
  const last = page === all.length - 1;
  const scale = kb.constitutionItems.scale;
  return (
    <>
      <h1>{t.t("constitution.title")}</h1>
      <p>{t.t("constitution.intro")}</p>
      <p className="muted" style={{ margin: 0 }}>{t.t("constitution.page", { n: page + 1, total: all.length })} · {t.plural("constitution.answered", answeredCount(draft), { total: items.length })}</p>
      <Progress value={(page + 1) / all.length} name={t.t("constitution.title")} label={t.t("constitution.page", { n: page + 1, total: all.length })} />
      <p style={{ marginTop: "var(--space-4)" }}><strong>{t.localized(kb.constitutionItems.prompt).text}</strong></p>
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        {all[page]!.map((item) => (
          <ChoiceGroup key={item.id} legend={t.localized(item.text).text} inline value={draft.constitutionAnswers[item.id] === undefined ? null : String(draft.constitutionAnswers[item.id])}
            options={scale.map((s) => ({ value: String(s.value), label: t.localized(s.label).text }))} onChange={(v) => updateDraft((d) => withAnswer(d, item.id, Number(v)))} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
        <Button onClick={() => (page === 0 ? navigate("/observe") : setPage(page - 1))}>{t.t("constitution.prev")}</Button>
        {last ? <Button variant="primary" onClick={() => navigate("/observe")}>{t.t("constitution.done")}</Button> : <Button variant="primary" onClick={() => setPage(page + 1)}>{t.t("constitution.next")}</Button>}
        {answeredCount(draft) > 0 ? <Button variant="ghost" onClick={() => updateDraft(cleared)}>{t.t("constitution.clear")}</Button> : null}
        <LinkButton href="/observe" variant="ghost">{t.t("constitution.skip")}</LinkButton>
      </div>
      <p className="muted">{t.t("constitution.skipHelp")}</p>
    </>
  );
}

/** S11 Constitution questionnaire (UX spec §4.8): our own items on a 1–5 frequency scale, five per page, interleaved across the nine types; skippable as a whole; the result is a tendency. */
export function Constitution(): ReactNode {
  const { t } = useI18n();
  usePageTitle("constitution.title");
  const draft = useDraft("/observe");
  if (draft === null) return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span><Skeleton height="2rem" width="50%" /></div>;
  return <NeedsKnowledge><FlowGuard draft={draft}><Quiz draft={draft} /></FlowGuard></NeedsKnowledge>;
}

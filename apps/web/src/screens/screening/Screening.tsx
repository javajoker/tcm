import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { NeedsKnowledge, useLoaded } from "../../app/knowledge.tsx";
import { useApp } from "../../app/store.tsx";
import { useDraft } from "../../app/useDraft.ts";
import { usePageTitle } from "../../app/usePageTitle.ts";
import type { Draft, RedFlagAnswer } from "../../storage/types.ts";
import { Button, Card, Chip, ConfirmDialog, LinkButton, SegmentedControl, Skeleton } from "../../ui/index.ts";
import { askedItems, answerOf, needsCorrectionConfirm, pendingNotices, profileSituations, unanswered, withAcknowledged, withAnswer } from "./model.ts";
import { NoticeScreen } from "./NoticeScreen.tsx";

const ANSWERS: readonly RedFlagAnswer[] = ["no", "yes", "unsure"];

function Body({ draft }: { draft: Draft }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const [, navigate] = useLocation();
  const updateDraft = useApp((s) => s.updateDraft);
  const [confirm, setConfirm] = useState<{ id: string } | null>(null);
  const [showing, setShowing] = useState(false);

  const { A, B } = askedItems(kb);
  const missing = unanswered(kb, draft);
  const pending = pendingNotices(kb, draft);
  const options = ANSWERS.map((v) => ({ value: v, label: t.t(`intake.screen.answer.${v}`) }));

  const answer = (id: string, next: RedFlagAnswer): void => {
    if (needsCorrectionConfirm(draft, id, next)) { setConfirm({ id }); return; }
    updateDraft((d) => withAnswer(d, id, next));
  };
  const allNo = (ids: readonly string[]): void => updateDraft((d) => ids.reduce((acc, id) => (answerOf(acc, id) === null ? withAnswer(acc, id, "no") : acc), d));
  const proceed = (): void => { if (pending.length > 0) setShowing(true); else navigate("/inquiry"); };
  const acknowledge = (): void => { const at = Date.now(); updateDraft((d) => withAcknowledged(d, pending, at)); setShowing(false); navigate("/inquiry"); };

  const group = (key: "A" | "B", items: typeof A): ReactNode => (
    <Card title={t.t(`intake.screen.group${key}.title`)} id={`screen-${key}`}>
      <p className="muted">{t.t(`intake.screen.group${key}.hint`)}</p>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        {items.map((f) => (
          <SegmentedControl key={f.id} legend={t.localized(f.text).text} value={answerOf(draft, f.id)} options={options} onChange={(v) => answer(f.id, v)} />
        ))}
      </div>
      <p><Button onClick={() => allNo(items.map((f) => f.id))}>{t.t("intake.screen.noneOfThese")}</Button></p>
    </Card>
  );

  const situations = profileSituations(draft);
  return (
    <>
      <h1>{t.t("intake.screen.title")}</h1>
      <p>{t.t("intake.screen.intro")}</p>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        {group("A", A)}
        {group("B", B)}
        <Card title={t.t("intake.screen.profile.title")} id="screen-C">
          <p className="muted">{t.t("intake.screen.profile.hint")}</p>
          {situations.length > 0 ? (
            <p style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {situations.map((id) => { const f = kb.redFlags.find((x) => x.id === id); return <Chip key={id} tone="notice">{f ? t.localized(f.text).text : id}</Chip>; })}
            </p>
          ) : <p>{t.t("intake.screen.profile.none")}</p>}
          <LinkButton href="/start">{t.t("intake.screen.profile.edit")}</LinkButton>
        </Card>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
        <LinkButton href="/start">{t.t("common.action.back")}</LinkButton>
        <Button variant="primary" disabled={missing.length > 0} aria-describedby={missing.length > 0 ? "screen-help" : undefined} onClick={proceed}>{t.t("common.action.continue")}</Button>
      </div>
      {missing.length > 0 ? <p id="screen-help" className="muted">{t.plural("intake.screen.help", missing.length)}</p> : null}

      <ConfirmDialog open={confirm !== null} title={t.t("intake.screen.correct.title")} confirmLabel={t.t("intake.screen.correct.confirm")} cancelLabel={t.t("common.action.cancel")}
        onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm) updateDraft((d) => withAnswer(d, confirm.id, "no", { corrected: true })); setConfirm(null); }}>
        <p>{t.t("intake.screen.correct.body")}</p>
      </ConfirmDialog>
      <NoticeScreen kb={kb} draft={draft} notices={showing ? pending : []} onAcknowledge={acknowledge} />
    </>
  );
}

/** S04 Red-flag screening (UX spec §4.3). The items come from the knowledge base; every one must be answered, and "not sure" counts as yes. */
export function Screening(): ReactNode {
  const { t } = useI18n();
  usePageTitle("intake.screen.title");
  const draft = useDraft("/screen");
  if (draft === null) return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span><Skeleton height="2rem" width="50%" /></div>;
  return <NeedsKnowledge><Body draft={draft} /></NeedsKnowledge>;
}

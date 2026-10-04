import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { useApp } from "../../app/store.tsx";
import type { SavedAssessment } from "../../storage/types.ts";
import { Button, Card, ConfirmDialog, SegmentedControl, Tile } from "../../ui/index.ts";
import { downloadJson } from "./exportInputs.ts";
import { feedbackExport, feedbackFileName, MARKS, RESULT_KEY, withMark, type Mark, type Marks } from "./feedbackModel.ts";
import styles from "./Result.module.css";

interface Feedback { readonly marks: Marks; readonly set: (key: string, mark: Mark | null) => void }
const FeedbackContext = createContext<Feedback | null>(null);

/** Holds the marks of one saved result: every change is written to the stored assessment at once (they never leave the device). */
export function FeedbackProvider({ saved, children }: { saved: SavedAssessment; children: ReactNode }): ReactNode {
  const putAssessment = useApp((s) => s.putAssessment);
  const [marks, setMarks] = useState<Marks>(saved.feedback ?? {});
  const set = useCallback((key: string, mark: Mark | null): void => {
    const next = withMark(marks, key, mark);
    setMarks(next);
    void putAssessment({ ...saved, feedback: next });
  }, [marks, putAssessment, saved]);
  const value = useMemo(() => ({ marks, set }), [marks, set]);
  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

/** "Did this match your experience?" for one item. Renders nothing outside a provider (e.g. in the printed summary). */
export function FeedbackMarks({ itemKey, label }: { itemKey: string; label: string }): ReactNode {
  const { t } = useI18n();
  const fb = useContext(FeedbackContext);
  if (fb === null) return null;
  const current = fb.marks[itemKey] ?? null;
  return (
    <div className={styles.feedback} data-noprint data-testid={`feedback-${itemKey}`}>
      <SegmentedControl legend={<>{t.t("feedback.question")}<span className="visually-hidden"> — {label}</span></>} value={current} onChange={(m) => fb.set(itemKey, m)}
        options={MARKS.map((m) => ({ value: m, label: t.t(`feedback.mark.${m}` as MessageKey) }))} />
      {current !== null ? <Button variant="ghost" onClick={() => fb.set(itemKey, null)}>{t.t("feedback.clear")}<span className="visually-hidden"> — {label}</span></Button> : null}
    </div>
  );
}

/** The feedback card at the end of the report: the mark for the result as a whole, and the explicit export. */
export function FeedbackCard({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const fb = useContext(FeedbackContext);
  const [open, setOpen] = useState(false);
  const [withAnswers, setWithAnswers] = useState(false);
  if (fb === null) return null;
  const n = Object.keys(fb.marks).length;
  const close = (): void => { setOpen(false); setWithAnswers(false); };
  return (
    <div data-noprint>
      <Card title={t.t("feedback.card.title")} id="sec-feedback">
        <p className="muted">{t.t("feedback.card.body")}</p>
        <FeedbackMarks itemKey={RESULT_KEY} label={t.t("feedback.result")} />
        <p role="status">{n > 0 ? t.plural("feedback.card.count", n) : null}</p>
        <Button onClick={() => setOpen(true)} disabled={n === 0}>{t.t("feedback.export")}</Button>
      </Card>
      <ConfirmDialog open={open} title={t.t("feedback.export.title")} confirmLabel={t.t("feedback.export.confirm")} cancelLabel={t.t("common.action.cancel")} danger={false}
        onCancel={close} onConfirm={() => { downloadJson(feedbackFileName(saved), feedbackExport(saved, fb.marks, withAnswers)); close(); }}>
        <p>{t.t("feedback.export.warning")}</p>
        <Tile type="checkbox" name="feedback-answers" value="answers" checked={withAnswers} onChange={setWithAnswers} label={t.t("feedback.export.answers")} description={t.t("feedback.export.answers.hint")} />
      </ConfirmDialog>
    </div>
  );
}

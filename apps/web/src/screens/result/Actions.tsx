import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useApp } from "../../app/store.tsx";
import type { SavedAssessment } from "../../storage/types.ts";
import { Button, ConfirmDialog, LinkButton } from "../../ui/index.ts";
import { downloadJson, exportFileName, inputsExport } from "./exportInputs.ts";
import styles from "./Result.module.css";

/** The result's actions (UX spec §4.10): print, practitioner summary, export my inputs (with a warning), compare, start anew, delete. Saving is automatic. */
export function Actions({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const deleteAssessment = useApp((s) => s.deleteAssessment);
  const [dialog, setDialog] = useState<null | "export" | "delete">(null);
  const close = (): void => setDialog(null);
  return (
    <>
      <div role="group" aria-label={t.t("report.actions.label")} className={styles.actions}>
        <Button onClick={() => window.print()}>{t.t("report.actions.print")}</Button>
        <LinkButton href={`/result/${saved.id}/summary`}>{t.t("report.actions.summary")}</LinkButton>
        <Button onClick={() => setDialog("export")}>{t.t("report.actions.export")}</Button>
        <LinkButton href="/history">{t.t("report.actions.history")}</LinkButton>
        <LinkButton href="/">{t.t("report.actions.new")}</LinkButton>
        <Button variant="danger" onClick={() => setDialog("delete")}>{t.t("report.actions.delete")}</Button>
      </div>
      <ConfirmDialog open={dialog === "export"} title={t.t("report.export.title")} confirmLabel={t.t("report.export.confirm")} cancelLabel={t.t("common.action.cancel")} danger={false}
        onCancel={close} onConfirm={() => { close(); downloadJson(exportFileName(saved), inputsExport(saved)); }}><p>{t.t("report.export.warning")}</p></ConfirmDialog>
      <ConfirmDialog open={dialog === "delete"} title={t.t("report.actions.delete.title")} confirmLabel={t.t("report.actions.delete.confirm")} cancelLabel={t.t("common.action.cancel")}
        onCancel={close} onConfirm={() => { close(); void deleteAssessment(saved.id).then(() => navigate("/history")); }}><p>{t.t("report.actions.delete.body")}</p></ConfirmDialog>
    </>
  );
}

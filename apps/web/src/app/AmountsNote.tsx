// N-AMOUNTS (safety policy §4.2; the owner's decision PD-30): beside every table of reference quantities and every medication plan — on the formula page, in the plan, in the practitioner
// summary and its file, on the Learn formula page — that they are for study and as an aid to a practitioner only, not instructions for taking medicine.
import type { ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { Notice } from "../ui/index.ts";

export function AmountsNote(): ReactNode {
  const { t } = useI18n();
  return (
    <div data-testid="amounts-note">
      <Notice kind="caution" kindLabel={t.t("common.notice.caution")}><p style={{ margin: 0 }}>{t.t("safety.notice.amounts.text")}</p></Notice>
    </div>
  );
}

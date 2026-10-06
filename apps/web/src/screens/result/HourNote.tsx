import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { SavedAssessment } from "../../storage/types.ts";

/**
 * When the birth time was near a change of hour (five-phase design §5): which hour the birth chart of this result was made from — the computed one, the other as the person chose, or none. Only the choice is
 * kept with a result, never the time, so the sentence is the whole explanation; and it says so in the same words whether or not the birth data itself was remembered.
 */
export function HourNote({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  if (saved.hour === undefined || saved.result.reference?.birth.used !== true) return null;
  return <p id="hour-note">{t.t(`report.panel.hour.${saved.hour}`)}</p>;
}

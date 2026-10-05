// Parameters and keys of the notice catalogue (`safety.notice.<slug>.*`, generated from the safety policy), shared by the blocking screen (S05) and the
// result banner so a notice reads the same wherever it appears.
import type { NoticeRequest } from "@tcm/engine";
import type { KnowledgeBase } from "@tcm/kb";
import type { T } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { emergencyNumberText } from "./EmergencyNumbers.tsx";

/** Notice id → key stem. Equal to `SLUG` of scripts/sync-notices.ts (a test keeps them so). */
export const NOTICE_SLUG: Readonly<Record<string, string>> = {
  "N-A": "a", "N-B": "b", "N-MINOR": "minor", "N-PREG": "pregnancy", "N-LACT": "lactation", "N-SERIOUS": "serious", "N-ELDERLY": "elderly", "N-MED": "medication",
  "N-MED-UNKNOWN": "medicationUnknown", "N-ALLERGY": "allergy", "N-ALLERGY-UNKNOWN": "allergyUnknown", "N-ACUTE": "acute", "N-LOWCONF": "lowConfidence", "N-CONFLICT": "conflict",
  "N-SUPPRESSED": "suppressed", "N-SELFOBS": "selfObserved", "N-PULSE-EDU": "pulseEducation", "N-BIRTH": "birth", "N-DRAFT": "draft", "N-TIERC": "tierC", "N-FORMULA": "formula",
};

export interface NoticeContext {
  readonly kb: KnowledgeBase;
  readonly t: T;
  readonly region: string;
  /** Red-flag answers of the screening (an "unsure" item is labelled as such in the reason). */
  readonly answers: Readonly<Record<string, string>>;
  readonly allergies: readonly string[];
  /** The profile removes (suppress_hard) or only marks (annotate_only) what a rule fires on. */
  readonly enforcement: "suppress_hard" | "annotate_only";
}

const list = (t: T, items: readonly string[]): string => new Intl.ListFormat(t.lang === "en" ? "en" : "zh-Hant", { style: "long", type: "conjunction" }).format(items);

export function noticeParams(c: NoticeContext, n: Pick<NoticeRequest, "id" | "reasons">): Record<string, string> {
  const { kb, t } = c;
  const flag = (id: string): string => {
    const f = kb.redFlags.find((x) => x.id === id);
    const base = f ? t.localized(f.text).text : id;
    return c.answers[id] === "unsure" ? `${base}${t.t("intake.screen.unsureTag")}` : base;
  };
  return {
    reason: list(t, n.reasons.map(flag)),
    emergency_number: emergencyNumberText(kb, c.region, t.t("safety.emergency.local")),
    class: list(t, n.reasons.map((m) => t.t(`intake.profile.meds.${m}` as MessageKey))),
    removed_or_marked: t.t(c.enforcement === "suppress_hard" ? "safety.value.removed" : "safety.value.marked"),
    allergen: list(t, c.allergies.map((a) => t.zh(a))),
  };
}

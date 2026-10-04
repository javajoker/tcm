// The message catalogs (docs/i18n-guide.md §3). zh-Hant is the SOURCE catalog and defines the key union; en mirrors it.
// One JSON file per namespace and language; `scripts/check-i18n.ts` (task I-03) enforces key, placeholder and plural parity.
import type { Message } from "@tcm/i18n";
import zhCommon from "./zh-Hant/common.json";
import zhConstitution from "./zh-Hant/constitution.json";
import zhErrors from "./zh-Hant/errors.json";
import zhFeedback from "./zh-Hant/feedback.json";
import zhFormula from "./zh-Hant/formula.json";
import zhInquiry from "./zh-Hant/inquiry.json";
import zhIntake from "./zh-Hant/intake.json";
import zhObserve from "./zh-Hant/observe.json";
import zhReport from "./zh-Hant/report.json";
import zhSafety from "./zh-Hant/safety.json";
import enCommon from "./en/common.json";
import enConstitution from "./en/constitution.json";
import enErrors from "./en/errors.json";
import enFeedback from "./en/feedback.json";
import enFormula from "./en/formula.json";
import enInquiry from "./en/inquiry.json";
import enIntake from "./en/intake.json";
import enObserve from "./en/observe.json";
import enReport from "./en/report.json";
import enSafety from "./en/safety.json";

export const NAMESPACES = ["common", "intake", "inquiry", "observe", "constitution", "report", "feedback", "formula", "safety", "errors"] as const;

const zhHant = { ...zhCommon, ...zhIntake, ...zhInquiry, ...zhObserve, ...zhConstitution, ...zhReport, ...zhFeedback, ...zhFormula, ...zhSafety, ...zhErrors };
const en = { ...enCommon, ...enIntake, ...enInquiry, ...enObserve, ...enConstitution, ...enReport, ...enFeedback, ...enFormula, ...enSafety, ...enErrors };

export type MessageKey = keyof typeof zhHant;

export const catalogs: { readonly "zh-Hant": Readonly<Record<MessageKey, Message>>; readonly en: Readonly<Partial<Record<MessageKey, Message>>> } = { "zh-Hant": zhHant as Record<MessageKey, Message>, en };

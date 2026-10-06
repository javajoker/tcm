// Words for the trend: the names of the rows and of their bands, taken from the result page's own catalogue so the two say the same thing.
import type { T } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { ELEMENT_SLUG, SEASON_SLUG, type Level5 } from "../result/words.ts";
import type { RowKey } from "./trend.ts";

const k = (key: string): MessageKey => key as MessageKey;

export const rowName = (t: T, row: RowKey): string => (row === "coldHeat" || row === "deficiencyExcess" ? t.t(k(`report.panel.axis.${row}`)) : t.t(k(`report.element.${ELEMENT_SLUG[row]}`)));
/** A band in words: *low … high* for a phase, *cold … hot* and *deficient … excess* for the axes. */
export const rowBandWord = (t: T, row: RowKey, band: Level5): string => (row === "coldHeat" || row === "deficiencyExcess" ? t.t(k(`report.axis.${row}.${band}`)) : t.t(k(`report.level.${band}`)));
export const seasonName = (t: T, name: string): string => (name in SEASON_SLUG ? t.t(k(`report.season.${SEASON_SLUG[name as keyof typeof SEASON_SLUG]}`)) : t.zh(name));

import type { ReactNode } from "react";
import { Link } from "wouter";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import type { SavedAssessment } from "../../storage/types.ts";
import { SEASON_SLUG } from "./words.ts";

/**
 * The season of a result and the basis it was counted on (five-phase design §4.2): *Season: spring (northern calendar)*, or that seasons were left out, with a link to the choice; and, when there is a
 * season, the season model the school choice behind it (§7) — declared in one line, with a plain explanation one click away. Both are the ones stamped on the result when it was made — a result is explained
 * as it was made, whatever the device says today.
 */
export function SeasonLine({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const ref = saved.result.reference;
  if (ref === null) return null;
  const basis = saved.result.meta.seasons ?? "north";
  const name = ref.panel.season.name;
  const season = name in SEASON_SLUG ? t.t(`report.season.${SEASON_SLUG[name as keyof typeof SEASON_SLUG]}` as MessageKey) : t.zh(name);
  const model = saved.result.meta.seasonModel === "tuwang18" ? "tuwang18" : "changxia";
  return (
    <>
      <p id="season-basis">
        {basis === "off" ? t.t("report.season.basis.off") : t.t(`report.season.basis.${basis}` as MessageKey, { season })}{" "}
        <Link data-noprint href="/settings#settings-seasons">{t.t("report.season.basis.link")}</Link>
      </p>
      {basis === "off" ? null : (
        <div id="season-model">
          <p style={{ margin: 0 }}>{t.t(`report.season.model.${model}`, { zh: t.zh(model === "changxia" ? "長夏" : "土旺") })}</p>
          <details>
            <summary>{t.t("report.season.model.more")}</summary>
            <p>{t.t(`report.season.model.explain.${model}`)}</p>
          </details>
        </div>
      )}
    </>
  );
}

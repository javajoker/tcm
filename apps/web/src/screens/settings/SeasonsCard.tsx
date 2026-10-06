import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { useApp } from "../../app/store.tsx";
import { defaultSeasons, deviceTimeZone, effectiveSeasons } from "../../app/seasons.ts";
import { SEASON_BASES } from "../../storage/types.ts";
import { Card, SegmentedControl } from "../../ui/index.ts";

/**
 * Settings → Seasons (five-phase design §4.2): how the season of a result is counted — by the northern calendar, by the southern one, or not at all. The model knows the calendar and this choice, not the
 * climate where a person is, and says so beside the choice. Until the person chooses, the device's time zone suggests one of the first two and the card says that it is only a suggestion.
 */
export function SeasonsCard(): ReactNode {
  const { t } = useI18n();
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const zone = deviceTimeZone();
  const effective = effectiveSeasons(prefs, zone);
  const word = (k: string): string => t.t(`common.settings.seasons.${k}` as MessageKey);
  return (
    <Card title={t.t("common.settings.seasons.title")} headingLevel={2} id="settings-seasons">
      <p>{t.t("common.settings.seasons.intro")}</p>
      <SegmentedControl legend={t.t("common.settings.seasons.title")} hideLegend value={effective} onChange={(v) => setPrefs({ seasons: v })} options={SEASON_BASES.map((v) => ({ value: v, label: word(v) }))} />
      <p className="muted" style={{ margin: 0 }}>{word(`${effective}.hint`)}</p>
      {prefs.seasons === undefined ? <p className="muted" style={{ margin: 0 }}>{t.t("common.settings.seasons.suggested", { basis: word(`basis.${defaultSeasons(zone)}`) })}</p> : null}
      <p className="muted" style={{ margin: 0 }}>{t.t("common.settings.seasons.note")}</p>
    </Card>
  );
}

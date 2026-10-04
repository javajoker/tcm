import type { ReactNode } from "react";
import { ELEMENTS, type Element } from "@tcm/wuxing";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { CitationChip } from "../../app/citations.tsx";
import type { SavedAssessment } from "../../storage/types.ts";
import { Card } from "../../ui/index.ts";
import { ELEMENT_SLUG, LIUXIE_SLUG, RULE_SLUG, SEASON_SLUG } from "./words.ts";

const MAX_RULES = 3;

/** ⑤ Transmission and susceptibility: tendency-worded notes from 生克乘侮 and 母子, and the next seasons when a reference exists. Never a diagnosis. */
export function Transmission({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const a = saved.result;
  const element = (e: Element): string => t.t(`report.element.${ELEMENT_SLUG[e]}` as MessageKey);
  const rules = a.panel.transmission.rules.slice(0, MAX_RULES);
  const forecast = a.reference?.forecast ?? [];
  const sus = a.constitution?.susceptibility ?? null;
  const evilName = (e: keyof typeof LIUXIE_SLUG): string => t.t(`report.liuxie.${LIUXIE_SLUG[e]}` as MessageKey);
  const seasonName = (n: string): string => (n in SEASON_SLUG ? t.t(`report.season.${SEASON_SLUG[n as keyof typeof SEASON_SLUG]}` as MessageKey) : n);
  const line = (s: { season: string; items: readonly { evil: keyof typeof LIUXIE_SLUG }[] }, key: string): ReactNode => (
    <li key={key}>{s.items.length > 0
      ? t.t("report.constitution.susceptible", { season: seasonName(s.season), evil: s.items.map((i) => evilName(i.evil)).join(t.lang === "en" ? ", " : "、") })
      : t.t("report.constitution.none.season", { season: seasonName(s.season) })}</li>
  );
  return (
    <Card title={t.t("report.transmission.title")} id="sec-transmission">
      <p className="muted">{t.t("report.transmission.intro")}</p>
      {rules.length === 0 ? <p>{t.t("report.transmission.none")}</p> : (
        <ul>
          {rules.map((r) => (
            <li key={`${r.rule}-${r.from}-${r.to}`}>
              {t.t(`report.transmission.${RULE_SLUG[r.rule]}` as MessageKey, { from: element(r.from), to: element(r.to) })}{" "}
              <CitationChip id={r.citation} usedFor={t.t("report.transmission.title")} />
            </li>
          ))}
        </ul>
      )}
      {sus !== null && (sus.now !== null || sus.upcoming.length > 0) ? (
        <section aria-labelledby="susceptibility-title">
          <h3 id="susceptibility-title">{t.t("report.constitution.susceptibility")}</h3>
          <ul>{sus.now ? line(sus.now, "now") : null}{sus.upcoming.slice(0, 3).map((u, i) => line(u, `up-${i}`))}</ul>
        </section>
      ) : null}
      {forecast.length > 0 ? (
        <section aria-labelledby="forecast-title">
          <h3 id="forecast-title">{t.t("report.transmission.forecast")}</h3>
          <ul>
            {forecast.slice(0, 4).map((p, i) => {
              const top = [...ELEMENTS].map((e) => ({ e, v: p.total[e] })).sort((x, y) => Math.abs(y.v) - Math.abs(x.v))[0];
              if (!top || Math.abs(top.v) < 0.05) return <li key={i}>{p.season.name}</li>;
              return <li key={i}>{t.t("report.transmission.season", { season: p.season.name, element: element(top.e), direction: t.t(top.v > 0 ? "report.transmission.up" : "report.transmission.down") })}</li>;
            })}
          </ul>
          <p className="muted">{t.t("safety.notice.birth.text")}</p>
        </section>
      ) : null}
    </Card>
  );
}

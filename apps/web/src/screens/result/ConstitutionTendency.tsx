import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useLoaded } from "../../app/knowledge.tsx";
import type { SavedAssessment } from "../../storage/types.ts";

/** The constitution tendency (SOP §7): primary and secondary in plain words, never "you are type X"; absent when the quiz was skipped. */
export function ConstitutionTendency({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const c = saved.result.constitution;
  if (c === null) return null;
  const rec = (id: string) => kb.constitutions.find((x) => x.id === id);
  const desc = (id: string) => kb.constitutionItems.types.find((x) => x.constitution === id)?.description;
  const { primary, secondary, balanced, complete } = c.result;
  const p = primary ? rec(primary) : undefined;
  const s2 = secondary ? rec(secondary) : undefined;
  return (
    <section aria-labelledby="constitution-title" style={{ marginBottom: "var(--space-4)" }}>
      <h3 id="constitution-title">{t.t("report.constitution.title")}</h3>
      {p ? (
        <>
          <p style={{ margin: 0 }}>{t.t("report.constitution.primary", { name: t.localized(p.name).text })}{s2 ? <>{" · "}{t.t("report.constitution.secondary", { name: t.localized(s2.name).text })}</> : null}</p>
          <p className="muted" style={{ margin: "var(--space-1) 0" }}>{primary ? t.localized(desc(primary) ?? { "zh-Hant": "", en: "" }).text : null}</p>
          {primary === "C_PINGHE" && balanced !== null ? <p style={{ margin: 0 }}>{t.t("report.constitution.balanced")}</p> : null}
        </>
      ) : <p>{t.t("report.constitution.none")}</p>}
      {complete ? null : <p className="muted">{t.t("report.constitution.partial")}</p>}
      <p className="muted">{t.t("report.constitution.notLabel")}</p>
    </section>
  );
}

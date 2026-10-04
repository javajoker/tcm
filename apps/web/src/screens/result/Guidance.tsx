import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { CitationChips } from "../../app/citations.tsx";
import { useLoaded } from "../../app/knowledge.tsx";
import { Term } from "../../app/Term.tsx";
import { Chip } from "../../ui/index.ts";
import type { AcupointRecommendation, FoodRecommendation } from "@tcm/engine";

/** A bilingual text of the knowledge base in the page language. */
function useText(): (v: { readonly "zh-Hant": string; readonly en: string }) => ReactNode {
  const { t } = useI18n();
  return (v) => { const l = t.localized(v); return <span lang={t.lang === "en" && !l.fellBack ? "en" : "zh-Hant"}>{l.text}</span>; };
}

/** One diet entry: the food, its nature and flavours, a flag for pregnancy, and — folded — why it is suggested, with its basis, cautions and citations. */
export function FoodItem({ food }: { food: FoodRecommendation }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const text = useText();
  const entry = kb.treatment.foods[food.name];
  return (
    <li>
      <Term zh={food.name} />
      {entry ? (
        <>
          {" "}<Chip><span className="visually-hidden">{t.t("report.diet.nature")}: </span><span lang="zh-Hant">{entry.nature}{entry.flavors.length > 0 ? ` · ${entry.flavors.join("")}` : ""}</span></Chip>
          {entry.pregnancy_caution ? <>{" "}<Chip tone="notice">{t.t("report.diet.pregnancy")}</Chip></> : null}
        </>
      ) : null}
      {food.annotations.map((n) => <span key={n.ruleId} className="muted"> — {t.localized(n.message).text}</span>)}
      {entry ? (
        <details>
          <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>{t.t("report.diet.why")}</summary>
          <p>{text(entry.rationale)}</p>
          {entry.cautions.length > 0 ? <><h5 style={{ margin: "var(--space-2) 0 var(--space-1)" }}>{t.t("report.diet.cautions")}</h5><ul>{entry.cautions.map((c, i) => <li key={i}>{text(c)}</li>)}</ul></> : null}
          <p className="muted">{t.t(`report.diet.basis.${entry.basis}` as MessageKey)}</p>
          <p><CitationChips ids={entry.citations} usedFor={food.name} /></p>
        </details>
      ) : null}
    </li>
  );
}

/** One acupressure point: name, code and meridian, where it is, and its own cautions (a pregnancy flag among them). */
export function PointItem({ point }: { point: AcupointRecommendation }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const text = useText();
  const entry = kb.treatment.acupoints[point.name];
  return (
    <li>
      <Term zh={point.name} /> <span className="muted">{t.t("report.points.meridian", { code: point.code, meridian: point.meridian })}</span>
      {entry?.pregnancy_avoid ? <>{" "}<Chip tone="notice">{t.t("report.points.pregnancy")}</Chip></> : null}
      {point.annotations.map((n) => <span key={n.ruleId} className="muted"> — {t.localized(n.message).text}</span>)}
      {entry ? (
        <>
          <p style={{ margin: "var(--space-1) 0" }}><strong>{t.t("report.points.where")}:</strong> {text(entry.location)}</p>
          {entry.cautions.length > 0 ? (
            <details>
              <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>{t.t("report.points.cautions")}</summary>
              <ul>{entry.cautions.map((c, i) => <li key={i}>{text(c)}</li>)}</ul>
            </details>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

/** The part that is the same for every point: how to press, and when not to. */
export function PressingNotes(): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const text = useText();
  const a = kb.treatment.acupressure;
  return (
    <details>
      <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer" }}>{t.t("report.points.how.title")}</summary>
      <p>{text(a.how)}</p>
      <h5 style={{ margin: "var(--space-2) 0 var(--space-1)" }}>{t.t("report.points.general.title")}</h5>
      <ul>{a.cautions.map((c, i) => <li key={i}>{text(c)}</li>)}</ul>
    </details>
  );
}

/** A pattern's lifestyle line in the page language (the pattern's own text is Chinese only). */
export function Lifestyle({ patternId, fallback }: { patternId: string; fallback: ReactNode }): ReactNode {
  const { kb } = useLoaded();
  const text = useText();
  const v = kb.treatment.lifestyle[patternId];
  return v ? text(v) : fallback;
}

import { useEffect, type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { useLoaded } from "../../app/knowledge.tsx";
import type { SavedAssessment } from "../../storage/types.ts";
import styles from "./Result.module.css";

/** Open every <details> for printing (the table twins and the notices must be on paper) and put them back afterwards. */
export function usePrintExpand(): void {
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = (): void => { opened = [...document.querySelectorAll<HTMLDetailsElement>("details:not([open])")]; for (const d of opened) d.open = true; };
    const after = (): void => { for (const d of opened) d.open = false; opened = []; };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
}

/** The citations a result relies on, in first-use order (formulas, patterns' theory, principles, transmission, the general regimen). */
export function usedCitations(saved: SavedAssessment): string[] {
  const r = saved.result;
  const ids: string[] = [];
  const add = (xs: readonly string[] | undefined): void => { for (const x of xs ?? []) if (!ids.includes(x)) ids.push(x); };
  for (const x of r.trace) { if (x.kind === "theory") add(x.citations); if (x.kind === "transmission") add([x.citation]); if (x.kind === "formula") add(x.citations); }
  for (const f of [...r.recommendations.formulas, ...r.recommendations.studyOnly]) add(f.citations);
  add(r.recommendations.general.citations);
  for (const x of r.panel.transmission.rules.slice(0, 3)) add([x.citation]);
  return ids;
}

/** Print only: the sources as footnotes (book · chapter and the quoted text) and the disclaimer repeated in every page's footer. */
export function PrintExtras({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const cites = usedCitations(saved).map((id) => kb.citation(id)).filter((c) => c !== undefined);
  return (
    <>
      {cites.length > 0 ? (
        <section hidden className={styles.printOnly} aria-label={t.t("report.print.sources")}>
          <h2>{t.t("report.print.sources")}</h2>
          <ol>{cites.map((c) => <li key={c.id} lang="zh-Hant">《{c.book}》{c.chapter}：{c.quote_zh_hant}</li>)}</ol>
        </section>
      ) : null}
      <div className={styles.printFooter} aria-hidden="true">{t.t("report.print.footer")}</div>
    </>
  );
}

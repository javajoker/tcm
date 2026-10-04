import type { ReactNode } from "react";
import type { KnowledgeBase } from "@tcm/kb";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { Term } from "../../app/Term.tsx";
import type { Draft } from "../../storage/types.ts";
import { Card } from "../../ui/index.ts";
import { recorded } from "./model.ts";
import styles from "./Inquiry.module.css";

/** Desktop side rail: what has been recorded, by dimension. Never shows pattern names while the inquiry runs (it would anchor the answers). */
export function Rail({ kb, draft }: { kb: KnowledgeBase; draft: Draft }): ReactNode {
  const { t } = useI18n();
  const groups = recorded(kb, draft);
  return (
    <aside className={styles.rail} aria-label={t.t("intake.inquiry.rail.title")}>
      <Card title={t.t("intake.inquiry.rail.title")} headingLevel={2}>
        {groups.length === 0 ? <p className="muted">{t.t("intake.inquiry.rail.empty")}</p> : (
          <dl style={{ margin: 0 }}>
            {groups.map((g) => (
              <div key={g.dimension} style={{ marginBottom: "var(--space-3)" }}>
                <dt style={{ fontWeight: 600 }}>{t.t(`intake.inquiry.dimension.${g.dimension}` as MessageKey)}</dt>
                <dd style={{ margin: 0 }}>{g.symptoms.map((s, i) => <span key={s.id}>{i > 0 ? "、" : ""}<Term zh={s.text} /></span>)}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="muted" style={{ margin: 0 }}>{t.t("intake.inquiry.rail.note")}</p>
      </Card>
    </aside>
  );
}

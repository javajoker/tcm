import { useId, type ReactNode } from "react";
import type { KnowledgeBase } from "@tcm/kb";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Field, Select } from "../../ui/index.ts";

/** The regional emergency (and, where asked, crisis) numbers as tap-to-call links, with a region selector. The list is data (`emergency.json`). */
export function EmergencyNumbers({ kb, region, onRegion, crisis }: { kb: KnowledgeBase; region: string; onRegion: (id: string) => void; crisis: boolean }): ReactNode {
  const { t } = useI18n();
  const headingId = useId();
  const current = kb.emergency.regions.find((r) => r.id === region) ?? kb.emergency.regions[0]!;
  const call = (n: { number: string; label: { "zh-Hant": string; en: string } }): ReactNode => (
    <li key={n.number}><a href={`tel:${n.number}`} aria-label={`${t.t("safety.emergency.call", { number: n.number })} — ${t.localized(n.label).text}`}><strong>{n.number}</strong></a> {t.localized(n.label).text}</li>
  );
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId}>{t.t("safety.emergency.title")}</h3>
      <Field label={t.t("safety.emergency.region")}>
        <Select value={current.id} onChange={(e) => onRegion(e.currentTarget.value)}>
          {kb.emergency.regions.map((r) => <option key={r.id} value={r.id}>{t.localized(r.name).text}</option>)}
        </Select>
      </Field>
      {current.emergency.length > 0 ? <ul>{current.emergency.map(call)}</ul> : <p>{t.t("safety.emergency.local")}</p>}
      {crisis && current.crisis.length > 0 ? (<><h4>{t.t("safety.emergency.crisis")}</h4><ul>{current.crisis.map(call)}</ul></>) : null}
      <p className="muted">{t.t("safety.emergency.unverified")}</p>
    </section>
  );
}

/** The `{emergency_number}` of the notice text: the region's emergency numbers, or "your local emergency number". */
export function emergencyNumberText(kb: KnowledgeBase, region: string, local: string): string {
  const r = kb.emergency.regions.find((x) => x.id === region);
  return r !== undefined && r.emergency.length > 0 ? r.emergency.map((n) => n.number).join(" / ") : local;
}

import { useState, type ReactNode } from "react";
import { deviceTimeZone, resolveRegion } from "../screening/region.ts";
import type { Assessment } from "@tcm/engine";
import { ENGINE_VERSION } from "@tcm/engine";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { useLoaded } from "../../app/knowledge.tsx";
import { IS_DEV_PROFILE } from "../../app/profile.ts";
import { useApp } from "../../app/store.tsx";
import type { SavedAssessment } from "../../storage/types.ts";
import { Chip, Notice } from "../../ui/index.ts";
import { NOTICE_STYLE } from "../screening/model.ts";
import { NOTICE_SLUG, noticeParams } from "../screening/noticeText.ts";

interface Item { readonly key: string; readonly kind: "emergency" | "caution" | "info"; readonly title: string | null; readonly body: string }

/** ① Safety and scope banner: the acknowledged notices (one collapsed line each), the inline notices, and what was not shown and why. */
export function Banner({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const prefs = useApp((s) => s.prefs);
  const [whyOpen, setWhyOpen] = useState(false);
  const a: Assessment = saved.result;
  const ctx = { kb, t, region: resolveRegion(kb.emergency.regions, prefs.region, deviceTimeZone()).id, answers: saved.input.screening.answers, allergies: saved.input.subject.allergies ?? [], enforcement: a.policy.safetyEnforcement };
  const text = (slug: string, part: "title" | "body" | "text", params: Record<string, string>): string => t.t(`safety.notice.${slug}.${part}` as MessageKey, params);

  const items: Item[] = [];
  for (const n of a.policy.notices) {
    const slug = NOTICE_SLUG[n.id];
    if (slug === undefined) continue;
    const params = noticeParams(ctx, n);
    const blocking = t.has(`safety.notice.${slug}.title`);
    items.push({ key: `${n.id}|${n.reasons.join(",")}`, kind: NOTICE_STYLE[n.id] ?? "info", title: blocking ? text(slug, "title", params) : null, body: blocking ? text(slug, "body", params) : text(slug, "text", params) });
  }
  // notices the engine does not request but the policy requires from what was entered
  for (const med of saved.input.profile.medicationText) items.push({ key: `N-MED-UNKNOWN|${med}`, kind: "info", title: null, body: text("medicationUnknown", "text", { text: med }) });
  for (const al of a.quality.unmatchedAllergies) items.push({ key: `N-ALLERGY-UNKNOWN|${al}`, kind: "info", title: null, body: text("allergyUnknown", "text", { text: t.zh(al) }) });
  if (Object.entries(saved.input.findings).some(([id, f]) => f.state === "present" && (kb.symptoms.get(id)?.kind ?? "symptom") !== "symptom")) items.push({ key: "N-SELFOBS", kind: "info", title: null, body: text("selfObserved", "text", {}) });
  if (kb.params._meta.status !== "reviewed") items.push({ key: "N-DRAFT", kind: "caution", title: null, body: text("draft", "text", {}) });

  const older = saved.kbVersion !== kb.version || saved.engineVersion !== ENGINE_VERSION;
  const suppressed = a.suppressed;
  const nameOfItem = (s: { kind: string; id: string }): string => (s.kind === "formula" ? t.localized(kb.formulas.get(s.id)?.name ?? { "zh-Hant": s.id, en: null }).text : s.kind === "herb" ? t.localized(kb.herbName(s.id)?.name ?? { "zh-Hant": s.id, en: null }).text : s.id);

  return (
    <section aria-labelledby="sec-banner-title" id="sec-banner" style={{ display: "grid", gap: "var(--space-3)" }}>
      <h2 id="sec-banner-title" className="visually-hidden">{t.t("report.banner.title")}</h2>
      {IS_DEV_PROFILE ? <p style={{ margin: 0 }}><Chip tone="notice">{t.t("report.dev.level", { level: a.policy.level })}</Chip></p> : null}
      {older ? <Notice kind="info" kindLabel={t.t("common.notice.info")}>{t.t("report.version.older")}</Notice> : null}
      {saved.imported ? <Notice kind="info" kindLabel={t.t("common.notice.info")}>{t.t("common.backup.imported.notice", { version: saved.imported.from.appVersion })}</Notice> : null}
      {items.map((i) => (
        i.title !== null ? (
          <details key={i.key}>
            <summary style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center", fontWeight: 600 }}>{i.title}</summary>
            <Notice kind={i.kind} kindLabel={t.t(`common.notice.${i.kind}` as MessageKey)}><p style={{ margin: 0 }}>{i.body}</p></Notice>
          </details>
        ) : (
          <Notice key={i.key} kind={i.kind} kindLabel={t.t(`common.notice.${i.kind}` as MessageKey)}><p style={{ margin: 0 }}>{i.body}</p></Notice>
        )
      ))}
      {suppressed.length > 0 ? (
        <div>
          <Notice kind="info" kindLabel={t.t("common.notice.info")}>
            <p style={{ margin: 0 }}>{text("suppressed", "text", {})}{" "}
              <button type="button" aria-expanded={whyOpen} onClick={() => setWhyOpen((v) => !v)} style={{ background: "none", border: 0, padding: 0, color: "var(--link)", textDecoration: "underline", font: "inherit", cursor: "pointer", minHeight: 44 }}>{t.t("report.banner.why")}</button>
            </p>
          </Notice>
          {whyOpen ? (
            <ul>
              {suppressed.map((s) => (
                <li key={`${s.kind}:${s.id}`}>
                  <strong>{t.t(`report.kind.${s.kind}` as MessageKey)}</strong> {s.reason === "rule" && s.message
                    ? t.t("report.banner.item.rule", { name: nameOfItem(s), reason: t.localized(s.message).text })
                    : t.t("report.banner.item.level", { name: nameOfItem(s) })}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

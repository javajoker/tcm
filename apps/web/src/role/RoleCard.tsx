// Settings → Who is reading (PM-53; prescription model §7.4): a general reader, a learner of Chinese medicine or a practitioner. Choosing a learner or a practitioner shows the
// safety policy's attestation (N-ROLE) first; choosing a general reader withdraws it at once. Only where the build serves roles (the closed beta; a public build after the reviews).
import { useState, type ReactNode } from "react";
import type { Role } from "@tcm/kb";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useLoadedOptional, useRoleState } from "../app/knowledge.tsx";
import { roleOf, withRole, withoutRole } from "../app/role.ts";
import { useApp } from "../app/store.tsx";
import { Button, Card, ConfirmDialog, LinkButton, SegmentedControl } from "../ui/index.ts";

const CHOICES = ["general", "learner", "practitioner"] as const;

export function RoleCard(): ReactNode {
  const { t } = useI18n();
  const loaded = useLoadedOptional();
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const state = useRoleState();
  const [asking, setAsking] = useState<Role | null>(null);
  if (loaded === null || loaded.kb.roles.length === 0) return null;
  const current = roleOf(prefs) ?? "general";
  return (
    <Card title={t.t("common.settings.role.title")} headingLevel={2} id="settings-role">
      <p>{t.t("common.settings.role.intro")}</p>
      <SegmentedControl legend={t.t("common.settings.role.title")} hideLegend value={current}
        onChange={(v) => { if (v === "general") setPrefs(withoutRole()); else if (v !== current) setAsking(v); }}
        options={CHOICES.map((v) => ({ value: v, label: t.t(`common.settings.role.${v}`) }))} />
      <p className="muted">{t.t("common.settings.role.check")}</p>
      {current !== "general" && state === "unavailable" ? <p role="status">{t.t("common.settings.role.unavailable")}</p> : null}
      <ConfirmDialog open={asking !== null} title={t.t("safety.notice.role.title")} confirmLabel={t.t("common.settings.role.confirm")} cancelLabel={t.t("common.action.cancel")} danger={false}
        onCancel={() => setAsking(null)} onConfirm={() => { if (asking !== null) setPrefs(withRole(asking, Date.now())); setAsking(null); }}>
        <p>{t.t("safety.notice.role.body")}</p>
      </ConfirmDialog>
    </Card>
  );
}

/** The one-time offer on the landing page: where the build serves roles and the person has not chosen or put it aside. */
export function RoleOffer(): ReactNode {
  const { t } = useI18n();
  const loaded = useLoadedOptional();
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  if (loaded === null || loaded.kb.roles.length === 0 || prefs.role !== undefined || prefs.roleOffered === true) return null;
  return (
    <Card title={t.t("common.role.offer.title")} headingLevel={2} id="landing-role">
      <p>{t.t("common.role.offer.body")}</p>
      <p style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", margin: 0 }}>
        <LinkButton href="/settings#settings-role">{t.t("common.role.offer.link")}</LinkButton>
        <Button variant="ghost" onClick={() => setPrefs({ roleOffered: true })}>{t.t("common.role.offer.dismiss")}</Button>
      </p>
    </Card>
  );
}

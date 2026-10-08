// Settings → Who is reading (PM-53, PM-54; prescription model §7.4): a general reader, a learner of Chinese medicine or a practitioner. Where the build shows the study reference to every
// reader by default (`dose_display: all`) the card says so, and choosing General reader stops it for the results made from then on; where only those who declare a role see it (`roles`),
// choosing a learner or a practitioner shows the safety policy's attestation (N-ROLE) first. Only where the build serves the study reference (the closed beta; a public build after the reviews).
import { useState, type ReactNode } from "react";
import type { Role } from "@tcm/kb";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { useLoadedOptional, useRetryKnowledge, useRoleState } from "../app/knowledge.tsx";
import { declaredOf, effectiveRole, withGeneral, withRole } from "../app/role.ts";
import { useApp } from "../app/store.tsx";
import { Button, Card, ConfirmDialog, LinkButton, SegmentedControl } from "../ui/index.ts";

const CHOICES = ["general", "learner", "practitioner"] as const;

export function RoleCard(): ReactNode {
  const { t } = useI18n();
  // the knowledge base is made again when the reader's choice changes: the card stays where it is while that happens (state adjusted during render, not an effect)
  const now = useLoadedOptional();
  const [last, setLast] = useState(now);
  if (now !== null && now !== last) setLast(now);
  const loaded = now ?? last;
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const state = useRoleState();
  const retry = useRetryKnowledge();
  const [asking, setAsking] = useState<Role | null>(null);
  if (loaded === null || loaded.kb.roles.length === 0) return null;
  const general = loaded.kb.general();
  const everyone = general.config.profile.dose_display === "all";
  const declared = declaredOf(prefs);
  const current = effectiveRole(declared, general) ?? "general";
  return (
    <Card title={t.t("common.settings.role.title")} headingLevel={2} id="settings-role">
      <p>{t.t(everyone ? "common.settings.role.intro.all" : "common.settings.role.intro")}</p>
      <SegmentedControl legend={t.t("common.settings.role.title")} hideLegend value={current}
        onChange={(v) => { if (v === "general") setPrefs(withGeneral(Date.now())); else if (v !== current) setAsking(v); }}
        options={CHOICES.map((v) => ({ value: v, label: t.t(v === "general" && everyone ? "common.settings.role.generalAll" : `common.settings.role.${v}`) }))} />
      {everyone && declared === null ? <p className="muted">{t.t("common.settings.role.default")}</p> : null}
      {everyone ? null : <p className="muted">{t.t("common.settings.role.check")}</p>}
      <p className="muted">{t.t("common.settings.role.keeps")}</p>
      {current !== "general" && state === "unavailable" ? (
        <p role="status">{t.t(everyone && declared === null ? "common.settings.role.unavailableAll" : "common.settings.role.unavailable")} <Button onClick={retry}>{t.t("common.settings.role.retry")}</Button></p>
      ) : null}
      <ConfirmDialog open={asking !== null} title={t.t("safety.notice.role.title")} confirmLabel={t.t("common.settings.role.confirm")} cancelLabel={t.t("common.action.cancel")} danger={false}
        onCancel={() => setAsking(null)} onConfirm={() => { if (asking !== null) setPrefs(withRole(asking, Date.now())); setAsking(null); }}>
        <p>{t.t("safety.notice.role.body")}</p>
      </ConfirmDialog>
    </Card>
  );
}

/** The one-time offer on the landing page: where the build shows the study reference only to those who declare a role, and the person has not chosen or put it aside. */
export function RoleOffer(): ReactNode {
  const { t } = useI18n();
  const loaded = useLoadedOptional();
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  if (loaded === null || loaded.kb.roles.length === 0 || loaded.kb.general().config.profile.dose_display !== "roles" || prefs.role !== undefined || prefs.roleOffered === true) return null;
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

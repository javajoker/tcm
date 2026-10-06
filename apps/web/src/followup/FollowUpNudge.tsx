import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { DISCLAIMER_VERSION } from "../app/disclaimer.ts";
import { useApp } from "../app/store.tsx";
import { randomId } from "../storage/ids.ts";
import type { SavedAssessment } from "../storage/types.ts";
import { Button, Card } from "../ui/index.ts";
import { dismissedAt, dueNudge, weeksSince } from "./model.ts";
import { draftFromProfile } from "./profileDraft.ts";

/**
 * The card on the start page and in History when a follow-up date has passed (design §4.2): computed from stored data when the page opens — no timer, no background work, no message from anywhere. It
 * offers a new assessment, the same with the previous *profile* (never the previous findings), or *not now*, which keeps it from coming back. It is not shown while an assessment is in progress, after
 * a newer result was saved, or before the disclaimer has been acknowledged in this version.
 */
export function FollowUpNudge(): ReactNode {
  const { t } = useI18n();
  const [, navigate] = useLocation();
  const listAssessments = useApp((s) => s.listAssessments);
  const putAssessment = useApp((s) => s.putAssessment);
  const startDraft = useApp((s) => s.startDraft);
  const adoptDraft = useApp((s) => s.adoptDraft);
  const draft = useApp((s) => s.draft);
  const draftLoaded = useApp((s) => s.draftLoaded);
  const acknowledged = useApp((s) => s.prefs.disclaimerAck?.version === DISCLAIMER_VERSION);
  const [all, setAll] = useState<readonly SavedAssessment[] | null>(null);
  const [now] = useState(() => Date.now());
  const clock = useRef<() => number>(Date.now);          // read when a button is pressed
  useEffect(() => {
    let alive = true;
    void listAssessments().then((list) => { if (alive) setAll(list); });
    return () => { alive = false; };
  }, [listAssessments]);

  const due = all === null || !draftLoaded || draft !== null || !acknowledged ? null : dueNudge(all, now);
  if (due === null) return null;
  const startNew = (): void => { startDraft(); navigate("/start"); };
  const startWithProfile = (): void => { adoptDraft(draftFromProfile(due, randomId(), clock.current())); navigate("/start"); };
  const later = (): void => { const next = dismissedAt(due, clock.current()); setAll((all ?? []).map((s) => (s.id === due.id ? next : s))); void putAssessment(next); };
  return (
    <Card headingLevel={2} title={t.t("followup.nudge.title")} id="follow-up-nudge">
      <p role="status">{t.t("followup.nudge.text", { n: weeksSince(due.createdAt, now) })}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
        <Button variant="primary" onClick={startNew}>{t.t("followup.nudge.start")}</Button>
        <Button onClick={startWithProfile}>{t.t("followup.nudge.profile")}</Button>
        <Button onClick={later}>{t.t("followup.nudge.later")}</Button>
      </div>
      <p className="muted">{t.t("followup.nudge.profile.hint")}</p>
    </Card>
  );
}

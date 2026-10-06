import { useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { downloadText } from "../backup/files.ts";
import { formatDate } from "../app/format.ts";
import { useApp } from "../app/store.tsx";
import { randomId } from "../storage/ids.ts";
import type { SavedAssessment } from "../storage/types.ts";
import { Button, Card, Dialog, DialogActions, Tile } from "../ui/index.ts";
import { FOLLOW_UP_FILE, followUpIcs } from "./ics.ts";
import { INTERVAL_WEEKS, withFollowUp } from "./model.ts";

/** What the calendar entry says below its title: the address of the app in the person's language, and nothing about them. */
function appAddress(lang: string): string {
  return new URL(`${import.meta.env.BASE_URL}${lang}/`, window.location.origin).toString();
}

function CalendarDialog({ dueAt, onClose }: { dueAt: number; onClose: () => void }): ReactNode {
  const { t, lang } = useI18n();
  const titleId = useId();
  const clock = useRef<() => number>(Date.now);          // read when the button is pressed
  const [saved, setSaved] = useState<string | null>(null);
  const download = (): void => {
    downloadText(FOLLOW_UP_FILE, followUpIcs({ dueAt, uid: randomId(), now: clock.current(), summary: t.t("followup.ics.summary"), description: t.t("followup.ics.description", { url: appAddress(lang) }) }), "text/calendar");
    setSaved(FOLLOW_UP_FILE);
  };
  return (
    <Dialog open onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId}>{t.t("followup.ics.title")}</h2>
      <p>{t.t("followup.ics.body", { date: formatDate(lang, dueAt) })}</p>
      {saved !== null ? <p role="status">{t.t("followup.ics.done", { name: saved })}</p> : null}
      <DialogActions>
        <Button onClick={onClose}>{t.t("followup.ics.close")}</Button>
        <Button variant="primary" onClick={download}>{t.t("followup.ics.download")}</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * ⑨ Look again later (follow-up design §4.1): in 2, 4 or 8 weeks, or not now, with nothing pre-selected. The choice is a date on the saved result — written at once, deleted with the result — and the
 * card says so; a calendar file for that date is offered. Nothing is sent anywhere and no timer is started.
 */
export function FollowUpCard({ saved }: { saved: SavedAssessment }): ReactNode {
  const { t, lang } = useI18n();
  const putAssessment = useApp((s) => s.putAssessment);
  const [record, setRecord] = useState<SavedAssessment>(saved);
  const [calendar, setCalendar] = useState(false);
  const [said, setSaid] = useState(false);
  const clock = useRef<() => number>(Date.now);          // read when a choice is made

  const choose = (weeks: number | null): void => {
    const next = withFollowUp(record, weeks, clock.current());
    setRecord(next);
    setSaid(weeks === null);
    void putAssessment(next);
  };
  const due = record.followUp;
  return (
    <Card title={t.t("followup.card.title")} id="sec-followup">
      <div data-noprint>
        <p className="muted">{t.t("followup.card.body")}</p>
        {due === undefined ? (
          <>
            <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 600 }}>{t.t("followup.interval.legend")}</legend>
              {INTERVAL_WEEKS.map((w) => <Tile key={w} type="radio" name="followup" value={String(w)} checked={false} onChange={() => choose(w)} label={t.plural("followup.interval", w)} />)}
              <Tile type="radio" name="followup" value="none" checked={false} onChange={() => choose(null)} label={t.t("followup.interval.none")} />
            </fieldset>
            <p role="status">{said ? t.t("followup.none.saved") : null}</p>
          </>
        ) : (
          <>
            <p role="status">{t.t(due.dismissedAt === undefined ? "followup.set" : "followup.set.dismissed", { date: formatDate(lang, due.dueAt) })}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
              <Button onClick={() => setCalendar(true)}>{t.t("followup.calendar")}</Button>
              <Button onClick={() => choose(null)}>{t.t("followup.change")}</Button>
            </div>
          </>
        )}
        {calendar && due !== undefined ? <CalendarDialog dueAt={due.dueAt} onClose={() => setCalendar(false)} /> : null}
      </div>
    </Card>
  );
}

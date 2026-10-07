import { useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { useLoaded } from "../../app/knowledge.tsx";
import { downloadText, shareableFile, shareFile } from "../../backup/files.ts";
import type { SavedAssessment } from "../../storage/types.ts";
import { Button, Dialog, DialogActions, Notice, Tile } from "../../ui/index.ts";
import { summaryData } from "./summaryData.ts";
import { defaultOptions, FILE_SECTIONS, summaryFile, summaryFileName, type FileSection } from "./summaryFile.ts";

/**
 * Save the practitioner summary as a file (docs/post-mvp/design/export-follow-up-trends.md §3.3, §3.4): a list of the file's sections with a switch each, the typed medicine names and the saved note
 * off until asked for, a plain warning, then a download — or the system share sheet where the browser offers one. The file is built in memory; nothing is uploaded and nothing records where it went.
 */
export function SummaryFileDialog({ saved, onClose }: { saved: SavedAssessment; onClose: () => void }): ReactNode {
  const { t, lang, forLang } = useI18n();
  const { kb } = useLoaded();
  const titleId = useId();
  const data = summaryData(saved, kb);
  // the personalised prescription is offered only for a result that holds one, in a build that can show it (PM-41)
  const offered: readonly FileSection[] = __APP_PROFILE__ === "dev" && saved.prescription !== undefined ? [...FILE_SECTIONS, "prescription"] : FILE_SECTIONS;
  const [sections, setSections] = useState<ReadonlySet<FileSection>>(new Set(offered));
  const [otherNamed, setOtherNamed] = useState(false);
  const [note, setNote] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const names = data.safety.medications.otherNamed;
  const saidNote = saved.userNote !== undefined && saved.userNote.trim() !== "" ? saved.userNote : null;
  const nothing = sections.size === 0;
  const canShare = shareableFile("probe.json", "{}") !== null;
  const clock = useRef<() => number>(Date.now);          // read when a button is pressed, never while rendering

  const make = async (share: boolean): Promise<void> => {
    try {
      const now = clock.current();
      const rx = __APP_PROFILE__ === "dev" && saved.prescription !== undefined && sections.has("prescription") ? (await import("../../prescription/summary.ts")).prescriptionFile(saved.prescription, kb) : null;
      const file = summaryFile(data, saved, kb, { ...defaultOptions(now, lang), sections, otherNamed: otherNamed && sections.has("safety"), note: note ? saidNote : null }, (l) => forLang(l), rx);
      const text = `${JSON.stringify(file, null, 2)}\n`;
      const name = summaryFileName(now);
      if (share) { const f = shareableFile(name, text); if (f !== null) await shareFile(f); else downloadText(name, text); } else downloadText(name, text);
      setDone(name);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };

  return (
    <Dialog open onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId}>{t.t("report.pract.file.title")}</h2>
      <p>{t.t("report.pract.file.intro")}</p>
      <fieldset style={{ border: "none", padding: 0, margin: "0 0 var(--space-3)" }}>
        <legend style={{ fontWeight: 600 }}>{t.t("report.pract.file.sections")}</legend>
        {offered.map((s) => (
          <Tile key={s} type="checkbox" name="section" value={s} checked={sections.has(s)} label={t.t(`report.pract.file.section.${s}` as MessageKey)}
            onChange={(on) => setSections((c) => { const next = new Set(c); if (on) next.add(s); else next.delete(s); return next; })} />
        ))}
      </fieldset>
      {names.length > 0 && sections.has("safety") ? <Tile type="checkbox" name="otherNamed" value="otherNamed" checked={otherNamed} onChange={setOtherNamed} label={t.t("report.pract.file.otherNamed")} description={`${t.t("report.pract.file.otherNamed.hint")} (${names.join(", ")})`} /> : null}
      {saidNote !== null ? <Tile type="checkbox" name="note" value="note" checked={note} onChange={setNote} label={t.t("report.pract.file.note")} description={t.t("report.pract.file.note.hint", { note: saidNote.length > 120 ? `${saidNote.slice(0, 120)}…` : saidNote })} /> : null}
      <Notice kind="info" kindLabel={t.t("common.notice.info")}>{t.t("report.pract.file.warning")}</Notice>
      {nothing ? <p className="muted">{t.t("report.pract.file.nothing")}</p> : null}
      {done !== null ? <p role="status">{t.t("report.pract.file.done", { name: done })}</p> : null}
      {failed ? <p role="alert">{t.t("report.pract.file.failed")}</p> : null}
      <DialogActions>
        <Button onClick={onClose}>{t.t("report.pract.file.cancel")}</Button>
        {canShare ? <Button disabled={nothing} onClick={() => { void make(true); }}>{t.t("report.pract.file.share")}</Button> : null}
        <Button variant="primary" disabled={nothing} onClick={() => { void make(false); }}>{t.t("report.pract.file.download")}</Button>
      </DialogActions>
    </Dialog>
  );
}

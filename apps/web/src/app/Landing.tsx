import { useId, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import type { MessageKey } from "../i18n/catalogs.ts";
import { Button, Card, Chip, ConfirmDialog, Dialog, DialogActions } from "../ui/index.ts";
import { DISCLAIMER_VERSION } from "./disclaimer.ts";
import { relativeTime } from "./format.ts";
import { useApp } from "./store.tsx";
import { usePageTitle } from "./usePageTitle.ts";
import styles from "./Landing.module.css";

const STAGES: readonly [string, MessageKey][] = [
  ["/start", "intake.stage.start"], ["/screen", "intake.stage.screen"], ["/inquiry", "intake.stage.inquiry"],
  ["/observe", "intake.stage.observe"], ["/constitution", "intake.stage.constitution"], ["/review", "intake.stage.review"],
];
const SAMPLE: readonly [MessageKey, number][] = [
  ["intake.sample.element.wood", 35], ["intake.sample.element.fire", 55], ["intake.sample.element.earth", 80], ["intake.sample.element.metal", 45], ["intake.sample.element.water", 30],
];

/** A static, clearly labelled example so people know what the output looks like (UX spec §4.1). Not data: nothing here comes from the engine. */
function SamplePanel(): ReactNode {
  const { t } = useI18n();
  return (
    <Card title={<>{t.t("intake.landing.sample.title")}<span className={styles.exampleTag}><Chip tone="notice">{t.t("intake.landing.sample.note")}</Chip></span></>}>
      <p className={styles.muted}>{t.t("intake.landing.sample.caption")}</p>
      <ul className={styles.sample}>
        {SAMPLE.map(([key, pct]) => (
          <li key={key}>
            <span>{t.t(key)}</span>
            <span className={styles.track} aria-hidden="true"><span className={styles.fill} style={{ display: "block", width: `${pct}%` }} /></span>
            <span className={styles.value}>{t.number(pct / 100, { style: "percent" })}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** S01 Landing and disclaimer (UX spec §4.1). */
export function Landing(): ReactNode {
  const { t, lang } = useI18n();
  const [, navigate] = useLocation();
  usePageTitle(null);
  const prefs = useApp((s) => s.prefs);
  const draft = useApp((s) => s.draft);
  const draftLoaded = useApp((s) => s.draftLoaded);
  const setPrefs = useApp((s) => s.setPrefs);
  const startDraft = useApp((s) => s.startDraft);
  const discardDraft = useApp((s) => s.discardDraft);
  const eraseAll = useApp((s) => s.eraseAll);

  const [checked, setChecked] = useState(prefs.disclaimerAck?.version === DISCLAIMER_VERSION);
  const [dialog, setDialog] = useState<null | "full" | "discard" | "erase" | "startNew">(null);
  const [mountedAt] = useState(() => Date.now());
  const helpId = useId();
  const close = (): void => setDialog(null);

  const begin = (): void => {
    if (prefs.disclaimerAck?.version !== DISCLAIMER_VERSION) setPrefs({ disclaimerAck: { version: DISCLAIMER_VERSION, at: Date.now() } });
    startDraft();
    navigate("/start");
  };
  const onStart = (): void => { if (draft !== null) setDialog("startNew"); else begin(); };

  const stageKey = draft === null ? null : (STAGES.find(([route]) => draft.position.route.startsWith(route))?.[1] ?? "intake.stage.other");

  return (
    <>
      <div className={styles.hero}>
        <div className={styles.startCard}>
          <h1>{t.t("intake.landing.title")}</h1>
          <p className={styles.lead}>{t.t("intake.landing.lead")}</p>

          {draftLoaded && draft !== null && stageKey !== null ? (
            <Card title={t.t("intake.landing.resume.title")} headingLevel={2}>
              <p>{t.t("intake.landing.resume.where", { stage: t.t(stageKey), when: relativeTime(lang, draft.updatedAt, mountedAt) })}</p>
              <div className={styles.row}>
                <Button variant="primary" onClick={() => navigate(draft.position.route)}>{t.t("intake.landing.resume.continue")}</Button>
                <Button onClick={() => setDialog("discard")}>{t.t("intake.landing.resume.discard")}</Button>
              </div>
            </Card>
          ) : null}

          <div>
            <Button variant="primary" block disabled={!checked} aria-describedby={checked ? undefined : helpId} onClick={onStart}>{t.t("intake.landing.start")}</Button>
            {checked ? null : <p id={helpId} className={styles.startHelp}>{t.t("intake.landing.startHelp")}</p>}
          </div>
          <div className={styles.check}>
            <input id="ack" type="checkbox" checked={checked} onChange={(e) => setChecked(e.currentTarget.checked)} />
            <label htmlFor="ack">
              {t.t("intake.landing.ack.label")}{" "}
              <button type="button" className={styles.link} onClick={() => setDialog("full")}>{t.t("intake.landing.ack.read")}</button>
            </label>
          </div>
        </div>
        <SamplePanel />
      </div>

      <section aria-labelledby="landing-cards">
        <h2 id="landing-cards" className={styles.sectionTitle}>{t.t("intake.landing.cards.title")}</h2>
        <div className={styles.cards} style={{ marginTop: 0 }}>
          {(["panel", "reasoning", "formulas"] as const).map((k) => (
            <Card key={k} title={t.t(`intake.landing.cards.${k}.title`)} headingLevel={3}>
              <p>{t.t(`intake.landing.cards.${k}.body`)}</p>
            </Card>
          ))}
        </div>
      </section>

      <p className={styles.privacy}>{t.t("intake.landing.privacy")}</p>
      <p className={styles.footerActions}><button type="button" className={styles.link} onClick={() => setDialog("erase")}>{t.t("intake.landing.erase.action")}</button></p>

      <Dialog open={dialog === "full"} onClose={close} labelledBy="disclaimer-title">
        <h2 id="disclaimer-title">{t.t("intake.landing.disclaimer.title")}</h2>
        <p>{t.rich("safety.disclaimer.full").map((part, i) => (part.type === "tag" && part.tag === "b" ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>))}</p>
        <DialogActions><Button variant="primary" onClick={close}>{t.t("common.action.close")}</Button></DialogActions>
      </Dialog>
      <ConfirmDialog open={dialog === "discard"} title={t.t("intake.landing.discard.title")} confirmLabel={t.t("intake.landing.discard.confirm")} cancelLabel={t.t("common.action.cancel")}
        onCancel={close} onConfirm={() => { close(); void discardDraft(); }}><p>{t.t("intake.landing.discard.body")}</p></ConfirmDialog>
      <ConfirmDialog open={dialog === "startNew"} title={t.t("intake.landing.startNew.title")} confirmLabel={t.t("intake.landing.startNew.confirm")} cancelLabel={t.t("common.action.cancel")} danger={false}
        onCancel={close} onConfirm={() => { close(); begin(); }}><p>{t.t("intake.landing.startNew.body")}</p></ConfirmDialog>
      <ConfirmDialog open={dialog === "erase"} title={t.t("intake.landing.erase.title")} confirmLabel={t.t("intake.landing.erase.confirm")} cancelLabel={t.t("common.action.cancel")}
        onCancel={close} onConfirm={() => { close(); void eraseAll(); }}><p>{t.t("intake.landing.erase.body")}</p></ConfirmDialog>
    </>
  );
}

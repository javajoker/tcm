import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { FlowGuard } from "../../app/FlowGuard.tsx";
import { NeedsKnowledge, useLoaded } from "../../app/knowledge.tsx";
import { useApp } from "../../app/store.tsx";
import { useDraft } from "../../app/useDraft.ts";
import { usePageTitle } from "../../app/usePageTitle.ts";
import type { Draft } from "../../storage/types.ts";
import { Button, Card, CheckGroup, ChoiceGroup, Field, LinkButton, Skeleton, TextInput } from "../../ui/index.ts";
import { pendingNotices, withAcknowledged } from "../screening/model.ts";
import { NoticeScreen } from "../screening/NoticeScreen.tsx";
import { toggleExclusive } from "./exclusive.ts";
import { applyPulse, clearPulse, parseRate, RATE_GROUP, type Rhythm } from "./model.ts";
import { PulsePositions } from "./PulsePositions.tsx";

const TIMER_SECONDS = 30;
const GROUP_ORDER = ["depth", "flow", "strength", "length", "tension", "rhythm", "width"];

function Form({ draft }: { draft: Draft }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const [, navigate] = useLocation();
  const updateDraft = useApp((s) => s.updateDraft);
  const stored = draft.observe.pulse;
  const positionOf = Object.values(draft.findings).find((f) => f.position !== undefined)?.position ?? null;
  const [rateText, setRateText] = useState(stored?.rate != null ? String(stored.rate) : "");
  const [rateTouched, setRateTouched] = useState(false);
  const [rhythm, setRhythm] = useState<Rhythm | null>(stored?.rhythm ?? null);
  const [qualities, setQualities] = useState<string[]>(Object.keys(draft.findings).filter((id) => id.startsWith("P_") && draft.findings[id]!.state === "present" && kb.pulse.pulses.find((p) => p.id === id)?.group !== RATE_GROUP));
  const [position, setPosition] = useState<string | null>(positionOf);
  const [note, setNote] = useState("");
  const [seconds, setSeconds] = useState<number | null>(null);          // null = timer not started; 0 = finished
  const running = seconds !== null && seconds > 0;
  const [count, setCount] = useState("");
  const [showNotice, setShowNotice] = useState(false);

  useEffect(() => {
    if (!running) return;
    const h = setInterval(() => setSeconds((s) => (s === null || s <= 0 ? s : s - 1)), 1000);
    return () => clearInterval(h);
  }, [running]);

  const groups = kb.exclusions.groups.filter((g) => g.kind === "exclusive" && g.symptoms.some((s) => s.startsWith("P_"))).map((g) => g.symptoms as readonly string[]);
  const pulses = kb.pulse.pulses.filter((p) => p.group !== RATE_GROUP);
  const byGroup = GROUP_ORDER.map((g) => ({ group: g, items: pulses.filter((p) => p.group === g) })).filter((x) => x.items.length > 0);
  const rate = rateText.trim() === "" ? null : parseRate(rateText);
  const rateInvalid = rateText.trim() !== "" && rate === null;
  const pending = showNotice ? pendingNotices(kb, draft) : [];

  const save = (): void => {
    if (rateInvalid) { setRateTouched(true); return; }
    updateDraft((d) => applyPulse(d, kb, { rate, rhythm, qualities, position }));
    if (rhythm === "irregular") setShowNotice(true); else navigate("/observe");
  };
  const clear = (): void => { updateDraft(clearPulse); navigate("/observe"); };
  const chooseQuality = (next: readonly string[]): void => {
    const added = next.find((v) => !qualities.includes(v));
    if (added === undefined) { setQualities([...next]); setNote(""); return; }
    const { next: n, replaced } = toggleExclusive(qualities, added, true, groups);
    setQualities(n);
    setNote(replaced ? t.t("observe.pulse.exclusive", { reason: replaced.map((id) => pulses.find((p) => p.id === id)).filter((p) => p !== undefined).map((p) => t.localized(p.name).text).join(" / ") }) : "");
  };

  return (
    <>
      <h1>{t.t("observe.pulse.title")}</h1>
      <p>{t.t("observe.pulse.optional")}</p>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <Card title={t.t("observe.pulse.measure.title")} headingLevel={2} id="pulse-measure">
          <Field label={t.t("observe.pulse.rate.label")} hint={t.t("observe.pulse.rate.hint")} error={rateInvalid && rateTouched ? t.t("observe.pulse.rate.invalid") : null}>
            <TextInput inputMode="numeric" maxLength={3} value={rateText} onChange={(e) => setRateText(e.currentTarget.value)} onBlur={() => setRateTouched(true)} />
          </Field>
          {seconds === null ? <Button onClick={() => setSeconds(TIMER_SECONDS)}>{t.t("observe.pulse.timer.start")}</Button>
            : seconds > 0 ? <p role="timer" aria-live="off">{t.t("observe.pulse.timer.running", { s: seconds })}</p>
            : (
              <div>
                <p role="status">{t.t("observe.pulse.timer.done")}</p>
                <Field label={t.t("observe.pulse.timer.count")}><TextInput inputMode="numeric" maxLength={3} value={count} onChange={(e) => setCount(e.currentTarget.value)} /></Field>
                <Button disabled={!/^\d{1,3}$/.test(count)} onClick={() => { setRateText(String(Number(count) * 2)); setSeconds(null); setCount(""); }}>{t.t("observe.pulse.timer.use")}</Button>
              </div>
            )}
          <ChoiceGroup legend={t.t("observe.pulse.rhythm.legend")} inline value={rhythm} onChange={(v) => setRhythm(v as Rhythm)}
            options={(["regular", "skips", "irregular"] as const).map((v) => ({ value: v, label: t.t(`observe.pulse.rhythm.${v}` as MessageKey) }))} />
        </Card>

        <Card title={t.t("observe.pulse.qualities.title")} headingLevel={2} id="pulse-qualities">
          <p className="muted">{t.t("observe.pulse.qualities.hint")}</p>
          {byGroup.map(({ group, items }) => (
            <CheckGroup key={group} legend={t.t(`observe.pulse.group.${group}` as MessageKey)} values={qualities} onChange={(next) => chooseQuality([...qualities.filter((q) => !items.some((p) => p.id === q)), ...next.filter((q) => items.some((p) => p.id === q))])}
              options={items.map((p) => ({ value: p.id, label: <><span>{t.localized(p.name).text}</span> <span className="muted" lang="zh-Hant">{p.name["zh-Hant"]}</span></>, description: <span lang="zh-Hant">{p.feature}</span> }))} />
          ))}
          <p role="status" className="muted">{note}</p>
          {qualities.length > 0 ? <p>{t.t("safety.notice.pulseEducation.text")}</p> : null}
          <PulsePositions position={position} />
          <ChoiceGroup legend={t.t("observe.pulse.positions.legend")} inline value={position} onChange={setPosition}
            options={kb.pulse.positions.map((p) => ({ value: p.id, label: t.t(`observe.pulse.position.${p.id}` as MessageKey) }))} />
        </Card>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
        <LinkButton href="/observe">{t.t("observe.back")}</LinkButton>
        <Button variant="primary" onClick={save}>{t.t("observe.pulse.save")}</Button>
        <Button variant="ghost" onClick={clear}>{t.t("observe.pulse.clear")}</Button>
        <LinkButton href="/observe" variant="ghost">{t.t("observe.cant")}</LinkButton>
      </div>
      <NoticeScreen kb={kb} draft={draft} notices={pending} onAcknowledge={() => { const at = Date.now(); updateDraft((d) => withAcknowledged(d, pendingNotices(kb, d), at)); setShowNotice(false); navigate("/observe"); }} />
    </>
  );
}

/** S10 Pulse (UX spec §4.7): optional. The measured rate gives rapid/slow (measured quality); qualities are self-assessed (the lowest quality class) with the education note; an irregular rhythm raises the B-level notice. */
export function Pulse(): ReactNode {
  const { t } = useI18n();
  usePageTitle("observe.pulse.title");
  const draft = useDraft("/observe");
  if (draft === null) return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span><Skeleton height="2rem" width="50%" /></div>;
  return <NeedsKnowledge><FlowGuard draft={draft} allowPending><Form draft={draft} /></FlowGuard></NeedsKnowledge>;
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Severity } from "@tcm/engine";
import type { KnowledgeBase, Question } from "@tcm/kb";
import type { QuestionReason } from "@tcm/engine";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Term } from "../../app/Term.tsx";
import { Button, Progress, SegmentedControl, Tile } from "../../ui/index.ts";
import { DEFAULT_SEVERITY, type Answer } from "./model.ts";

interface Props {
  readonly kb: KnowledgeBase;
  readonly question: Question;
  readonly initial: Answer | null;
  readonly reason: QuestionReason | null;
  readonly modules: readonly string[];
  readonly left: number;
  readonly coverage: number;
  readonly autoAdvance: boolean;
  readonly canBack: boolean;
  /** Move focus to this question's legend on arrival (after the user has acted; not on the very first render of the screen). */
  readonly focusOnArrival: boolean;
  readonly onSubmit: (a: Answer) => void;
  readonly onBack: () => void;
}

const SEVERITIES: readonly Severity[] = ["light", "moderate", "severe"];

/** S07: one question. Options record symptoms (see model.ts); graded ones ask "how strong"; exclusive options replace each other with an explanation. */
export function QuestionCard({ kb, question, initial, reason, modules, left, coverage, autoAdvance, canBack, focusOnArrival, onSubmit, onBack }: Props): ReactNode {
  const { t } = useI18n();
  const legend = useRef<HTMLLegendElement>(null);
  const start = initial?.kind === "answered" ? initial : null;
  const [selected, setSelected] = useState<readonly string[]>(start?.options ?? []);
  const [severities, setSeverities] = useState<Readonly<Record<string, Severity>>>(start?.severities ?? {});
  const [note, setNote] = useState("");
  const [why, setWhy] = useState(false);

  // after Next the focus moves to the new question's legend (UX spec §8)
  useEffect(() => { if (focusOnArrival) legend.current?.focus(); }, [focusOnArrival]);

  const option = (id: string) => question.options.find((o) => o.id === id)!;
  const gradedOf = (id: string): string[] => option(id).symptoms.filter((s) => question.graded.includes(s));
  const groups = kb.exclusions.groups.filter((g) => g.kind === "exclusive");

  const choose = (id: string, on: boolean): void => {
    const o = option(id);
    let next: string[];
    let explain = "";
    if (question.select === "one") next = on ? [id] : [];
    else if (!on) next = selected.filter((x) => x !== id);
    else if (o.none) next = [id];
    else {
      next = selected.filter((x) => !option(x).none);
      // options whose symptoms exclude the new one are replaced, with the reason (never a silent pick)
      for (const x of selected) {
        const clash = groups.find((g) => g.symptoms.some((s) => o.symptoms.includes(s)) && g.symptoms.some((s) => option(x).symptoms.includes(s)) && !option(x).symptoms.every((s) => o.symptoms.includes(s)));
        if (clash) { next = next.filter((y) => y !== x); explain = t.localized(clash.reason).text; }
      }
      next.push(id);
    }
    setNote(explain === "" ? "" : t.t("intake.inquiry.exclusive", { reason: explain }));
    setSelected(next);
    if (question.select === "one" && on && autoAdvance && gradedOf(id).length === 0) onSubmit({ kind: "answered", options: next, severities: {} });
  };

  const graded = selected.flatMap(gradedOf);
  const submit = (): void => onSubmit({ kind: "answered", options: selected, severities: Object.fromEntries(graded.map((s) => [s, severities[s] ?? DEFAULT_SEVERITY])) });
  const symptomName = (id: string): string => { const s = kb.symptoms.get(id); return s ? kb.zh(s["zh-Hant"]) : id; };
  const whyText = reason === null ? null : reason.kind === "module"
    ? t.t("intake.inquiry.why.module", { module: t.localized(kb.modules.find((m) => m.id === reason.module)?.name ?? { "zh-Hant": reason.module, en: reason.module }).text })
    : t.t(`intake.inquiry.why.${reason.kind}`);
  void modules;

  const type = question.select === "one" ? "radio" : "checkbox";
  return (
    <div>
      <p className="muted" style={{ margin: "0 0 var(--space-2)" }}>{left > 0 ? t.plural("intake.inquiry.progress.left", left) : t.t("intake.inquiry.progress.almost")}</p>
      <Progress value={coverage} name={t.t("intake.inquiry.progress.name")} label={left > 0 ? t.plural("intake.inquiry.progress.left", left) : t.t("intake.inquiry.progress.almost")} />
      <fieldset style={{ border: 0, padding: 0, margin: "var(--space-4) 0 0", minWidth: 0 }}>
        <legend ref={legend} tabIndex={-1} style={{ padding: 0, fontSize: "1.25rem", fontWeight: 650, marginBottom: "var(--space-2)" }}>{t.localized(question.prompt).text}</legend>
        {question.hint ? <p className="muted">{t.localized(question.hint).text}</p> : null}
        <div style={{ display: "grid", gap: "var(--space-2)" }}>
          {question.options.map((o) => (
            <Tile key={o.id} type={type} name={`q-${question.id}`} value={o.id} checked={selected.includes(o.id)} label={t.localized(o.label).text} onChange={(on) => choose(o.id, on)}
              {...(o.symptoms.length > 0 ? { description: <>{o.symptoms.map((s, i) => <span key={s}>{i > 0 ? "・" : ""}<Term zh={kb.symptoms.get(s)?.["zh-Hant"] ?? s} /></span>)}</> } : {})} />
          ))}
        </div>
      </fieldset>
      {question.select === "many" && question.options.some((o) => o.none) ? <p className="muted" style={{ marginTop: "var(--space-2)" }}>{t.t("intake.inquiry.none.note")}</p> : null}
      {question.select === "one" && autoAdvance ? <p className="muted">{t.t("intake.inquiry.auto")}</p> : null}
      <p role="status" className="muted">{note}</p>

      {graded.map((s) => (
        <div key={s} style={{ margin: "var(--space-3) 0" }}>
          <SegmentedControl legend={t.t("intake.inquiry.severity.legend", { symptom: symptomName(s) })} value={severities[s] ?? DEFAULT_SEVERITY} onChange={(v) => setSeverities((m) => ({ ...m, [s]: v }))}
            options={SEVERITIES.map((v) => ({ value: v, label: t.t(`intake.inquiry.severity.${v}`) }))} />
        </div>
      ))}

      {whyText !== null ? (
        <div style={{ margin: "var(--space-3) 0" }}>
          <button type="button" aria-expanded={why} onClick={() => setWhy((v) => !v)} style={{ background: "none", border: 0, padding: 0, color: "var(--link)", textDecoration: "underline", minHeight: 44 }}>{t.t("intake.inquiry.why.button")}</button>
          {why ? <p role="note">{whyText}</p> : null}
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        <Button onClick={onBack} disabled={!canBack}>{t.t("intake.inquiry.back")}</Button>
        <Button onClick={() => onSubmit({ kind: "skipped" })}>{t.t("intake.inquiry.skip")}</Button>
        <Button variant="primary" onClick={submit} disabled={selected.length === 0}>{t.t("intake.inquiry.next")}</Button>
      </div>
    </div>
  );
}

import { useState, type ReactNode } from "react";
import type { MedicationClass, PregnancyStatus, Sex } from "@tcm/engine";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { useLoadedOptional } from "../../app/knowledge.tsx";
import type { Draft } from "../../storage/types.ts";
import { Card, CheckGroup, ChoiceGroup, Field, TagInput, TextInput } from "../../ui/index.ts";
import { isPregnancyRelevant, MED_CLASSES, parseAge, SERIOUS_CONDITIONS, seriousIn } from "./model.ts";
import { allergenSuggestions } from "./suggestions.ts";

export type Change = (change: (d: Draft) => Draft) => void;
interface CardProps { readonly draft: Draft; readonly change: Change }

function withoutKey<T extends object, K extends keyof T>(o: T, key: K): Omit<T, K> { const { [key]: _drop, ...rest } = o; return rest; }

export function AboutCard({ draft, change }: CardProps): ReactNode {
  const { t } = useI18n();
  const [text, setText] = useState(() => (draft.subject.ageYears === undefined ? "" : String(draft.subject.ageYears)));
  const [touched, setTouched] = useState(false);
  const age = parseAge(text);
  const error = !touched ? null : text.trim() === "" ? t.t("intake.profile.age.required") : age === null ? t.t("intake.profile.age.invalid") : null;
  const onAge = (value: string): void => {
    setText(value);
    const n = parseAge(value);
    change((d) => ({ ...d, subject: n === null ? withoutKey(d.subject, "ageYears") : { ...d.subject, ageYears: n } }));
  };
  return (
    <Card title={t.t("intake.profile.about.title")} id="profile-about">
      <Field label={t.t("intake.profile.age.label")} hint={t.t("intake.profile.age.hint")} error={error} required>
        <TextInput inputMode="numeric" autoComplete="off" maxLength={3} value={text} onChange={(e) => onAge(e.currentTarget.value)} onBlur={() => setTouched(true)} />
      </Field>
      <ChoiceGroup legend={t.t("intake.profile.sex.legend")} hint={t.t("intake.profile.sex.hint")} required inline value={draft.subject.sex ?? null}
        options={[{ value: "female", label: t.t("intake.profile.sex.female") }, { value: "male", label: t.t("intake.profile.sex.male") }]}
        onChange={(v) => change((d) => ({ ...d, subject: { ...d.subject, sex: v as Sex } }))} />
    </Card>
  );
}

export function PregnancyCard({ draft, change }: CardProps): ReactNode {
  const { t } = useI18n();
  if (!isPregnancyRelevant(draft.subject.sex, draft.subject.ageYears)) return null;
  const pregnancy = draft.subject.pregnancy === "not-applicable" ? null : (draft.subject.pregnancy ?? null);
  const lactating = draft.subject.lactating;
  return (
    <Card title={t.t("intake.profile.pregnancy.title")} id="profile-pregnancy">
      <ChoiceGroup legend={t.t("intake.profile.pregnancy.legend")} hint={t.t("intake.profile.pregnancy.hint")} required inline value={pregnancy}
        options={[{ value: "yes", label: t.t("intake.profile.pregnancy.yes") }, { value: "possible", label: t.t("intake.profile.pregnancy.possible") }, { value: "no", label: t.t("intake.profile.pregnancy.no") }]}
        onChange={(v) => change((d) => ({ ...d, subject: { ...d.subject, pregnancy: v as PregnancyStatus } }))} />
      <ChoiceGroup legend={t.t("intake.profile.lactating.legend")} required inline value={lactating === undefined ? null : lactating ? "yes" : "no"}
        options={[{ value: "yes", label: t.t("intake.profile.lactating.yes") }, { value: "no", label: t.t("intake.profile.lactating.no") }]}
        onChange={(v) => change((d) => ({ ...d, subject: { ...d.subject, lactating: v === "yes" } }))} />
    </Card>
  );
}

const medLabel = (c: MedicationClass): MessageKey => `intake.profile.meds.${c}` as MessageKey;

function Medications({ draft, change }: CardProps): ReactNode {
  const { t } = useI18n();
  const answer = draft.profile.medications ?? null;
  const picked = (draft.subject.medications ?? []).filter((c) => (MED_CLASSES as readonly string[]).includes(c));
  const setAnswer = (v: string): void => change((d) => {
    const medications = v as "none" | "some" | "unsure";
    const keep = medications === "some";
    return { ...d, subject: keep ? d.subject : withoutKey(d.subject, "medications"), profile: { ...d.profile, medications, medicationText: keep ? d.profile.medicationText : [] } };
  });
  return (
    <>
      <ChoiceGroup legend={t.t("intake.profile.meds.legend")} required value={answer}
        options={[{ value: "none", label: t.t("intake.profile.meds.none") }, { value: "some", label: t.t("intake.profile.meds.some") }, { value: "unsure", label: t.t("intake.profile.meds.unsure") }]} onChange={setAnswer} />
      {answer === "unsure" ? <p className="muted">{t.t("intake.profile.meds.unsureNote")}</p> : null}
      {answer === "some" ? (
        <>
          <CheckGroup legend={t.t("intake.profile.meds.classes.legend")} hint={t.t("intake.profile.meds.classes.hint")} values={picked}
            options={MED_CLASSES.map((c) => ({ value: c, label: t.t(medLabel(c)), description: t.t(`${medLabel(c)}.eg` as MessageKey) }))}
            onChange={(values) => change((d) => ({ ...d, subject: { ...d.subject, medications: values as MedicationClass[] } }))} />
          {picked.includes("other") ? (
            <TagInput label={t.t("intake.profile.meds.text.label")} hint={t.t("intake.profile.meds.text.hint")} addLabel={t.t("intake.profile.tag.add")}
              removeLabel={(name) => t.t("intake.profile.tag.remove", { name })} values={draft.profile.medicationText}
              onChange={(values) => change((d) => ({ ...d, profile: { ...d.profile, medicationText: values } }))} />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function Allergies({ draft, change }: CardProps): ReactNode {
  const { t, lang } = useI18n();
  const loaded = useLoadedOptional();
  const answer = draft.profile.allergies ?? null;
  const suggestions = loaded ? allergenSuggestions(loaded.kb, lang) : [];
  // An allergy is matched by the safety rules against the names in the data, which are in the data's own script. What a person types or picks in the Simplified display script is turned back into
  // that script before it is stored (when it names exactly one thing the data knows); what is stored is shown through `t.zh` again. Text that names nothing is kept as it was typed.
  const toStored = (values: readonly string[], previous: readonly string[]): string[] => values.map((v) => {
    const kept = previous.find((p) => t.zh(p) === v);
    if (kept !== undefined) return kept;
    const forms = loaded?.kb.traditional(v) ?? [v];
    return forms.length === 1 ? forms[0]! : v;
  });
  return (
    <>
      <ChoiceGroup legend={t.t("intake.profile.allergy.legend")} required inline value={answer}
        options={[{ value: "none", label: t.t("intake.profile.allergy.none") }, { value: "some", label: t.t("intake.profile.allergy.some") }]}
        onChange={(v) => change((d) => ({ ...d, subject: v === "some" ? d.subject : withoutKey(d.subject, "allergies"), profile: { ...d.profile, allergies: v as "none" | "some" } }))} />
      {answer === "some" ? (
        <TagInput label={t.t("intake.profile.allergy.label")} hint={t.t("intake.profile.allergy.hint")} addLabel={t.t("intake.profile.tag.add")}
          removeLabel={(name) => t.t("intake.profile.tag.remove", { name })} values={(draft.subject.allergies ?? []).map((a) => t.zh(a))} suggestions={suggestions}
          onChange={(values) => change((d) => ({ ...d, subject: { ...d.subject, allergies: toStored(values, d.subject.allergies ?? []) } }))} />
      ) : null}
    </>
  );
}

function Conditions({ draft, change }: CardProps): ReactNode {
  const { t } = useI18n();
  const serious = seriousIn(draft);
  const current = draft.profile.conditions === "none" ? ["none"] : serious;
  const onChange = (next: readonly string[]): void => {
    const addedNone = next.includes("none") && !current.includes("none");
    const chosen = next.filter((v) => v !== "none");
    change((d) => {
      const rest = d.redFlags.filter((id) => !(SERIOUS_CONDITIONS as readonly string[]).includes(id));
      if (addedNone) return { ...d, redFlags: rest, profile: { ...d.profile, conditions: "none" } };
      if (chosen.length > 0) return { ...d, redFlags: [...rest, ...chosen], profile: { ...d.profile, conditions: "some" } };
      return { ...d, redFlags: rest, profile: withoutKey(d.profile, "conditions") as Draft["profile"] };
    });
  };
  return (
    <CheckGroup legend={t.t("intake.profile.conditions.legend")} required values={current} onChange={onChange}
      options={[...SERIOUS_CONDITIONS.map((id) => ({ value: id, label: t.t(`intake.profile.conditions.${id}` as MessageKey) })), { value: "none", label: t.t("intake.profile.conditions.none") }]} />
  );
}

export function HealthCard(props: CardProps): ReactNode {
  const { t } = useI18n();
  return (
    <Card title={t.t("intake.profile.health.title")} id="profile-health">
      <Medications {...props} />
      <Allergies {...props} />
      <Conditions {...props} />
    </Card>
  );
}

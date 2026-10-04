// The pure part of S02 (UX spec §4.2): which questions apply, what is still missing, and how the answers become the engine's `Subject`.
import type { MedicationClass, PregnancyStatus, Sex, Subject } from "@tcm/engine";
import type { Draft } from "../../storage/types.ts";

export const MAX_AGE = 120;

/** Medicine classes offered, in the order of the safety policy (§ medication classes). */
export const MED_CLASSES = ["anticoagulant", "antidiabetic", "antihypertensive", "diuretic", "cardiac-glycoside", "immunosuppressant", "sedative", "MAOI", "stimulant", "other"] as const satisfies readonly MedicationClass[];

/** The red-flag items of scope level C that mean "serious long-term condition" (asked here, confirmed on S04). */
export const SERIOUS_CONDITIONS = ["RF_C_CANCER_TREATMENT", "RF_C_KIDNEY", "RF_C_LIVER", "RF_C_TRANSPLANT", "RF_C_PSYCHIATRIC", "RF_C_CARDIOPULMONARY"] as const;

/** Pregnancy and breastfeeding are asked of females of child-bearing age. Elsewhere the engine receives "not-applicable" / not lactating. */
export const PREGNANCY_AGE = { min: 10, max: 60 } as const;
export const isPregnancyRelevant = (sex: Sex | undefined, age: number | undefined): boolean =>
  sex === "female" && age !== undefined && age >= PREGNANCY_AGE.min && age <= PREGNANCY_AGE.max;

export type MissingItem = "age" | "sex" | "pregnancy" | "lactating" | "medications" | "allergies" | "conditions";

/** Parse the age field: a whole number of years from 0 to 120, or `null`. */
export function parseAge(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= 0 && n <= MAX_AGE ? n : null;
}

/** What still has to be answered before the profile is complete, in screen order. Empty = complete. Silence is never read as "no". */
export function missingItems(d: Draft): MissingItem[] {
  const s = d.subject;
  const out: MissingItem[] = [];
  if (s.ageYears === undefined) out.push("age");
  if (s.sex === undefined) out.push("sex");
  if (isPregnancyRelevant(s.sex, s.ageYears)) {
    if (s.pregnancy === undefined || s.pregnancy === "not-applicable") out.push("pregnancy");
    if (s.lactating === undefined) out.push("lactating");
  }
  if (d.profile.medications === undefined) out.push("medications");
  if (d.profile.allergies === undefined) out.push("allergies");
  if (d.profile.conditions === undefined) out.push("conditions");
  return out;
}

/** The medicine classes the engine gets: the ticked ones; "not sure" counts as "other" (the safety policy is conservative on doubt). */
export function medicationClasses(d: Draft): MedicationClass[] {
  const a = d.profile.medications;
  if (a === "unsure") return ["other"];
  if (a !== "some") return [];
  const picked = new Set(d.subject.medications ?? []);
  if (d.profile.medicationText.length > 0) picked.add("other");
  return MED_CLASSES.filter((c) => picked.has(c));
}

/** The engine's `Subject` from a complete profile, or `null` while something is missing. Birth data is attached by the caller. */
export function subjectOf(d: Draft): Subject | null {
  if (missingItems(d).length > 0) return null;
  const s = d.subject;
  const relevant = isPregnancyRelevant(s.sex, s.ageYears);
  const pregnancy: PregnancyStatus = relevant ? s.pregnancy! : "not-applicable";
  return {
    ageYears: s.ageYears!, sex: s.sex!, pregnancy, lactating: relevant ? s.lactating! : false,
    medications: medicationClasses(d), allergies: d.profile.allergies === "some" ? [...(s.allergies ?? [])] : [],
    seriousChronicDisease: d.profile.conditions === "some",
  };
}

/** Serious-condition ids currently in the draft's red flags. */
export const seriousIn = (d: Draft): string[] => d.redFlags.filter((id) => (SERIOUS_CONDITIONS as readonly string[]).includes(id));

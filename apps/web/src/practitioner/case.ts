// The practitioner reference (PM-65; docs/post-mvp/design/practitioner-reference.md): the case a practitioner describes, in the form the skill hands to the engine —
// the person, the findings, the tongue, the pulse and the constitution the practitioner states — checked against the knowledge base's own vocabulary and turned
// into the app's draft with the app's own functions. What the practitioner reports is recorded as said: a finding mentioned is present (with its severity where the
// question grades it), a finding denied is absent, and a finding not mentioned stays unknown; a question the practitioner answers as a whole (`answers`) is recorded
// as the app records an answer (its other options absent). Silence is never "no": a missing safety fact is asked for, not assumed.
import type { MedicationClass, Severity, Sex } from "@tcm/engine";
import type { KnowledgeBase, Question } from "@tcm/kb";
import { applyAnswer, DEFAULT_SEVERITY } from "../screens/inquiry/model.ts";
import { answerCategory, applyPulse, RATE_GROUP, setSign, type Rhythm, type TongueCategory } from "../screens/observe/model.ts";
import { isPregnancyRelevant, MAX_AGE, MED_CLASSES, missingItems, SERIOUS_CONDITIONS, type MissingItem } from "../screens/profile/model.ts";
import { withAnswer } from "../screens/screening/model.ts";
import { newDraft } from "../storage/draft.ts";
import type { Draft } from "../storage/types.ts";

export type CaseLang = "zh-Hant" | "en";
export const CASE_LANGS: readonly CaseLang[] = ["zh-Hant", "en"];
export type Mention = "present" | "absent" | "unsure" | Severity;
const MENTIONS: readonly Mention[] = ["present", "absent", "unsure", "light", "moderate", "severe"];
const TONGUE_CATEGORIES: readonly TongueCategory[] = ["body", "shape", "coat"];

/** A case as the practitioner describes it (the skill writes it as JSON; `references/case-format.md` of the skill documents every field). */
export interface PractitionerCase {
  /** The language of the report: the practitioner's. */
  readonly lang?: CaseLang;
  /** The day the patient is seen (YYYY-MM-DD): the season the amounts are adjusted for (因時). Default: today. */
  readonly date?: string;
  /** The calendar of the seasons: the northern hemisphere's (default) or the southern's. */
  readonly hemisphere?: "north" | "south";
  readonly person: {
    readonly age?: number;
    readonly sex?: Sex;
    /** Asked of a woman of 10 to 60. */
    readonly pregnancy?: "no" | "possible" | "yes";
    /** Asked of a woman of 10 to 60. */
    readonly lactating?: boolean;
    readonly medications?: { readonly status: "none" | "some" | "unsure"; readonly classes?: readonly MedicationClass[]; readonly named?: readonly string[] };
    readonly allergies?: { readonly status: "none" | "some"; readonly items?: readonly string[] };
    /** Serious long-term conditions: the level-C red-flag items (RF_C_KIDNEY …). */
    readonly conditions?: { readonly status: "none" | "some"; readonly items?: readonly string[] };
  };
  /** Red-flag items of levels A and B the practitioner found (ids). */
  readonly redFlags?: readonly string[];
  /** The constitution the practitioner states, with an optional second biased type. */
  readonly constitution?: { readonly primary: string; readonly secondary?: string };
  readonly course?: "acute" | "subacute" | "chronic";
  /** Symptoms of the inquiry by id: present (or its severity), absent, or unsure. */
  readonly findings?: Readonly<Record<string, Mention>>;
  /** Questions answered as a whole: the chosen option ids, `"none"` (none of them), or `"skip"` (not known). Their other options are recorded absent. */
  readonly answers?: Readonly<Record<string, readonly string[] | "none" | "skip">>;
  /** The whole-tongue categories (the chosen features, or "normal"), and zone features and special signs present. */
  readonly tongue?: { readonly body?: readonly string[] | "normal"; readonly shape?: readonly string[] | "normal"; readonly coat?: readonly string[] | "normal"; readonly signs?: readonly string[] };
  /** The pulse: the rate (beats per minute), the rhythm, and the qualities felt. */
  readonly pulse?: { readonly rate?: number; readonly rhythm?: Rhythm; readonly qualities?: readonly string[] };
  /** What the practitioner said that the vocabulary does not hold: shown in the report, never used. */
  readonly unmapped?: readonly string[];
}

export interface CaseError {
  /** Where in the case, as a path: `person/age`, `findings/S_X`, `answers/Q_COLD` … */
  readonly path: string;
  readonly message: string;
  /** Ids the field might have meant. */
  readonly suggest?: readonly string[];
}

// ── reading the JSON ─────────────────────────────────────────────────────────

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isStrings = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === "string");

/** Edit distance, for "did you mean". */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length]!;
}

/** The ids closest to `id` (at most three): those within a third of its length, else none. */
export function closest(id: string, ids: Iterable<string>): string[] {
  const up = id.toUpperCase();
  return [...ids].map((x) => ({ x, d: distance(up, x.toUpperCase()) })).filter((c) => c.d <= Math.max(2, Math.floor(id.length / 3))).sort((a, b) => a.d - b.d || (a.x < b.x ? -1 : 1)).slice(0, 3).map((c) => c.x);
}

/** The questions of a symptom, and the question each symptom belongs to. */
function symptomIndex(kb: KnowledgeBase): Map<string, Question> {
  const out = new Map<string, Question>();
  for (const q of kb.questions) for (const o of q.options) for (const s of o.symptoms) if (!out.has(s)) out.set(s, q);
  return out;
}

/**
 * Check a case against the knowledge base and return it typed, with every problem found (an empty list: the case can be run). The checks are of form and of
 * vocabulary — unknown ids (with the closest known ones), a severity on a symptom its question does not grade, two findings of an exclusive group, a question for the
 * other sex, a pulse rate against a rate quality — never of clinical sense, which is the engine's and the practitioner's.
 */
export function readCase(kb: KnowledgeBase, input: unknown): { readonly value: PractitionerCase | null; readonly errors: readonly CaseError[] } {
  const errors: CaseError[] = [];
  const err = (path: string, message: string, suggest?: readonly string[]): void => { errors.push({ path, message, ...(suggest && suggest.length > 0 ? { suggest } : {}) }); };
  if (!isRecord(input)) return { value: null, errors: [{ path: "", message: "the case must be a JSON object" }] };
  const known = new Set(["lang", "date", "hemisphere", "person", "redFlags", "constitution", "course", "findings", "answers", "tongue", "pulse", "unmapped"]);
  for (const k of Object.keys(input)) if (!known.has(k)) err(k, "unknown field", closest(k, known));

  if (input.lang !== undefined && !CASE_LANGS.includes(input.lang as CaseLang)) err("lang", `one of ${CASE_LANGS.join(", ")}`);
  if (input.date !== undefined && (typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(`${input.date}T12:00:00Z`)))) err("date", "a date as YYYY-MM-DD");
  if (input.hemisphere !== undefined && input.hemisphere !== "north" && input.hemisphere !== "south") err("hemisphere", "north or south");

  // the person
  const person = isRecord(input.person) ? input.person : (err("person", "the person is required: age, sex, medications, allergies, conditions"), {});
  const pKnown = new Set(["age", "sex", "pregnancy", "lactating", "medications", "allergies", "conditions"]);
  for (const k of Object.keys(person)) if (!pKnown.has(k)) err(`person/${k}`, "unknown field", closest(k, pKnown));
  if (person.age !== undefined && (typeof person.age !== "number" || !Number.isInteger(person.age) || person.age < 0 || person.age > MAX_AGE)) err("person/age", `whole years from 0 to ${MAX_AGE}`);
  if (person.sex !== undefined && person.sex !== "female" && person.sex !== "male") err("person/sex", "female or male");
  if (person.pregnancy !== undefined && !["no", "possible", "yes"].includes(person.pregnancy as string)) err("person/pregnancy", "no, possible or yes");
  if (person.lactating !== undefined && typeof person.lactating !== "boolean") err("person/lactating", "true or false");
  const relevant = isPregnancyRelevant(person.sex as Sex | undefined, typeof person.age === "number" ? person.age : undefined);
  if (!relevant && person.sex !== undefined && person.age !== undefined && (person.pregnancy === "yes" || person.pregnancy === "possible" || person.lactating === true)) err("person/pregnancy", "pregnancy and breastfeeding are recorded for a woman of 10 to 60 only");
  const meds = person.medications;
  if (meds !== undefined) {
    if (!isRecord(meds) || !["none", "some", "unsure"].includes(meds.status as string)) err("person/medications", "{ status: none | some | unsure, classes?: [...], named?: [...] }");
    else {
      if (meds.classes !== undefined && !isStrings(meds.classes)) err("person/medications/classes", "a list of medicine classes");
      for (const c of isStrings(meds.classes) ? meds.classes : []) if (!(MED_CLASSES as readonly string[]).includes(c)) err("person/medications/classes", `unknown medicine class "${c}"`, closest(c, MED_CLASSES));
      if (meds.named !== undefined && !isStrings(meds.named)) err("person/medications/named", "a list of medicine names");
      if (meds.status === "some" && (!isStrings(meds.classes) || meds.classes.length === 0) && (!isStrings(meds.named) || meds.named.length === 0)) err("person/medications", "status some: give the classes (or the names: a named medicine of no listed class counts as \"other\")");
      if (meds.status !== "some" && ((isStrings(meds.classes) && meds.classes.length > 0) || (isStrings(meds.named) && meds.named.length > 0))) err("person/medications", "classes or names given with a status other than some");
    }
  }
  const allergies = person.allergies;
  if (allergies !== undefined) {
    if (!isRecord(allergies) || !["none", "some"].includes(allergies.status as string)) err("person/allergies", "{ status: none | some, items?: [...] }");
    else if (allergies.status === "some" && (!isStrings(allergies.items) || allergies.items.length === 0)) err("person/allergies/items", "status some: name what the patient is allergic to");
  }
  const conditions = person.conditions;
  if (conditions !== undefined) {
    if (!isRecord(conditions) || !["none", "some"].includes(conditions.status as string)) err("person/conditions", "{ status: none | some, items?: [RF_C_… ids] }");
    else {
      for (const id of isStrings(conditions.items) ? conditions.items : []) if (!(SERIOUS_CONDITIONS as readonly string[]).includes(id)) err("person/conditions/items", `not a serious long-term condition: "${id}"`, closest(id, SERIOUS_CONDITIONS));
      if (conditions.status === "some" && (!isStrings(conditions.items) || conditions.items.length === 0)) err("person/conditions/items", "status some: give the condition ids");
    }
  }

  // red flags (levels A and B; level C is the person's)
  const flags = new Map(kb.redFlags.map((f) => [f.id, f]));
  if (input.redFlags !== undefined && !isStrings(input.redFlags)) err("redFlags", "a list of red-flag ids");
  for (const id of isStrings(input.redFlags) ? input.redFlags : []) {
    const f = flags.get(id);
    if (f === undefined) err("redFlags", `unknown red flag "${id}"`, closest(id, [...flags.keys()].filter((x) => !x.startsWith("RF_C_"))));
    else if (f.level === "C") err("redFlags", `"${id}" is of level C: record it on the person (pregnancy, lactation, age, conditions)`);
  }

  // the constitution
  const types = kb.constitutions.map((c) => c.id);
  if (input.constitution !== undefined) {
    const c = input.constitution;
    if (!isRecord(c) || typeof c.primary !== "string") err("constitution", "{ primary: C_…, secondary?: C_… }");
    else {
      if (!types.includes(c.primary)) err("constitution/primary", `unknown constitution "${c.primary}"`, closest(c.primary, types));
      if (c.secondary !== undefined && (typeof c.secondary !== "string" || !types.includes(c.secondary) || c.secondary === c.primary || c.secondary === "C_PINGHE" || c.primary === "C_PINGHE")) err("constitution/secondary", "another biased constitution", typeof c.secondary === "string" ? closest(c.secondary, types) : undefined);
    }
  }
  if (input.course !== undefined && !["acute", "subacute", "chronic"].includes(input.course as string)) err("course", "acute, subacute or chronic");

  // the inquiry: findings and whole answers
  const bySymptom = symptomIndex(kb);
  const sex = person.sex as Sex | undefined;
  const forOtherSex = (q: Question): boolean => q.requires?.sex !== undefined && sex !== undefined && q.requires.sex !== sex;
  const findings = input.findings;
  const said = new Map<string, Mention>();
  if (findings !== undefined && !isRecord(findings)) err("findings", "an object of symptom id → present | absent | unsure | light | moderate | severe");
  for (const [id, m] of Object.entries(isRecord(findings) ? findings : {})) {
    const q = bySymptom.get(id);
    if (q === undefined) {
      const hint = id.startsWith("T_") ? " (a tongue feature: put it under tongue)" : id.startsWith("P_") ? " (a pulse: put it under pulse.qualities)" : "";
      err(`findings/${id}`, `not a symptom of the inquiry${hint}`, hint ? undefined : closest(id, bySymptom.keys()));
      continue;
    }
    if (!MENTIONS.includes(m as Mention)) { err(`findings/${id}`, `one of ${MENTIONS.join(", ")}`); continue; }
    if ((m === "light" || m === "moderate" || m === "severe") && !q.graded.includes(id)) err(`findings/${id}`, `${id} is not graded: use present`);
    if (forOtherSex(q)) err(`findings/${id}`, `${id} is asked of the ${q.requires!.sex} sex only`);
    said.set(id, m as Mention);
  }
  const answers = input.answers;
  if (answers !== undefined && !isRecord(answers)) err("answers", "an object of question id → [option ids] | \"none\" | \"skip\"");
  const answered = new Set<string>();
  for (const [qid, a] of Object.entries(isRecord(answers) ? answers : {})) {
    const q = kb.questionById.get(qid);
    if (q === undefined) { err(`answers/${qid}`, "unknown question", closest(qid, kb.questionById.keys())); continue; }
    if (q.options.some((o) => o.context)) { err(`answers/${qid}`, "the course is given as course: acute | subacute | chronic"); continue; }
    if (forOtherSex(q)) err(`answers/${qid}`, `asked of the ${q.requires!.sex} sex only`);
    if (a !== "none" && a !== "skip" && !isStrings(a)) { err(`answers/${qid}`, "a list of option ids, \"none\" or \"skip\""); continue; }
    answered.add(qid);
    const options = q.options.filter((o) => !o.none);
    for (const o of isStrings(a) ? a : []) {
      if (options.some((x) => x.id === o)) continue;
      const near = closest(o, options.map((x) => x.id));
      err(`answers/${qid}`, `unknown option "${o}"`, near.length > 0 ? near : options.map((x) => x.id));
    }
    if (isStrings(a) && q.select === "one" && a.length > 1) err(`answers/${qid}`, "this question takes one option");
    if (isStrings(a) && a.length === 0) err(`answers/${qid}`, "no option chosen: use \"none\" or \"skip\"");
    for (const s of q.options.flatMap((o) => o.symptoms)) if (said.has(s)) err(`answers/${qid}`, `${s} is also under findings: give the question either as a whole answer or symptom by symptom`);
  }
  // exclusive groups over everything present
  const present = new Set([...said].filter(([, m]) => m !== "absent" && m !== "unsure").map(([id]) => id));
  for (const [qid, a] of Object.entries(isRecord(answers) ? answers : {})) {
    const q = kb.questionById.get(qid);
    if (q && isStrings(a)) for (const o of q.options.filter((x) => a.includes(x.id))) for (const s of o.symptoms) present.add(s);
  }
  for (const q of kb.questions) for (const g of q.exclusive_groups) {
    const both = g.filter((s) => present.has(s));
    if (both.length > 1) err(`findings/${both[0]}`, `${both.join(" and ")} exclude each other`);
  }

  // the tongue and the pulse
  const tongue = input.tongue;
  const tf = new Map(kb.tongue.features.map((f) => [f.id, f]));
  if (tongue !== undefined && !isRecord(tongue)) err("tongue", "{ body?, shape?, coat?: [ids] | \"normal\", signs?: [ids] }");
  for (const [k, v] of Object.entries(isRecord(tongue) ? tongue : {})) {
    if (k === "signs") {
      if (!isStrings(v)) { err("tongue/signs", "a list of tongue-feature ids"); continue; }
      for (const id of v) {
        const f = tf.get(id);
        if (f === undefined) err("tongue/signs", `unknown tongue feature "${id}"`, closest(id, tf.keys()));
        else if ((TONGUE_CATEGORIES as readonly string[]).includes(f.category)) err("tongue/signs", `"${id}" is of the ${f.category}: put it under tongue.${f.category}`);
      }
      continue;
    }
    if (!(TONGUE_CATEGORIES as readonly string[]).includes(k)) { err(`tongue/${k}`, "unknown field", closest(k, [...TONGUE_CATEGORIES, "signs"])); continue; }
    if (v === "normal") continue;
    if (!isStrings(v) || v.length === 0) { err(`tongue/${k}`, "a list of feature ids, or \"normal\""); continue; }
    for (const id of v) {
      const f = tf.get(id);
      if (f === undefined || f.category !== k) err(`tongue/${k}`, `not a ${k} feature: "${id}"`, closest(id, [...tf.values()].filter((x) => x.category === k).map((x) => x.id)));
    }
  }
  const pulse = input.pulse;
  const pulses = new Map(kb.pulse.pulses.map((p) => [p.id, p]));
  if (pulse !== undefined) {
    if (!isRecord(pulse)) err("pulse", "{ rate?, rhythm?, qualities?: [ids] }");
    else {
      for (const k of Object.keys(pulse)) if (!["rate", "rhythm", "qualities"].includes(k)) err(`pulse/${k}`, "unknown field", closest(k, ["rate", "rhythm", "qualities"]));
      if (pulse.rate !== undefined && (typeof pulse.rate !== "number" || !Number.isInteger(pulse.rate) || pulse.rate < 20 || pulse.rate > 250)) err("pulse/rate", "beats per minute, 20 to 250");
      if (pulse.rhythm !== undefined && !["regular", "skips", "irregular"].includes(pulse.rhythm as string)) err("pulse/rhythm", "regular, skips or irregular");
      if (pulse.qualities !== undefined && !isStrings(pulse.qualities)) err("pulse/qualities", "a list of pulse ids");
      for (const id of isStrings(pulse.qualities) ? pulse.qualities : []) {
        const p = pulses.get(id);
        if (p === undefined) err("pulse/qualities", `unknown pulse "${id}"`, closest(id, pulses.keys()));
        else if (p.group === RATE_GROUP && typeof pulse.rate === "number") err("pulse/qualities", `"${id}" is read from the rate: give the rate or the quality, not both`);
      }
    }
  }
  if (input.unmapped !== undefined && !isStrings(input.unmapped)) err("unmapped", "a list of the practitioner's words the vocabulary does not hold");
  return { value: errors.length === 0 ? (input as unknown as PractitionerCase) : null, errors };
}

// ── the draft ────────────────────────────────────────────────────────────────

/** The app's draft of a checked case (`readCase` found no error), made with the app's own functions so the engine reads it as it reads the app's. */
export function draftOf(kb: KnowledgeBase, c: PractitionerCase, now: number): Draft {
  const p = c.person;
  const relevant = isPregnancyRelevant(p.sex, p.age);
  const meds = p.medications;
  let d: Draft = {
    ...newDraft("practitioner-case", now, "/review"),
    subject: {
      ...(p.age !== undefined ? { ageYears: p.age } : {}), ...(p.sex !== undefined ? { sex: p.sex } : {}),
      ...(relevant && p.pregnancy !== undefined ? { pregnancy: p.pregnancy } : {}), ...(relevant && p.lactating !== undefined ? { lactating: p.lactating } : {}),
      ...(meds?.status === "some" ? { medications: [...(meds.classes ?? [])] } : {}),
      ...(p.allergies?.status === "some" ? { allergies: [...(p.allergies.items ?? [])] } : {}),
    },
    profile: {
      medicationText: meds?.status === "some" ? [...(meds.named ?? [])].filter((n) => n.trim().length > 0) : [],
      ...(meds !== undefined ? { medications: meds.status } : {}),
      ...(p.allergies !== undefined ? { allergies: p.allergies.status } : {}),
      ...(p.conditions !== undefined ? { conditions: p.conditions.status } : {}),
    },
    context: c.course !== undefined ? { course: c.course } : {},
  };
  // the red flags of levels A and B as the screening records them; the serious conditions as the profile does
  for (const id of c.redFlags ?? []) d = withAnswer(d, id, "yes");
  for (const id of p.conditions?.status === "some" ? (p.conditions.items ?? []) : []) d = withAnswer(d, id, "yes");
  // whole answers as the inquiry records them; then the findings, each as said
  for (const [qid, a] of Object.entries(c.answers ?? {})) {
    const q = kb.questionById.get(qid)!;
    d = applyAnswer(d, q, a === "skip" ? { kind: "skipped" } : { kind: "answered", options: a === "none" ? q.options.filter((o) => o.none).map((o) => o.id) : [...a], severities: {} });
  }
  const findings = { ...d.findings };
  for (const [id, m] of Object.entries(c.findings ?? {})) {
    findings[id] = m === "absent" || m === "unsure" ? { state: m } : m === "present" ? (kb.questions.some((q) => q.graded.includes(id)) ? { state: "present", severity: DEFAULT_SEVERITY } : { state: "present" }) : { state: "present", severity: m };
  }
  d = { ...d, findings, inquiry: { ...d.inquiry, modules: [], history: kb.questions.filter((q) => q.options.some((o) => o.symptoms.some((s) => s in findings)) || (q.options.some((o) => o.context) && c.course !== undefined)).map((q) => q.id) } };
  // the tongue and the pulse as the observation screens record them
  for (const cat of TONGUE_CATEGORIES) {
    const v = c.tongue?.[cat];
    if (v !== undefined) d = answerCategory(d, kb, cat, v === "normal" ? { kind: "normal" } : { kind: "chosen", ids: v });
  }
  for (const id of c.tongue?.signs ?? []) d = setSign(d, id, true);
  if (c.pulse !== undefined) d = applyPulse(d, kb, { rate: c.pulse.rate ?? null, rhythm: c.pulse.rhythm ?? null, qualities: [...(c.pulse.qualities ?? [])], position: null, ...(c.pulse.rate !== undefined ? { method: "typed" as const } : {}) });
  return d;
}

/** What the person still lacks before the engine can run (the app's own list: silence is never "no"). */
export const missingOf = (d: Draft): MissingItem[] => missingItems(d);

/** The moment the case is computed for: noon (UTC) of its date, or now. */
export function momentOf(c: PractitionerCase, now: number): number {
  if (c.date === undefined) return now;
  return Date.parse(`${c.date}T12:00:00Z`);
}

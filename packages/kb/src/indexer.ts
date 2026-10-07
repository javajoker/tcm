import { KbError } from "./errors.ts";
import { herbBrowser } from "./herbs.ts";
import type { Cities, GlossaryTerm, KnowledgeBase, RawKbChunks, TreatmentGuidance } from "./types.ts";

/** The schema version this build of the app understands (data/schema, `_meta.schema`). A KB with another version is refused. */
export const SUPPORTED_SCHEMA_VERSION = 1;

function toMap<T extends { readonly id: string }>(items: readonly T[], what: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) throw new KbError("index-invalid", `duplicate ${what} id ${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

/**
 * Build the runtime view of a knowledge base from its chunks. Pure and synchronous: Node tests feed it chunks read with `fs`, the browser
 * feeds it what the loader fetched. It checks only what the app depends on at run time (identity, a few references); the full validation
 * is done by the Python build (`scripts/kb/validate_kb.py`) and the bundler.
 */
export function indexKnowledgeBase(raw: RawKbChunks, display?: { zh(text: string): string; traditional(text: string): readonly string[] }): KnowledgeBase {
  if (raw.schemaVersion !== SUPPORTED_SCHEMA_VERSION || raw.core.params._meta.schema !== SUPPORTED_SCHEMA_VERSION) {
    throw new KbError("schema-mismatch", `knowledge base schema ${raw.schemaVersion} is not supported (expected ${SUPPORTED_SCHEMA_VERSION})`);
  }
  const { core } = raw;
  const symptoms = toMap(core.symptoms.items, "symptom");
  const questionById = toMap(core.questions.items, "question");
  const patternById = toMap(core.patterns.items, "pattern");
  const elementById = toMap(core.elements.items, "element");
  const formulas = toMap(raw.formulas.items, "formula");
  const herbs = raw.herbs ? toMap(raw.herbs.items, "herb") : null;
  const citations = toMap(raw.citations.items, "citation");

  for (const p of core.patterns.items) {
    for (const s of [...Object.keys(p.weights), ...Object.keys(p.against), ...p.required_any]) {
      if (!symptoms.has(s)) throw new KbError("index-invalid", `pattern ${p.id} uses unknown symptom ${s}`);
    }
    for (const f of p.formulas) {
      if (!formulas.has(f)) throw new KbError("index-invalid", `pattern ${p.id} lists formula ${f} which is not in this bundle`);
    }
  }
  for (const q of core.questions.items) {
    for (const o of q.options) for (const s of o.symptoms) if (!symptoms.has(s)) throw new KbError("index-invalid", `question ${q.id} uses unknown symptom ${s}`);
  }
  for (const f of formulas.values()) {
    for (const c of f.composition) {
      if (!(c.herb in raw.formulas.herbNames)) throw new KbError("index-invalid", `formula ${f.id} uses herb ${c.herb} without a display name`);
      if (herbs && !herbs.has(c.herb)) throw new KbError("index-invalid", `formula ${f.id} uses herb ${c.herb} which is not in this bundle`);
    }
  }

  // the treatment guidance: the engine's part (core) and the texts (guidance chunk) merged into one view; every point has both halves
  const treatment: TreatmentGuidance = {
    ...core.treatment, acupressure: raw.guidance.acupressure, foods: raw.guidance.foods, lifestyle: raw.guidance.lifestyle,
    acupoints: Object.fromEntries(Object.entries(core.treatment.acupoints).map(([name, a]) => {
      const text = raw.guidance.acupoints[name];
      if (!text) throw new KbError("index-invalid", `acupoint ${name} has no guidance text`);
      return [name, { ...a, ...text }];
    })),
  };

  const terms = new Map<string, GlossaryTerm>();
  for (const t of core.glossary.items) if (!terms.has(t["zh-Hant"])) terms.set(t["zh-Hant"], t);

  // the fold the safety rules compare names with: a character of the data's script → its other-script form ("53C3:53C2", code points in hex)
  const fold = new Map(core.nameFold.fold.map((pair) => { const [a, b] = pair.split(":").map((h) => String.fromCodePoint(parseInt(h, 16))); return [a!, b!] as const; }));
  const folded = new Map<string, string>();
  const foldName = (text: string): string => {
    let out = folded.get(text);
    if (out === undefined) { out = [...text].map((c) => fold.get(c) ?? c).join(""); folded.set(text, out); }
    return out;
  };

  return {
    version: raw.version,
    profile: core.config.profileName,
    schemaVersion: raw.schemaVersion,
    config: core.config,
    params: core.params,
    symptoms,
    questions: core.questions.items,
    questionById,
    modules: core.questions.modules,
    exclusions: core.exclusions,
    orientation: core.orientation,
    patterns: core.patterns.items,
    patternById,
    elements: core.elements.items,
    elementById,
    constitutions: core.constitutions.items,
    redFlags: core.redFlags.items,
    tongue: core.tongue,
    pulse: core.pulse,
    panelSchema: core.panelSchema,
    formulas,
    herbs,
    prescription: raw.herbs?.prescription ?? null,
    safety: core.safety,
    treatment,
    wuxing: core.wuxing,
    glossary: core.glossary.items,
    emergency: core.emergency,
    foldName,
    constitutionItems: core.constitutionItems,
    herbName: (id) => raw.formulas.herbNames[id],
    cities: (() => { let loaded: Promise<Cities> | null = null; return () => (loaded ??= Promise.resolve(typeof raw.cities === "function" ? raw.cities() : raw.cities)); })(),
    herbBrowser: raw.herbBrowser ? herbBrowser(raw.herbBrowser) : null,
    citation: (id) => citations.get(id),
    citations: raw.citations.items,
    term: (zh) => terms.get(zh),
    script: display ? "Hans" : "Hant",
    zh: display ? (text) => display.zh(text) : (text) => text,
    traditional: display ? (text) => display.traditional(text) : (text) => [text],
  };
}

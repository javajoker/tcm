// What a scenario needs to know about the knowledge base to answer like a particular person: the question bank and the typical patients of the patterns.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Lang } from "./i18n.ts";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = <T>(rel: string): T => JSON.parse(readFileSync(join(REPO, rel), "utf8")) as T;

interface Option { readonly id: string; readonly label: Record<string, string>; readonly symptoms: readonly string[]; readonly none: boolean; readonly context?: { readonly course?: string } }
export interface Question { readonly id: string; readonly prompt: Record<string, string>; readonly select: "one" | "many"; readonly options: readonly Option[]; readonly graded: readonly string[]; readonly core: boolean }

const QUESTIONS = read<{ items: Question[] }>("data/diagnosis/questions.json").items;
const PARITY = read<{ cases: { id: string; findings: Record<string, unknown> }[] }>("packages/engine/test/fixtures/parity.json").cases;

export const questionByPrompt = (prompt: string, lang: Lang): Question | undefined => QUESTIONS.find((q) => q.prompt[lang] === prompt);

/** The inquiry symptoms of a pattern's typical patient (the person every pattern's golden seed is made from). */
export function typicalSymptoms(patternId: string): ReadonlySet<string> {
  const c = PARITY.find((x) => x.id === `typical-${patternId}`);
  if (!c) throw new Error(`no typical patient of ${patternId}`);
  return new Set(Object.keys(c.findings).filter((s) => s.startsWith("S_")));
}

/** The options of a question this person ticks: those whose symptoms all apply, or "none of these" when no other applies. */
export function optionsFor(q: Question, symptoms: ReadonlySet<string>): Option[] {
  if (q.options.some((o) => o.context)) return q.options.filter((o) => o.context?.course === "chronic");          // the "how long" question: a long-standing problem
  const hit = q.options.filter((o) => !o.none && o.symptoms.length > 0 && o.symptoms.every((s) => symptoms.has(s)));
  if (q.select === "one") return hit.slice(0, 1).length > 0 ? hit.slice(0, 1) : q.options.filter((o) => o.none).slice(0, 1);
  return hit.length > 0 ? hit : q.options.filter((o) => o.none);
}

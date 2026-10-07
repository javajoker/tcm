// The wording lint of the assistant's questions (docs/post-mvp/design/ai-assisted-intake.md §4; docs/i18n-guide.md §5.1): run on the gateway and again in the app.
// A question fails when one of the app's forbidden-wording rules that apply to a question fires, when one of the assistant's own rules fires (a label, a dose, an amount,
// a medicine, pattern differentiation), or when it names a pattern, a pattern element, a constitution, a formula or a herb of the knowledge base.
// Every rule runs on every question, whatever the session's language: a Traditional rule cannot fire on English text, and a question that mixes scripts is checked in both.
import { WORDING_DATA } from "./generated/wording.ts";
import type { WordingData } from "./protocol.ts";

interface Compiled {
  readonly rules: readonly { readonly id: string; readonly re: RegExp }[];
  readonly chinese: readonly string[];
  readonly english: RegExp | null;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function compile(data: WordingData): Compiled {
  const english = [...data.names.en].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  return {
    rules: data.rules.map((r) => ({ id: r.id, re: new RegExp(r.pattern, "iu") })),
    chinese: [...new Set([...data.names["zh-Hant"], ...data.names["zh-Hans"]])].map((n) => n.normalize("NFKC")),
    english: english.length === 0 ? null : new RegExp(`\\b(?:${english.map(escape).join("|")})\\b`, "iu"),
  };
}

let compiled: Compiled | undefined;

/** The ids of the rules a question breaks (`name` for a knowledge-base name); empty when it may be shown. */
export function lintQuestion(text: string, data: WordingData = WORDING_DATA): string[] {
  const c = data === WORDING_DATA ? (compiled ??= compile(data)) : compile(data);
  const t = text.normalize("NFKC");
  const out = new Set<string>();
  for (const r of c.rules) if (r.re.test(t)) out.add(r.id);
  if (c.chinese.some((n) => t.includes(n)) || (c.english?.test(t) ?? false)) out.add("name");
  return [...out].sort();
}

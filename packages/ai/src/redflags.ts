// The device's own red-flag check of what a person writes in the conversation (docs/post-mvp/design/ai-assisted-intake.md §4): deterministic, before anything is sent. A level-A or -B
// match sends the person back to that item of the screening; a level-C match asks them to check their profile. The words are data (data/safety/red-flag-terms.json, draft);
// a term is a phrase, or phrases that must all occur in the message. Negations are not read — it errs on the side of asking again. The model's own flag can add to this, never
// take away from it.
import { RED_FLAG_TERMS } from "./generated/redflags.ts";
import type { Lang } from "./protocol.ts";

export type RedFlagLevel = "A" | "B" | "C";
type Term = string | readonly string[];
export interface RedFlagTermsData {
  readonly _meta: { readonly schema: number; readonly generated_by: string; readonly status: string };
  readonly items: readonly { readonly id: string; readonly level: RedFlagLevel; readonly terms: Readonly<Record<Lang, readonly Term[]>> }[];
}
export interface RedFlagMatch { readonly id: string; readonly level: RedFlagLevel }

/** Compatibility forms folded, lower case, apostrophes made straight, punctuation and runs of space made one space. */
const soft = (s: string): string => s.normalize("NFKC").toLowerCase().replace(/[’‘`]/g, "'").replace(/[^\p{L}\p{N}\s'-]+/gu, " ").replace(/\s+/g, " ").trim();
const han = (s: string): boolean => /\p{Script=Han}/u.test(s);
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function phraseIn(text: string, spaceless: string, phrase: string): boolean {
  const p = soft(phrase);
  if (han(p)) return spaceless.includes(p.replace(/\s+/g, ""));
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(p)}`, "u").test(text);
}

/** The red flags a message names, in the order of the list; each once. Every language's words are tried, whatever the session's language. */
export function matchRedFlags(message: string, data: RedFlagTermsData = RED_FLAG_TERMS): RedFlagMatch[] {
  const text = soft(message);
  const spaceless = text.replace(/\s+/g, "");
  const out: RedFlagMatch[] = [];
  for (const item of data.items) {
    const terms = [...item.terms["zh-Hant"], ...item.terms["zh-Hans"], ...item.terms.en];
    if (terms.some((t) => (typeof t === "string" ? phraseIn(text, spaceless, t) : t.every((p) => phraseIn(text, spaceless, p))))) out.push({ id: item.id, level: item.level });
  }
  return out;
}

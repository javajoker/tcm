import type { Lang } from "@tcm/i18n";
import type { KnowledgeBase } from "@tcm/kb";

/** Herb names the knowledge base can check an allergy against, in the page language (type-ahead suggestions only; free text is always accepted). */
export function allergenSuggestions(kb: KnowledgeBase, lang: Lang): string[] {
  const ids = new Set<string>();
  for (const f of kb.formulas.values()) for (const c of f.composition) ids.add(c.herb);
  for (const h of kb.herbs?.values() ?? []) ids.add(h.id);
  const names = new Set<string>();
  for (const id of ids) {
    const n = kb.herbName(id)?.name;
    if (!n) continue;
    names.add(lang === "en" ? (n.en ?? n["zh-Hant"]) : n["zh-Hant"]);
  }
  return [...names].sort((a, b) => a.localeCompare(b, lang === "en" ? "en" : "zh-Hant"));
}

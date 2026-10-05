// Helpers for the Simplified-Chinese checks (docs/post-mvp/design/simplified-chinese.md §6): the committed dictionary, the set of Traditional-only characters it implies, and a scan of what is on screen.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const file = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "scripts", "i18n", "zh-Hans.dictionary.json"), "utf8")) as { _meta: { traditionalOnly: string }; entries: Record<string, string> };
export const dictionary: Readonly<Record<string, string>> = file.entries;

/**
 * The characters of the data and the catalogues that have a different Simplified form, as OpenCC's character table says (written into the dictionary by the builder).
 * A character that also stands in a Simplified value (著 in a protected phrase) is ambiguous and left out.
 */
export const TRADITIONAL_ONLY: ReadonlySet<string> = (() => {
  const s = new Set<string>([...file._meta.traditionalOnly]);
  for (const v of Object.values(dictionary)) for (const c of v) s.delete(c);
  return s;
})();

const ATTRIBUTES = ["aria-label", "title", "alt", "placeholder", "aria-description"];

/** Text that is Traditional on purpose in a Simplified page: each language is named in its own script (the language switch and the settings). */
const INTENDED = new Set(["繁體", "繁體中文"]);

/**
 * Where a Traditional-only character is on screen: in a text node, an accessible name or the document title. A `lang="zh-Hant"` attribute does NOT excuse it — a Simplified page that labels
 * Traditional text as Traditional is exactly the defect this scan exists to find.
 */
export function traditionalOnScreen(root: ParentNode = document.body): string[] {
  const out: string[] = [];
  const check = (text: string, where: string): void => {
    if (INTENDED.has(text.trim())) return;
    const hits = [...new Set([...text].filter((c) => TRADITIONAL_ONLY.has(c)))];
    if (hits.length > 0) out.push(`${hits.join("")} in ${where}: ${text.trim().slice(0, 48)}`);
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) check(n.textContent ?? "", "text");
  (root as Element | Document).querySelectorAll?.("*").forEach((el) => { for (const a of ATTRIBUTES) { const v = el.getAttribute(a); if (v) check(v, a); } });
  check(document.title, "title");
  return [...new Set(out)];
}

// Simplified Chinese in the real browser (docs/post-mvp/design/simplified-chinese.md §6): what a scenario expects to see for text that comes from the data, and a scan of the page for any
// Traditional-only character. The dictionary is the committed one the app itself was built with.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const file = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "scripts", "i18n", "zh-Hans.dictionary.json"), "utf8")) as { _meta: { traditionalOnly: string }; entries: Record<string, string> };

/** A Chinese string of the data as the Simplified interface shows it. */
export const toHans = (text: string): string => file.entries[text] ?? text;

/** The characters that have another Simplified form, minus those that also stand in Simplified text (著 in a protected phrase) and the names of the Traditional option. */
const TRADITIONAL_ONLY = new Set([...file._meta.traditionalOnly].filter((c) => !Object.values(file.entries).some((v) => v.includes(c))));
const INTENDED = new Set(["繁體", "繁體中文"]);

/** What the page shows in the data's own script although the page says it is Simplified: text, accessible names and the title (empty when the page is clean). */
export async function traditionalOnPage(page: Page): Promise<string[]> {
  const seen: string[] = await page.evaluate(() => {
    const out: string[] = [];
    // text of a <noscript> is in the document but is shown only without scripts, and says the same in all three languages (index.html)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) if (n.parentElement?.closest("noscript") == null) out.push(n.textContent ?? "");
    for (const el of document.querySelectorAll("*")) for (const a of ["aria-label", "title", "alt", "placeholder"]) { const v = el.getAttribute(a); if (v) out.push(v); }
    out.push(document.title);
    return out;
  });
  const found = new Set<string>();
  for (const text of seen) {
    if (INTENDED.has(text.trim())) continue;
    const hits = [...new Set([...text].filter((c) => TRADITIONAL_ONLY.has(c)))];
    if (hits.length > 0) found.add(`${hits.join("")} in "${text.trim().slice(0, 40)}"`);
  }
  return [...found];
}

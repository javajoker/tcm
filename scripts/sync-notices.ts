// Generate the `safety.notice.*` message keys of the web app from the notice catalogue in docs/safety-policy.md §4 (the safety policy owns the
// wording; the catalogs must not drift from it).
//   node scripts/sync-notices.ts           rewrite the notice keys in apps/web/src/i18n/{zh-Hant,en}/safety.json
//   node scripts/sync-notices.ts --check   fail if the catalogs differ from the policy (CI; also run by apps/web/test/notices.test.ts)
// Rows of the disclaimers (N-DISCLAIMER-SHORT / -FULL) are handled by their own keys (common.footer.disclaimer, safety.disclaimer.full).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY = join(root, "docs", "safety-policy.md");
const catalog = (lang: string): string => join(root, "apps", "web", "src", "i18n", lang, "safety.json");

/** Notice id of the policy → key stem in the catalog. */
export const SLUG: Readonly<Record<string, string>> = {
  "N-A": "a", "N-B": "b", "N-MINOR": "minor", "N-PREG": "pregnancy", "N-LACT": "lactation", "N-SERIOUS": "serious",
  "N-ELDERLY": "elderly", "N-MED": "medication", "N-MED-UNKNOWN": "medicationUnknown", "N-ALLERGY": "allergy", "N-ALLERGY-UNKNOWN": "allergyUnknown",
  "N-ACUTE": "acute", "N-LOWCONF": "lowConfidence", "N-CONFLICT": "conflict", "N-SUPPRESSED": "suppressed", "N-SELFOBS": "selfObserved", "N-PULSE-EDU": "pulseEducation",
  "N-BIRTH": "birth", "N-DRAFT": "draft", "N-TIERC": "tierC", "N-FORMULA": "formula",
};

export interface NoticeRow { readonly id: string; readonly zh: string; readonly en: string }
export type Entries = Record<string, string>;

/** The notice rows of the policy (`| **N-X** … | trigger | zh-Hant | English |`), in document order. */
export function parseNoticeRows(markdown: string): NoticeRow[] {
  const rows: NoticeRow[] = [];
  for (const line of markdown.split("\n")) {
    const id = /^\| \*\*(N-[A-Z-]+)\*\*/.exec(line)?.[1];
    if (id === undefined || id.startsWith("N-DISCLAIMER")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length !== 4) throw new Error(`${id}: expected 4 columns, found ${cells.length}`);
    rows.push({ id, zh: cells[2]!, en: cells[3]! });
  }
  return rows;
}

const BLOCKING = /^\*\*(.+?)\*\*<br>(.+)$/s;

/** Catalog entries of one language: `title` + `body` for blocking notices, `text` for the others. */
export function entriesOf(rows: readonly NoticeRow[], lang: "zh" | "en"): Entries {
  const out: Entries = {};
  for (const row of rows) {
    const slug = SLUG[row.id];
    if (slug === undefined) throw new Error(`no catalog slug for ${row.id}: add it to SLUG in scripts/sync-notices.ts`);
    const text = lang === "zh" ? row.zh : row.en;
    const m = BLOCKING.exec(text);
    if (m) { out[`safety.notice.${slug}.title`] = m[1]!; out[`safety.notice.${slug}.body`] = m[2]!; } else out[`safety.notice.${slug}.text`] = text;
  }
  return out;
}

const read = (file: string): Entries => JSON.parse(readFileSync(file, "utf8")) as Entries;
const sorted = (e: Entries): Entries => Object.fromEntries(Object.entries(e).sort(([a], [b]) => a.localeCompare(b)));

/** Replace every `safety.notice.*` key of `current` by the generated ones (other keys are kept). */
export function merge(current: Entries, generated: Entries): Entries {
  const kept = Object.fromEntries(Object.entries(current).filter(([k]) => !k.startsWith("safety.notice.")));
  return sorted({ ...kept, ...generated });
}

if (import.meta.main) {
  const rows = parseNoticeRows(readFileSync(POLICY, "utf8"));
  const check = process.argv.includes("--check");
  let stale = false;
  for (const [dir, lang] of [["zh-Hant", "zh"], ["en", "en"]] as const) {
    const file = catalog(dir);
    const current = read(file);
    const next = merge(current, entriesOf(rows, lang));
    if (JSON.stringify(sorted(current)) === JSON.stringify(next)) continue;
    if (check) { console.error(`${file} is out of date with docs/safety-policy.md; run: node scripts/sync-notices.ts`); stale = true; } else writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  }
  if (check) process.exit(stale ? 1 : 0);
  console.log(`notices: ${rows.length} rows → safety.notice.* in both languages`);
}

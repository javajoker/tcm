// The terms of service as documents (the owner's decision PD-36): TERMS.md (English) and TERMS.zh-TW.md (Traditional Chinese) at the root of the repository, written from the
// `terms` messages the app's Terms page shows (apps/web/src/i18n/<language>/terms.json) — so the page, the documents and the skill's copies cannot disagree.
//   node scripts/terms.ts            write both documents
//   node scripts/terms.ts --check    fail when a document is not what the messages give (the tests run it)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DOCUMENTS = [{ lang: "en", file: "TERMS.md", other: "TERMS.zh-TW.md", otherName: "繁體中文" }, { lang: "zh-Hant", file: "TERMS.zh-TW.md", other: "TERMS.md", otherName: "English" }] as const;

/** One language's terms as Markdown: the title, the version, the draft notice, the introduction and the numbered sections — the page's order. */
export function termsMarkdown(lang: "en" | "zh-Hant", messages: Readonly<Record<string, string>> = JSON.parse(readFileSync(join(root, "apps", "web", "src", "i18n", lang, "terms.json"), "utf8")) as Record<string, string>): string {
  const doc = DOCUMENTS.find((d) => d.lang === lang)!;
  const m = (key: string): string => { const v = messages[key]; if (v === undefined) throw new Error(`${lang}: no message ${key}`); return v; };
  const out = [
    `<!-- Generated from apps/web/src/i18n/${lang}/terms.json by \`node scripts/terms.ts\`: edit the messages, not this file. -->`,
    "",
    `# ${m("terms.title")}`,
    "",
    `*${m("terms.meta")}* · [${doc.otherName}](${doc.other})`,
    "",
    `> **${m("terms.draft")}**`,
    "",
    m("terms.intro"),
  ];
  for (let n = 1; `terms.s${n}.title` in messages; n++) {
    out.push("", `## ${n}. ${m(`terms.s${n}.title`)}`);
    for (let p = 1; `terms.s${n}.p${p}` in messages; p++) out.push("", m(`terms.s${n}.p${p}`));
  }
  return `${out.join("\n")}\n`;
}

/** The documents that are not what the messages give (an empty list: both are current). */
export function staleDocuments(): string[] {
  return DOCUMENTS.filter((d) => { try { return readFileSync(join(root, d.file), "utf8") !== termsMarkdown(d.lang); } catch { return true; } }).map((d) => d.file);
}

if (import.meta.main) {
  if (process.argv.includes("--check")) {
    const stale = staleDocuments();
    if (stale.length > 0) { console.error(`terms: ${stale.join(", ")} not what the messages give — run \`node scripts/terms.ts\``); process.exit(1); }
    console.log("terms: TERMS.md and TERMS.zh-TW.md are current");
  } else {
    for (const d of DOCUMENTS) writeFileSync(join(root, d.file), termsMarkdown(d.lang));
    console.log("terms: wrote TERMS.md and TERMS.zh-TW.md");
  }
}

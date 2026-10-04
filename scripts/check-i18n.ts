// Checks of the UI message catalogs (docs/i18n-guide.md §8.2). Errors fail the run; warnings are listed.
//   node scripts/check-i18n.ts [--kb]       --kb also scans the bilingual display text of data/ for forbidden wording
// Rules: key parity zh-Hant ⇄ en · placeholder, tag and plural parity · forbidden wording (scripts/i18n-wording.json) · orphan and missing keys ·
// length ratio and Han–Latin spacing / full-width punctuation (warnings). Glossary conformance and `en_status` arrive with K-12 (the glossary review).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { placeholdersOf, type Message } from "../packages/i18n/src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogDir = join(root, "apps", "web", "src", "i18n");
const srcDir = join(root, "apps", "web", "src");
const NAMESPACES = ["common", "intake", "inquiry", "observe", "constitution", "report", "formula", "safety", "errors"] as const;

export type Severity = "error" | "warning";
export interface Issue { readonly severity: Severity; readonly rule: string; readonly key?: string; readonly message: string }
type Catalog = Record<string, Message>;
interface Wording { rules: { id: string; lang: "en" | "zh-Hant"; pattern: string; why: string; prefer: string }[]; allow: { keys: string[]; rules: string[]; reason: string }[] }

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

export function loadCatalogs(): { zh: Catalog; en: Catalog; perNamespace: Record<string, { zh: string[]; en: string[] }> } {
  const zh: Catalog = {}, en: Catalog = {};
  const perNamespace: Record<string, { zh: string[]; en: string[] }> = {};
  for (const ns of NAMESPACES) {
    const a = readJson<Catalog>(join(catalogDir, "zh-Hant", `${ns}.json`)), b = readJson<Catalog>(join(catalogDir, "en", `${ns}.json`));
    Object.assign(zh, a); Object.assign(en, b);
    perNamespace[ns] = { zh: Object.keys(a), en: Object.keys(b) };
  }
  return { zh, en, perNamespace };
}

/** The strings of a message (a plural message has one per form). */
export const textsOf = (m: Message): string[] => (typeof m === "string" ? [m] : Object.values(m).filter((x): x is string => typeof x === "string"));

/** Visual width: a full-width (CJK) character takes two columns, anything else one. */
export const visualWidth = (s: string): number => [...s.replace(/\{[A-Za-z0-9_]+\}|<\/?[a-z]+>/g, "")].reduce((n, c) => n + (/[⺀-鿿＀-￯　-〿]/.test(c) ? 2 : 1), 0);

export function checkParity(zh: Catalog, en: Catalog, perNamespace: Record<string, { zh: string[]; en: string[] }>): Issue[] {
  const out: Issue[] = [];
  for (const [ns, { zh: a, en: b }] of Object.entries(perNamespace)) {
    for (const k of a) if (!b.includes(k)) out.push({ severity: "error", rule: "parity", key: k, message: `${ns}: "${k}" has no English message` });
    for (const k of b) if (!a.includes(k)) out.push({ severity: "error", rule: "parity", key: k, message: `${ns}: "${k}" has no zh-Hant message (zh-Hant is the source catalog)` });
  }
  for (const [k, z] of Object.entries(zh)) {
    const e = en[k];
    if (e === undefined) continue;
    const pz = placeholdersOf(z), pe = placeholdersOf(e);
    const eq = (x: string[], y: string[]): boolean => JSON.stringify([...x].sort()) === JSON.stringify([...y].sort());
    if (!eq(pz.params, pe.params)) out.push({ severity: "error", rule: "placeholders", key: k, message: `"${k}": parameters differ — zh {${pz.params.join(", ")}} vs en {${pe.params.join(", ")}}` });
    if (!eq(pz.tags, pe.tags)) out.push({ severity: "error", rule: "placeholders", key: k, message: `"${k}": rich-text tags differ — zh <${pz.tags.join(", ")}> vs en <${pe.tags.join(", ")}>` });
    const plural = (m: Message): boolean => typeof m !== "string";
    if (plural(z) && !("other" in (z as object))) out.push({ severity: "error", rule: "plural", key: k, message: `"${k}": the zh-Hant plural message lacks "other"` });
    if (plural(e) && !("other" in (e as object))) out.push({ severity: "error", rule: "plural", key: k, message: `"${k}": the English plural message lacks "other"` });
    if (plural(z) !== plural(e) && !(plural(z) && Object.keys(z as object).length === 1)) out.push({ severity: "error", rule: "plural", key: k, message: `"${k}": one language is a plural message and the other is not` });
  }
  return out;
}

export function checkWording(zh: Catalog, en: Catalog, wording: Wording): Issue[] {
  const out: Issue[] = [];
  const allowed = (key: string, rule: string): boolean => wording.allow.some((a) => a.rules.includes(rule) && a.keys.some((k) => (k.endsWith(".") ? key.startsWith(k) : key === k)));
  for (const [lang, cat] of [["zh-Hant", zh], ["en", en]] as const) {
    for (const [key, msg] of Object.entries(cat)) {
      for (const r of wording.rules.filter((x) => x.lang === lang)) {
        const re = new RegExp(r.pattern, "i");
        for (const text of textsOf(msg)) if (re.test(text) && !allowed(key, r.id)) out.push({ severity: "error", rule: `wording:${r.id}`, key, message: `"${key}" (${lang}): ${r.why}; prefer ${r.prefer} — "${text.slice(0, 80)}"` });
      }
    }
  }
  return out;
}

export function checkStyle(zh: Catalog, en: Catalog): Issue[] {
  const out: Issue[] = [];
  for (const [key, z] of Object.entries(zh)) {
    const e = en[key];
    for (const t of textsOf(z)) {
      const bare = t.replace(/\{[A-Za-z0-9_]+\}|<\/?[a-z]+>/g, "");
      if (/[一-鿿][A-Za-z0-9]|[A-Za-z0-9][一-鿿]/.test(bare)) out.push({ severity: "warning", rule: "spacing", key, message: `"${key}": add a space between Han characters and Latin letters or digits — "${t.slice(0, 60)}"` });
      if (/[一-鿿][,.;:?!]|[,.;:?!][一-鿿]/.test(bare)) out.push({ severity: "warning", rule: "punctuation", key, message: `"${key}": use full-width punctuation in Chinese sentences — "${t.slice(0, 60)}"` });
    }
    if (e !== undefined && typeof z === "string" && typeof e === "string" && visualWidth(z) >= 20) {                      // single words and labels say nothing about layout
      const ratio = visualWidth(e) / Math.max(1, visualWidth(z));
      if (ratio < 0.4 || ratio > 2.5) out.push({ severity: "warning", rule: "length", key, message: `"${key}": the English text is ${ratio.toFixed(1)}× the visual width of the Chinese (allowed 0.4–2.5)` });
    }
  }
  return out;
}

/** Keys the code uses: literal keys, and `namespace.prefix.${…}` template prefixes (any key under such a prefix counts as used). */
export function usedKeys(): { literal: Set<string>; prefixes: string[] } {
  const literal = new Set<string>(), prefixes: string[] = [];
  const ns = NAMESPACES.join("|");
  for (const f of walk(srcDir).filter((x) => /\.(ts|tsx)$/.test(x) && !x.includes(`${join("src", "i18n")}`))) {
    const text = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");      // comments are not usage
    for (const m of text.matchAll(new RegExp(`\`((?:${ns})\\.[^\`]*)\``, "g"))) {                       // template literals: the part before `${` is a prefix
      const k = m[1]!;
      const i = k.indexOf("${");
      if (i >= 0) prefixes.push(k.slice(0, i)); else literal.add(k);
    }
    for (const m of text.matchAll(new RegExp(`["']((?:${ns})\\.[A-Za-z0-9_.\\-]*)["']`, "g"))) literal.add(m[1]!);
  }
  return { literal, prefixes };
}

export function checkUse(zh: Catalog, used: { literal: Set<string>; prefixes: string[] }): Issue[] {
  const out: Issue[] = [];
  const isUsed = (k: string): boolean => used.literal.has(k) || used.prefixes.some((p) => k.startsWith(p)) || [...used.literal].some((l) => l.endsWith(".") && k.startsWith(l));
  for (const k of Object.keys(zh)) if (!isUsed(k)) out.push({ severity: "error", rule: "orphan", key: k, message: `"${k}" is defined but never used` });
  for (const k of used.literal) if (!(k in zh) && !k.endsWith(".")) out.push({ severity: "error", rule: "missing", key: k, message: `"${k}" is used in the code but not defined` });
  return out;
}

/** Bilingual display text of the knowledge base: objects shaped { "zh-Hant", en } (classical quotations are not scanned). */
export function checkKbWording(wording: Wording): Issue[] {
  const out: Issue[] = [];
  const dataDir = join(root, "data");
  const skip = (p: string): boolean => /citations\.json$|glossary\.json$|schema[\\/]|wuxing[\\/]|ganzhi/.test(p);
  const scan = (node: unknown, file: string, path: string): void => {
    if (Array.isArray(node)) { node.forEach((x, i) => scan(x, file, `${path}[${i}]`)); return; }
    if (node === null || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if (typeof o["zh-Hant"] === "string" && "en" in o) {
      for (const lang of ["zh-Hant", "en"] as const) {
        const text = o[lang];
        if (typeof text !== "string") continue;
        for (const r of wording.rules.filter((x) => x.lang === lang && x.id !== "dose")) if (new RegExp(r.pattern, "i").test(text)) out.push({ severity: "warning", rule: `kb-wording:${r.id}`, message: `${file} ${path} (${lang}): ${r.why} — "${text.slice(0, 80)}"` });
      }
    }
    for (const [k, v] of Object.entries(o)) scan(v, file, `${path}.${k}`);
  };
  for (const f of walk(dataDir).filter((x) => x.endsWith(".json") && !skip(x))) scan(readJson(f), relative(dataDir, f), "$");
  return out;
}

export function runChecks(opts: { kb?: boolean } = {}): Issue[] {
  const { zh, en, perNamespace } = loadCatalogs();
  const wording = readJson<Wording>(join(root, "scripts", "i18n-wording.json"));
  return [...checkParity(zh, en, perNamespace), ...checkWording(zh, en, wording), ...checkStyle(zh, en), ...checkUse(zh, usedKeys()), ...(opts.kb ? checkKbWording(wording) : [])];
}

if (import.meta.main) {
  const issues = runChecks({ kb: process.argv.includes("--kb") });
  const errors = issues.filter((i) => i.severity === "error"), warnings = issues.filter((i) => i.severity === "warning");
  for (const i of errors) console.error(`✗ [${i.rule}] ${i.message}`);
  for (const i of warnings.slice(0, 40)) console.warn(`! [${i.rule}] ${i.message}`);
  if (warnings.length > 40) console.warn(`! … and ${warnings.length - 40} more warnings`);
  const { zh } = loadCatalogs();
  console.log(`check-i18n: ${Object.keys(zh).length} messages · ${errors.length} error(s) · ${warnings.length} warning(s)`);
  process.exit(errors.length === 0 ? 0 : 1);
}

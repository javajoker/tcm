// Checks of the UI message catalogs (docs/i18n-guide.md §8.2). Errors fail the run; warnings are listed.
//   node scripts/check-i18n.ts [--kb]       --kb also scans the bilingual display text of data/ for forbidden wording
// Rules: key parity zh-Hant ⇄ en · placeholder, tag and plural parity · forbidden wording (scripts/i18n-wording.json) · orphan and missing keys ·
// glossary conformance (an error: the catalogs are clean, i18n guide §8.2) · length ratio and Han–Latin spacing / full-width punctuation (warnings). `en_status` arrives with K-13.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { placeholdersOf, type Message } from "../packages/i18n/src/index.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const catalogDir = join(root, "apps", "web", "src", "i18n");
const srcDir = join(root, "apps", "web", "src");
// `rx` (the personalised prescription, PM-41) is loaded only by a build that can show it (apps/web/src/prescription/catalog.ts), never by catalogs.ts, and `ai` (AI help, PM-46) only by a build
// with AI help (apps/web/src/ai/catalog.ts): they are checked like the others
const NAMESPACES = ["common", "intake", "inquiry", "observe", "constitution", "report", "feedback", "followup", "formula", "learn", "lock", "trends", "safety", "errors", "rx", "ai"] as const;

export type Severity = "error" | "warning";
export interface Issue { readonly severity: Severity; readonly rule: string; readonly key?: string; readonly message: string }
type Catalog = Record<string, Message>;
export interface GlossaryTerm { readonly "zh-Hant": string; readonly en: string; readonly alt: readonly string[]; readonly domain: string }
interface Wording { glossaryAllow?: { keys: string[]; terms: string[]; reason: string }[]; rules: { id: string; lang: "en" | "zh-Hant"; pattern: string; why: string; prefer: string; /** Only keys that start with one of these prefixes are checked by the rule (the others are not). */ scope?: string[] }[]; allow: { keys: string[]; rules: string[]; reason: string }[] }

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

/** The generated Simplified catalogues (`pnpm i18n:hans`), merged like the others. */
export function loadHans(): Catalog {
  const out: Catalog = {};
  for (const ns of NAMESPACES) Object.assign(out, readJson<Catalog>(join(catalogDir, "zh-Hans", `${ns}.json`)));
  return out;
}

export interface HansDictionary { readonly _meta: { readonly traditionalOnly: string }; readonly entries: Readonly<Record<string, string>> }
export interface HansOverrides { readonly keys?: Readonly<Record<string, unknown>>; readonly keep?: Readonly<Record<string, unknown>> }

/**
 * The generated Simplified catalogue against its source (docs/post-mvp/design/simplified-chinese.md §6): every key, the same parameters, tags and plural forms; no character that has a different
 * Simplified form (the list comes from the generated dictionary: OpenCC's own table); and a glossary term rendered the way the dictionary renders it. Messages the overrides pin by key, and text
 * on the keep list (the name of the Traditional option), are exempt from purity and glossary form. Freshness is checked by `pnpm check:hans`.
 */
export function checkHans(zh: Catalog, hans: Catalog, dictionary: HansDictionary, overrides: HansOverrides, glossary: readonly GlossaryTerm[]): Issue[] {
  const out: Issue[] = [];
  const traditional = new Set([...dictionary._meta.traditionalOnly]);
  const pinned = (key: string): boolean => overrides.keys !== undefined && key in overrides.keys;
  const terms = [...glossary].filter((g) => [...g["zh-Hant"]].length >= 2).sort((a, b) => [...b["zh-Hant"]].length - [...a["zh-Hant"]].length);
  for (const key of Object.keys(zh)) if (!(key in hans)) out.push({ severity: "error", rule: "hans-coverage", key, message: `"${key}" has no Simplified message (run pnpm i18n:hans)` });
  for (const key of Object.keys(hans)) if (!(key in zh)) out.push({ severity: "error", rule: "hans-coverage", key, message: `"${key}" is in the Simplified catalogue but not in zh-Hant (run pnpm i18n:hans)` });
  for (const [key, z] of Object.entries(zh)) {
    const h = hans[key];
    if (h === undefined) continue;
    const pz = placeholdersOf(z), ph = placeholdersOf(h);
    const same = (a: readonly string[], b: readonly string[]): boolean => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    if (!same(pz.params, ph.params) || !same(pz.tags, ph.tags) || !same(pz.forms, ph.forms)) out.push({ severity: "error", rule: "hans-placeholders", key, message: `"${key}": the Simplified message has other parameters, tags or plural forms than zh-Hant` });
    if (pinned(key)) continue;
    const zTexts = textsOf(z), hTexts = textsOf(h);
    hTexts.forEach((text, i) => {
      if (overrides.keep !== undefined && text in overrides.keep) return;
      const bad = [...new Set([...text].filter((c) => traditional.has(c)))];
      if (bad.length > 0) out.push({ severity: "error", rule: "hans-purity", key, message: `"${key}": the Simplified message contains Traditional-only characters ${bad.join("")} — "${text.slice(0, 40)}"` });
      let rest = zTexts[i] ?? "";
      for (const t of terms) {
        if (!rest.includes(t["zh-Hant"])) continue;
        rest = rest.split(t["zh-Hant"]).join(" ");
        const expected = dictionary.entries[t["zh-Hant"]] ?? t["zh-Hant"];
        if (!text.includes(expected)) out.push({ severity: "error", rule: "hans-glossary", key, message: `"${key}": the zh-Hant text uses the glossary term ${t["zh-Hant"]}, which the Simplified text must render as ${expected}` });
      }
    });
  }
  return out;
}

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
      for (const r of wording.rules.filter((x) => x.lang === lang && (x.scope === undefined || x.scope.some((p) => key.startsWith(p))))) {
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

/** The accepted English forms of a glossary term, normalised: lower case, hyphens as spaces. The parenthetical of `en` ("five phases (five elements)") is an alternative too. */
export function englishForms(t: GlossaryTerm): string[] {
  const norm = (x: string): string => x.toLowerCase().replace(/[–—-]/g, " ").replace(/\s+/g, " ").trim();
  const paren = /\(([^)]*)\)/.exec(t.en)?.[1];
  return [...new Set([t.en, t.en.replace(/\s*\(.*?\)/g, ""), ...(paren ? [paren] : []), ...t.alt].map(norm).filter((x) => x.length > 0))];
}

/** Does the English text use one of the forms, tolerant of inflection (a plural, -ed, -ing at the end of the form)? */
export function usesEnglishForm(text: string, forms: readonly string[]): boolean {
  const norm = text.toLowerCase().replace(/[–—-]/g, " ").replace(/\s+/g, " ");
  return forms.some((f) => new RegExp(`(^|[^a-z])${f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es|ed|ing|al)?([^a-z]|$)`).test(norm));
}

/**
 * Glossary conformance (i18n guide §2.1 rule 5, §8.2): a glossary term of two or more characters in a zh-Hant message must be rendered with the glossary English (or an accepted alternative)
 * in the paired English message. Longer terms win over the shorter terms inside them (氣虛質 over 氣虛). Allow-listed exceptions carry a reason in scripts/i18n-wording.json.
 */
export function checkGlossary(zh: Catalog, en: Catalog, glossary: readonly GlossaryTerm[], wording: Wording, severity: Severity = "error"): Issue[] {
  const out: Issue[] = [];
  const terms = [...glossary].filter((g) => [...g["zh-Hant"]].length >= 2).sort((a, b) => [...b["zh-Hant"]].length - [...a["zh-Hant"]].length);
  const allowed = (key: string, term: string): boolean => (wording.glossaryAllow ?? []).some((a) => a.terms.includes(term) && a.keys.some((k) => key === k || (k.endsWith(".") && key.startsWith(k))));
  for (const [key, zm] of Object.entries(zh)) {
    const em = en[key];
    if (em === undefined) continue;
    const forms: [string, string][] = typeof zm === "string" ? [[zm, textsOf(em)[0] ?? ""]] : Object.entries(zm).filter((e): e is [string, string] => typeof e[1] === "string").map(([f, t]) => [t, typeof em === "string" ? em : (em as Record<string, string | undefined>)[f] ?? (em as Record<string, string>).other ?? ""]);
    for (const [zText, eText] of forms) {
      let rest = zText;
      for (const t of terms) {
        const zhTerm = t["zh-Hant"];
        if (!rest.includes(zhTerm)) continue;
        rest = rest.split(zhTerm).join(" ");                   // a shorter term inside this one no longer counts
        if (allowed(key, zhTerm) || usesEnglishForm(eText, englishForms(t))) continue;
        out.push({ severity, rule: "glossary", key, message: `"${key}": the zh text uses the glossary term ${zhTerm} (${t.en}${t.alt.length ? `; also ${t.alt.join(", ")}` : ""}) but the English text does not — "${eText.slice(0, 70)}"` });
      }
    }
  }
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
    // the English renderings of Chinese-only prose (`principle_en`, `rationale_en`, `cautions_en`, `text_en`: K-13) are scanned with the English rules
    for (const [k, v] of Object.entries(o)) {
      if (k.endsWith("_en") && (typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string")))) {
        for (const text of Array.isArray(v) ? v : [v]) {
          for (const r of wording.rules.filter((x) => x.lang === "en" && x.id !== "dose")) if (new RegExp(r.pattern, "i").test(text as string)) out.push({ severity: "warning", rule: `kb-wording:${r.id}`, message: `${file} ${path}.${k} (en): ${r.why} — "${(text as string).slice(0, 80)}"` });
        }
      } else scan(v, file, `${path}.${k}`);
    }
  };
  for (const f of walk(dataDir).filter((x) => x.endsWith(".json") && !skip(x))) scan(readJson(f), relative(dataDir, f), "$");
  return out;
}

export function runChecks(opts: { kb?: boolean } = {}): Issue[] {
  const { zh, en, perNamespace } = loadCatalogs();
  const wording = readJson<Wording>(join(root, "scripts", "i18n-wording.json"));
  const glossary = readJson<{ items: GlossaryTerm[] }>(join(root, "data", "glossary.json")).items;
  const hansDictionary = readJson<HansDictionary>(join(root, "scripts", "i18n", "zh-Hans.dictionary.json"));
  const hansOverrides = readJson<HansOverrides>(join(root, "scripts", "i18n", "hans-overrides.json"));
  return [...checkParity(zh, en, perNamespace), ...checkHans(zh, loadHans(), hansDictionary, hansOverrides, glossary), ...checkWording(zh, en, wording), ...checkGlossary(zh, en, glossary, wording), ...checkStyle(zh, en), ...checkUse(zh, usedKeys()), ...(opts.kb ? checkKbWording(wording) : [])];
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

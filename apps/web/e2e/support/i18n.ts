// The app's own message catalogues, so a scenario can find a button or a heading by the words the person sees, in either language.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Lang = "en" | "zh-Hant";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "i18n");
type Entry = string | Readonly<Record<string, string>>;
const cache = new Map<Lang, Readonly<Record<string, Entry>>>();

export function messages(lang: Lang): Readonly<Record<string, Entry>> {
  let m = cache.get(lang);
  if (!m) {
    const merged: Record<string, Entry> = {};
    for (const f of readdirSync(join(ROOT, lang)).filter((x) => x.endsWith(".json"))) Object.assign(merged, JSON.parse(readFileSync(join(ROOT, lang, f), "utf8")) as Record<string, Entry>);
    cache.set(lang, m = merged);
  }
  return m;
}

/** The text of a message in a language, `{name}` placeholders filled. Plural messages are not supported here: scenarios use the singular ones. */
export function msg(lang: Lang, key: string, params: Readonly<Record<string, string | number>> = {}): string {
  const s = messages(lang)[key];
  if (s === undefined) throw new Error(`no message ${key} in ${lang}`);
  if (typeof s !== "string") throw new Error(`${key} is a plural message: use plural()`);
  return s.replace(/\{(\w+)\}/g, (_all, k: string) => String(params[k] ?? `{${k}}`));
}

/** A plural message for a count (`{n}` filled), in the form the language uses for it. */
export function plural(lang: Lang, key: string, n: number): string {
  const s = messages(lang)[key];
  if (typeof s !== "object") throw new Error(`${key} is not a plural message in ${lang}`);
  return (s[new Intl.PluralRules(lang).select(n)] ?? s["other"] ?? "").replace(/\{n\}/g, String(n));
}

/** A regular expression that matches the text of a message exactly (for names that carry a decoration). */
export const exact = (text: string): RegExp => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

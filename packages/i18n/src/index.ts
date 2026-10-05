// @tcm/i18n — a deliberately small message formatter (tech spec T5, docs/i18n-guide.md):
//   · typed keys: the key union comes from the zh-Hant source catalog;
//   · `{name}` interpolation; plural messages `{ one, other }` resolved with Intl.PluralRules (zh-Hant has only `other`);
//   · rich text: `<tag>text</tag>` is returned as parts for the UI to render (never HTML);
//   · en falls back to zh-Hant (never the reverse) and the fallback is REPORTED so the UI can mark untranslated text;
//   · Intl helpers for numbers and dates; no locale logic anywhere else.
export { pseudoize, pseudoXA, pseudoXL, type PseudoMode } from "./pseudo.ts";

export type Lang = "zh-Hant" | "zh-Hans" | "en";
export const LANGS: readonly Lang[] = ["zh-Hant", "zh-Hans", "en"];
export const DEFAULT_LANG: Lang = "zh-Hant";

/** The script Chinese text is shown in: Simplified for `zh-Hans`; Traditional for `zh-Hant` and for `en` (the English interface shows Chinese terms as the data has them). */
export type Script = "Hant" | "Hans";
export const scriptOf = (lang: Lang): Script => (lang === "zh-Hans" ? "Hans" : "Hant");
/** The BCP 47 tag of Chinese text shown in this interface language (for the `lang` attribute: it selects the font and the regional glyph forms). */
export const zhLangOf = (lang: Lang): "zh-Hant" | "zh-Hans" => (lang === "zh-Hans" ? "zh-Hans" : "zh-Hant");

export type Plural = { readonly zero?: string; readonly one?: string; readonly two?: string; readonly few?: string; readonly many?: string; readonly other: string };
export type Message = string | Plural;
export type Params = Readonly<Record<string, string | number>>;

export type Part = { readonly type: "text"; readonly text: string } | { readonly type: "tag"; readonly tag: string; readonly text: string };

export interface Localized { readonly text: string; /** The text is Chinese shown in the English UI (untranslated). */ readonly fellBack: boolean }

export interface I18n<K extends string> {
  readonly lang: Lang;
  /** The script of Chinese text in this interface (see `scriptOf`). */
  readonly script: Script;
  /** `lang` attribute value for Chinese text from the data. */
  readonly zhLang: "zh-Hant" | "zh-Hans";
  /**
   * A Chinese string of the knowledge base, for DISPLAY: the identity for `zh-Hant` and `en`, the Simplified form for `zh-Hans` (through the display list the knowledge base loaded).
   * Never use the result as an identifier, and convert each string of a composed text separately.
   */
  zh(text: string): string;
  /** Message with `{param}` interpolation. A missing key returns the key itself (and is reported to `onMissing`). */
  t(key: K, params?: Params): string;
  /** Plural message selected by `n` (also available as `{n}`). */
  plural(key: K, n: number, params?: Params): string;
  /** Rich text: `<b>text</b>` tags are returned as parts. */
  rich(key: K, params?: Params): Part[];
  has(key: string): boolean;
  number(n: number, options?: Intl.NumberFormatOptions): string;
  date(ms: number, options?: Intl.DateTimeFormatOptions): string;
  /** A bilingual knowledge-base value `{ "zh-Hant", en }`; `en: null` falls back to zh-Hant and says so. */
  localized(v: { readonly "zh-Hant": string; readonly en?: string | null }): Localized;
}

export interface CreateOptions {
  /** The display function of the knowledge base (`kb.zh`), applied by `zh()` and `localized()` for `zh-Hans`. Called at use, so it may change as the knowledge base loads. */
  readonly zh?: (text: string) => string;
  /** Called when a key is missing in both languages. */
  readonly onMissing?: (key: string, lang: Lang) => void;
  /** Called when the English UI falls back to a zh-Hant message. */
  readonly onFallback?: (key: string) => void;
  /** Applied to every message template before its parameters are filled in (pseudo-localisation, dev only). Placeholders and tags must survive it. */
  readonly transform?: (template: string) => string;
}

const LOCALE: Record<Lang, string> = { "zh-Hant": "zh-Hant-TW", "zh-Hans": "zh-Hans-CN", en: "en" };

function interpolate(template: string, params: Params | undefined): string {
  if (!params) return template;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** Split `<tag>text</tag>` (no nesting) into parts. Unmatched tags stay as text. */
export function parseRich(text: string): Part[] {
  const parts: Part[] = [];
  const re = /<([a-z][a-z0-9-]*)>(.*?)<\/\1>/gs;
  let last = 0;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > last) parts.push({ type: "text", text: text.slice(last, m.index) });
    parts.push({ type: "tag", tag: m[1]!, text: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}

/** Placeholders `{name}` and tags `<tag>` used by a message (for the catalog checks). */
export function placeholdersOf(message: Message): { params: string[]; tags: string[]; forms: string[] } {
  const texts = typeof message === "string" ? [message] : Object.values(message);
  const params = new Set<string>(), tags = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(/\{([A-Za-z0-9_]+)\}/g)) params.add(m[1]!);
    for (const m of t.matchAll(/<([a-z][a-z0-9-]*)>/g)) tags.add(m[1]!);
  }
  return { params: [...params].sort(), tags: [...tags].sort(), forms: typeof message === "string" ? [] : Object.keys(message).sort() };
}

/**
 * Build the formatter for one language. `catalogs["zh-Hant"]` is the SOURCE catalog (it defines the key union); the English catalog may be
 * partial during development, but the build checks (scripts/check-i18n.ts) require full parity before release.
 */
export function createI18n<K extends string>(
  catalogs: { readonly "zh-Hant": Readonly<Record<K, Message>>; readonly en: Readonly<Partial<Record<K, Message>>>; readonly "zh-Hans"?: Readonly<Partial<Record<K, Message>>> },
  lang: Lang,
  options: CreateOptions = {},
): I18n<K> {
  const pr = new Intl.PluralRules(LOCALE[lang]);
  const nf = (o?: Intl.NumberFormatOptions): Intl.NumberFormat => new Intl.NumberFormat(LOCALE[lang], o);

  function lookup(key: string): { message: Message | undefined; fell: boolean } {
    const catalog = (lang === "en" ? catalogs.en : lang === "zh-Hans" ? (catalogs["zh-Hans"] ?? {}) : catalogs["zh-Hant"]) as Record<string, Message | undefined>;
    const own = catalog[key];
    if (own !== undefined) return { message: own, fell: false };
    const src = (catalogs["zh-Hant"] as Record<string, Message | undefined>)[key];
    if (src !== undefined) { if (lang !== "zh-Hant") options.onFallback?.(key); return { message: src, fell: true }; }
    options.onMissing?.(key, lang);
    return { message: undefined, fell: false };
  }
  const text = (key: string, n?: number): string => {
    const { message } = lookup(key);
    if (message === undefined) return key;
    const pick = typeof message === "string" ? message : (message[n === undefined ? "other" : pr.select(n)] ?? message.other);
    return options.transform ? options.transform(pick) : pick;
  };

  const zh = (s: string): string => (lang === "zh-Hans" && options.zh !== undefined ? options.zh(s) : s);
  return {
    lang,
    script: scriptOf(lang),
    zhLang: zhLangOf(lang),
    zh,
    t: (key, params) => interpolate(text(key), params),
    plural: (key, n, params) => interpolate(text(key, n), { n: nf().format(n), ...params }),
    rich: (key, params) => parseRich(interpolate(text(key), params)),
    has: (key) => key in (catalogs["zh-Hant"] as object) || key in (catalogs.en as object),
    number: (n, o) => nf(o).format(n),
    date: (ms, o) => new Intl.DateTimeFormat(LOCALE[lang], { timeZone: "UTC", ...o }).format(ms),
    localized: (v) => (lang === "en" && v.en ? { text: v.en, fellBack: false } : { text: zh(v["zh-Hant"]), fellBack: lang === "en" }),
  };
}

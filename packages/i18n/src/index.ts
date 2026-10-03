// @tcm/i18n — a deliberately small message formatter (tech spec T5, docs/i18n-guide.md):
//   · typed keys: the key union comes from the zh-Hant source catalog;
//   · `{name}` interpolation; plural messages `{ one, other }` resolved with Intl.PluralRules (zh-Hant has only `other`);
//   · rich text: `<tag>text</tag>` is returned as parts for the UI to render (never HTML);
//   · en falls back to zh-Hant (never the reverse) and the fallback is REPORTED so the UI can mark untranslated text;
//   · Intl helpers for numbers and dates; no locale logic anywhere else.
export type Lang = "zh-Hant" | "en";
export const LANGS: readonly Lang[] = ["zh-Hant", "en"];
export const DEFAULT_LANG: Lang = "zh-Hant";

export type Plural = { readonly zero?: string; readonly one?: string; readonly two?: string; readonly few?: string; readonly many?: string; readonly other: string };
export type Message = string | Plural;
export type Params = Readonly<Record<string, string | number>>;

export type Part = { readonly type: "text"; readonly text: string } | { readonly type: "tag"; readonly tag: string; readonly text: string };

export interface Localized { readonly text: string; /** The text is Chinese shown in the English UI (untranslated). */ readonly fellBack: boolean }

export interface I18n<K extends string> {
  readonly lang: Lang;
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
  /** Called when a key is missing in both languages. */
  readonly onMissing?: (key: string, lang: Lang) => void;
  /** Called when the English UI falls back to a zh-Hant message. */
  readonly onFallback?: (key: string) => void;
}

const LOCALE: Record<Lang, string> = { "zh-Hant": "zh-Hant-TW", en: "en" };

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
  catalogs: { readonly "zh-Hant": Readonly<Record<K, Message>>; readonly en: Readonly<Partial<Record<K, Message>>> },
  lang: Lang,
  options: CreateOptions = {},
): I18n<K> {
  const pr = new Intl.PluralRules(LOCALE[lang]);
  const nf = (o?: Intl.NumberFormatOptions): Intl.NumberFormat => new Intl.NumberFormat(LOCALE[lang], o);

  function lookup(key: string): { message: Message | undefined; fell: boolean } {
    const own = lang === "en" ? (catalogs.en as Record<string, Message | undefined>)[key] : (catalogs["zh-Hant"] as Record<string, Message | undefined>)[key];
    if (own !== undefined) return { message: own, fell: false };
    const src = (catalogs["zh-Hant"] as Record<string, Message | undefined>)[key];
    if (src !== undefined) { if (lang === "en") options.onFallback?.(key); return { message: src, fell: true }; }
    options.onMissing?.(key, lang);
    return { message: undefined, fell: false };
  }
  const text = (key: string, n?: number): string => {
    const { message } = lookup(key);
    if (message === undefined) return key;
    if (typeof message === "string") return message;
    const category = n === undefined ? "other" : pr.select(n);
    return (message[category] ?? message.other);
  };

  return {
    lang,
    t: (key, params) => interpolate(text(key), params),
    plural: (key, n, params) => interpolate(text(key, n), { n: nf().format(n), ...params }),
    rich: (key, params) => parseRich(interpolate(text(key), params)),
    has: (key) => key in (catalogs["zh-Hant"] as object) || key in (catalogs.en as object),
    number: (n, o) => nf(o).format(n),
    date: (ms, o) => new Intl.DateTimeFormat(LOCALE[lang], { timeZone: "UTC", ...o }).format(ms),
    localized: (v) => (lang === "en" && v.en ? { text: v.en, fellBack: false } : { text: v["zh-Hant"], fellBack: lang === "en" }),
  };
}

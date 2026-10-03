// Language lives in the URL (`/:lang/…`, docs/ux-spec.md §3): the path is the single source of truth, so a shared link opens in the sender's language
// and the switch keeps the route. Pure functions only; the React glue is in App.tsx.
import type { Lang } from "@tcm/i18n";

export const LANGS: readonly Lang[] = ["zh-Hant", "en"];
export const DEFAULT_LANG: Lang = "zh-Hant";

const ALIASES: Readonly<Record<string, Lang>> = {
  "zh-hant": "zh-Hant", "zh": "zh-Hant", "zh-tw": "zh-Hant", "zh-hk": "zh-Hant",
  "en": "en", "en-us": "en", "en-gb": "en",
};

export interface LangPath {
  /** The language the first segment names, `null` when it names none. */
  readonly lang: Lang | null;
  /** True when the first segment is an accepted alias (`/zh/…`, `/EN/…`) rather than the canonical tag: the caller redirects to `canonical`. */
  readonly alias: boolean;
  /** The path without the language segment; always starts with "/". */
  readonly rest: string;
  /** The same path with the canonical language segment (equal to the input when it was already canonical). */
  readonly canonical: string;
}

/** Split `/zh-Hant/result/ab12` into its language and the rest. Matching of the language segment is case-insensitive and accepts `zh`, `zh-TW`, `en-US`, … */
export function splitLangPath(path: string): LangPath {
  const m = /^\/([^/]+)(\/.*)?$/.exec(path);
  const seg = m?.[1];
  const lang = seg === undefined ? undefined : ALIASES[seg.toLowerCase()];
  if (m === null || seg === undefined || lang === undefined) return { lang: null, alias: false, rest: path === "" ? "/" : path, canonical: path };
  const rest = m[2] ?? "/";
  return { lang, alias: seg !== lang, rest, canonical: `/${lang}${rest}` };
}

/** The same route in another language: `/en/start` → `/zh-Hant/start`. Search and hash are carried over. */
export function pathForLang(path: string, lang: Lang, search = "", hash = ""): string {
  const { rest } = splitLangPath(path);
  return `/${lang}${rest}${search === "" ? "" : search.startsWith("?") ? search : `?${search}`}${hash}`;
}

/** The language a browser prefers, for the one-time "View in English" offer only — never used to choose the language silently (i18n guide §1). */
export function browserPrefersEnglish(languages: readonly string[]): boolean {
  const first = languages[0]?.toLowerCase() ?? "";
  return first.startsWith("en");
}

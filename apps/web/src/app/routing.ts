// Language lives in the URL (`/:lang/…`, docs/ux-spec.md §3): the path is the single source of truth, so a shared link opens in the sender's language
// and the switch keeps the route. Pure functions only; the React glue is in App.tsx.
import type { Lang, PseudoMode } from "@tcm/i18n";

export const LANGS: readonly Lang[] = ["zh-Hant", "zh-Hans", "en"];
export const DEFAULT_LANG: Lang = "zh-Hant";

// `zh` stays Traditional (existing links keep their meaning, docs/post-mvp/design/simplified-chinese.md §5.3); the Simplified aliases are new.
const ALIASES: Readonly<Record<string, Lang>> = {
  "zh-hant": "zh-Hant", "zh": "zh-Hant", "zh-tw": "zh-Hant", "zh-hk": "zh-Hant",
  "zh-hans": "zh-Hans", "zh-cn": "zh-Hans", "zh-sg": "zh-Hans",
  "en": "en", "en-us": "en", "en-gb": "en",
};

/**
 * Pseudo-locales (docs/i18n-guide.md §8): a dev-only way to see the app with expanded, accented English (`/en-XA/…`) or doubled Chinese (`/zh-XL/…`). The segment names a base language
 * and a transform. The table is empty in a release build, so the segments are unknown there (a 404) and the code is dropped.
 */
const PSEUDO: Readonly<Record<string, { readonly lang: Lang; readonly mode: PseudoMode; readonly canonical: string }>> =
  __APP_PROFILE__ === "dev" ? { "en-xa": { lang: "en", mode: "xa", canonical: "en-XA" }, "zh-xl": { lang: "zh-Hant", mode: "xl", canonical: "zh-XL" } } : {};

export interface LangPath {
  /** The language the first segment names, `null` when it names none (for a pseudo-locale: its base language). */
  readonly lang: Lang | null;
  /** The pseudo-locale transform the first segment asks for (dev builds only), else `null`. */
  readonly pseudo: PseudoMode | null;
  /** The canonical first segment (`zh-Hant`, `en`, `en-XA` …) — the base of the nested router — or `null` when the first segment names no language. */
  readonly segment: string | null;
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
  const pseudo = seg === undefined ? undefined : PSEUDO[seg.toLowerCase()];
  const lang = pseudo?.lang ?? (seg === undefined ? undefined : ALIASES[seg.toLowerCase()]);
  if (m === null || seg === undefined || lang === undefined) return { lang: null, pseudo: null, segment: null, alias: false, rest: path === "" ? "/" : path, canonical: path };
  const rest = m[2] ?? "/";
  const segment = pseudo?.canonical ?? lang;
  return { lang, pseudo: pseudo?.mode ?? null, segment, alias: seg !== segment, rest, canonical: `/${segment}${rest}` };
}

/** The same route in another language: `/en/start` → `/zh-Hant/start`. Search and hash are carried over. */
export function pathForLang(path: string, lang: Lang, search = "", hash = ""): string {
  const { rest } = splitLangPath(path);
  return `/${lang}${rest}${search === "" ? "" : search.startsWith("?") ? search : `?${search}`}${hash}`;
}

/**
 * The language worth offering to a browser, for the one-time offer only — never used to choose the language silently (i18n guide §1): English for a browser whose first language is English,
 * Simplified Chinese for `zh-CN`, `zh-SG` and `zh-Hans…`. A bare `zh` and the Traditional regions need no offer: the app already opens in Traditional.
 */
export function languageOffer(languages: readonly string[]): "en" | "zh-Hans" | null {
  const first = languages[0]?.toLowerCase() ?? "";
  if (first.startsWith("en")) return "en";
  if (first === "zh-cn" || first === "zh-sg" || first.startsWith("zh-hans")) return "zh-Hans";
  return null;
}

/** Kept for callers that only ask about English. */
export const browserPrefersEnglish = (languages: readonly string[]): boolean => languageOffer(languages) === "en";

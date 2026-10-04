import { useEffect } from "react";
import { useLocation } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { splitLangPath } from "./routing.ts";

/** The pages worth finding in a search: the start page and the list of sources. Everything else is personal (a result, the history) or a step in the flow. */
const INDEXABLE = new Set(["/", "/sources"]);

/** What the build put in `<meta name="robots">`: a dev build or a closed beta says "noindex" and no route may undo that. */
const BUILD_ROBOTS: string | null = typeof document === "undefined" ? null : document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;

/** Keeps the document's metadata right: `<meta name="description">` in the page language, and `<meta name="robots">` for the current route — only the start page and the sources are indexable, never a result, a step or a not-found page. */
export function DocumentMeta(): null {
  const { t } = useI18n();
  const [location] = useLocation();
  const description = t.t("common.app.description");
  useEffect(() => { document.querySelector('meta[name="description"]')?.setAttribute("content", description); }, [description]);
  const { lang, rest } = splitLangPath(location);
  const indexable = lang !== null && INDEXABLE.has(rest);
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (meta === null) { meta = document.createElement("meta"); meta.name = "robots"; document.head.appendChild(meta); }
    meta.content = BUILD_ROBOTS !== null && /noindex/i.test(BUILD_ROBOTS) ? BUILD_ROBOTS : indexable ? "index, follow" : "noindex, nofollow";
  }, [indexable]);
  return null;
}

import type { ReactNode } from "react";
import type { Bilingual } from "@tcm/kb";
import { useI18n } from "../../i18n/I18nProvider.tsx";

/** A name in the page language with the other language as a quiet second line (zh-Hant · English, i18n guide §2). */
export function BilingualName({ v, tag: Tag = "span" }: { v: { readonly "zh-Hant": string; readonly en: string | null }; tag?: "span" | "strong" }): ReactNode {
  const { lang, t } = useI18n();
  const zh = <span lang={t.zhLang}>{t.zh(v["zh-Hant"])}</span>;
  if (lang !== "en") return <><Tag>{zh}</Tag>{v.en ? <span className="muted" lang="en"> · {v.en}</span> : null}</>;
  return <><Tag><span lang="en">{v.en ?? v["zh-Hant"]}</span></Tag><span className="muted"> · {zh}</span></>;
}

/**
 * Chinese-only prose from the knowledge base (治則, rationale …): marked "中" in the English UI until it is translated (K-13). `children` is the Chinese text AS DATA: a string is converted for
 * display in the page's script; other nodes are shown as they are (their strings must have been converted by whoever built them).
 */
export function ZhText({ children }: { children: ReactNode }): ReactNode {
  const { lang, t } = useI18n();
  return <><span lang={t.zhLang}>{typeof children === "string" ? t.zh(children) : children}</span>{lang === "en" ? <> <abbr className="muted" title={t.t("report.zhOnlyTitle")} lang="zh-Hant">{t.t("report.zhOnly")}</abbr></> : null}</>;
}

/**
 * Prose of the knowledge base that has an English rendering (K-13): the English page shows the English with a "draft translation" marker while it is a machine draft; the Chinese page
 * shows the Chinese. Without an English text the Chinese is shown as before, marked "中".
 */
export function Prose({ zh, en, status }: { zh: string; en?: string | undefined; status?: "machine-draft" | "reviewed" | undefined }): ReactNode {
  const { lang, t } = useI18n();
  if (lang !== "en") return <span lang={t.zhLang}>{t.zh(zh)}</span>;
  if (!en) return <ZhText>{zh}</ZhText>;
  return <><span lang="en">{en}</span>{status === "machine-draft" ? <> <abbr className="muted" title={t.t("report.draftTranslationTitle")}>({t.t("report.draftTranslation")})</abbr></> : null}</>;
}

export const nameOf = (v: Bilingual | undefined, fallback: string): { "zh-Hant": string; en: string | null } => v ?? { "zh-Hant": fallback, en: null };

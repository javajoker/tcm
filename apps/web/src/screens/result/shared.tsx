import type { ReactNode } from "react";
import type { Bilingual } from "@tcm/kb";
import { useI18n } from "../../i18n/I18nProvider.tsx";

/** A name in the page language with the other language as a quiet second line (zh-Hant · English, i18n guide §2). */
export function BilingualName({ v, tag: Tag = "span" }: { v: { readonly "zh-Hant": string; readonly en: string | null }; tag?: "span" | "strong" }): ReactNode {
  const { lang } = useI18n();
  const zh = <span lang="zh-Hant">{v["zh-Hant"]}</span>;
  if (lang === "zh-Hant") return <><Tag>{zh}</Tag>{v.en ? <span className="muted" lang="en"> · {v.en}</span> : null}</>;
  return <><Tag><span lang="en">{v.en ?? v["zh-Hant"]}</span></Tag><span className="muted"> · {zh}</span></>;
}

/** Chinese-only prose from the knowledge base (治則, rationale …): shown as is, marked "中" in the English UI until it is translated (K-13). */
export function ZhText({ children }: { children: ReactNode }): ReactNode {
  const { lang, t } = useI18n();
  return <><span lang="zh-Hant">{children}</span>{lang === "en" ? <> <abbr className="muted" title={t.t("report.zhOnlyTitle")} lang="zh-Hant">{t.t("report.zhOnly")}</abbr></> : null}</>;
}

export const nameOf = (v: Bilingual | undefined, fallback: string): { "zh-Hant": string; en: string | null } => v ?? { "zh-Hant": fallback, en: null };

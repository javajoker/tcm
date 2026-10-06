import type { ReactNode } from "react";
import { useI18n } from "../i18n/I18nProvider.tsx";
import type { Name } from "./types.ts";

/** A name in the page language with the other language beside it: Chinese first on the Chinese pages, English first on the English page. A name without an English form is the Chinese alone, marked as Chinese. */
export function NameLine({ name }: { name: Name }): ReactNode {
  const { lang, t } = useI18n();
  const zh = <span lang={t.zhLang}>{t.zh(name["zh-Hant"])}</span>;
  if (lang === "en" && name.en !== null) return <><span lang="en">{name.en}</span><span className="muted"> · {zh}</span></>;
  if (name.en === null) return zh;
  return <>{zh}<span className="muted" lang="en"> · {name.en}</span></>;
}

/** The name as plain text in the page language, for the document title and a link's accessible name. */
export function nameText(t: ReturnType<typeof useI18n>["t"], lang: string, name: Name): string {
  return lang === "en" && name.en !== null ? name.en : t.zh(name["zh-Hant"]);
}

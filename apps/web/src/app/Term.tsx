import type { ReactNode } from "react";
import { Tooltip } from "../ui/index.ts";
import { useLoadedOptional } from "./knowledge.tsx";

/**
 * A TCM term in running text. When the glossary knows it, the term opens a small explanation "中文 · pinyin · English" (UI spec §10, i18n guide §2);
 * otherwise (glossary not loaded yet, unknown term) it is plain text — never an error and never a blocker.
 * `children` is the text to show (defaults to the Chinese term; pass the English rendering on English pages).
 */
export function Term({ zh, children }: { zh: string; children?: ReactNode }): ReactNode {
  const loaded = useLoadedOptional();
  const entry = loaded?.kb.term(zh);
  const shown = children ?? <span lang="zh-Hant">{zh}</span>;
  if (!entry) return shown;
  return (
    <Tooltip trigger={shown}>
      <span lang="zh-Hant">{entry["zh-Hant"]}</span>{" · "}<i>{entry.pinyin}</i>{" · "}<span lang="en">{entry.en}</span>
      {entry.note ? <><br /><span lang="en">{entry.note}</span></> : null}
    </Tooltip>
  );
}

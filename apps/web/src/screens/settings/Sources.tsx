import type { ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { NeedsKnowledge, useLoaded } from "../../app/knowledge.tsx";
import { usePageTitle } from "../../app/usePageTitle.ts";
import { Card } from "../../ui/index.ts";
import { DataTable } from "../result/Panel.tsx";

function Body(): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const k = (key: string): string => t.t(key as MessageKey);

  const statusRows = (): string[][] => {
    const rows: string[][] = [];
    const count = (kind: "patterns" | "formulas", items: readonly { status: string }[]): void => {
      const by = new Map<string, number>();
      for (const i of items) by.set(i.status, (by.get(i.status) ?? 0) + 1);
      for (const [status, n] of [...by.entries()].sort()) rows.push([k(`common.sources.kind.${kind}`), String(n), t.t(`common.sources.status.${status === "reviewed" ? "reviewed" : status === "derived" ? "derived" : status === "curated-draft" ? "curated-draft" : "draft"}` as MessageKey)]);
    };
    count("patterns", kb.patterns);
    count("formulas", [...kb.formulas.values()]);
    return rows;
  };

  const books = new Map<string, { passages: number; verified: number; sources: Set<string> }>();
  const citations = [...new Set([...kb.formulas.values()].flatMap((f) => [f.source.ref, ...f.rationale_citations]).concat(kb.patterns.flatMap((p) => p.citations)))];
  for (const id of citations) {
    const c = kb.citation(id);
    if (!c) continue;
    const e = books.get(c.book) ?? { passages: 0, verified: 0, sources: new Set<string>() };
    e.passages += 1;
    if (c.verified) e.verified += 1;
    if (c.source_repo) e.sources.add(c.source_repo);
    books.set(c.book, e);
  }
  const bookRows = [...books.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-Hant")).map(([book, e]) => [<span key="b" lang="zh-Hant">《{book}》</span>, String(e.passages), String(e.verified), e.sources.size > 0 ? [...e.sources].join("; ") : t.t("common.sources.books.unknown")]);

  return (
    <>
      <h1>{t.t("common.sources.title")}</h1>
      <p>{t.t("common.sources.intro")}</p>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <Card title={t.t("common.sources.status.title")} headingLevel={2} id="sources-status">
          <DataTable caption={t.t("common.sources.status.caption")} head={["kind", "count", "status"].map((c) => k(`common.sources.status.col.${c}`))} rows={statusRows()} />
        </Card>
        <Card title={t.t("common.sources.books.title")} headingLevel={2} id="sources-books">
          <DataTable caption={t.t("common.sources.books.caption")} head={["book", "passages", "verified", "source"].map((c) => k(`common.sources.books.col.${c}`))} rows={bookRows} />
        </Card>
        <Card title={t.t("common.sources.licences.title")} headingLevel={2} id="sources-licences">
          <p>{t.t("common.sources.licences.body")}</p>
          <p style={{ margin: 0 }}><a href={`${import.meta.env.BASE_URL}NOTICE.txt`} lang="en">{t.t("common.sources.licences.link")}</a></p>
        </Card>
      </div>
    </>
  );
}

/** S18 Sources (UX spec §4.15): the books used with where the text comes from, and the review status of the content in plain words. */
export function Sources(): ReactNode {
  usePageTitle("common.sources.title");
  return <NeedsKnowledge><Body /></NeedsKnowledge>;
}

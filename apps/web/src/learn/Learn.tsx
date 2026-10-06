// /learn, /learn/<kind>, /learn/<kind>/<id>: one lazy route group (design §3, §7). A kind the section does not hold, or an id the knowledge base does not know, is the section's own not-found page.
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { NeedsKnowledge, useLoaded } from "../app/knowledge.tsx";
import { usePageTitle } from "../app/usePageTitle.ts";
import { Hub } from "./Hub.tsx";
import { List } from "./List.tsx";
import { Page } from "./Page.tsx";
import { pageOf } from "./pages.ts";
import { typeOfPath } from "./registry.ts";

function Missing(): ReactNode {
  const { t } = useI18n();
  usePageTitle("learn.notFound.title");
  return (
    <div role="alert" style={{ display: "grid", gap: "var(--space-3)" }}>
      <h1>{t.t("learn.notFound.title")}</h1>
      <p>{t.t("learn.notFound.body")}</p>
      <p><Link href="/learn">{t.t("learn.back")}</Link></p>
    </div>
  );
}

function Body({ type, id }: { type?: string | undefined; id?: string | undefined }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  if (type === undefined) return <Hub />;
  const info = typeOfPath(type);
  if (info === undefined) return <Missing />;
  if (id === undefined) return <List type={info.type} />;
  const model = pageOf(kb, info.type, id, t);
  return model === null ? <Missing /> : <Page model={model} />;
}

export function Learn({ type, id }: { type?: string; id?: string }): ReactNode {
  return <NeedsKnowledge><Body type={type} id={id} /></NeedsKnowledge>;
}

// The terms of service (the owner's decision PD-36): the conditions on which the project's services are used — for study and for the project's internal use — in the page
// language, from the `terms` messages. TERMS.md and TERMS.zh-TW.md are written from the same messages (scripts/terms.ts), and ticking the landing page's statement accepts
// them: every message of the namespace is part of the statement's version (disclaimer.ts), so a change of the terms asks everyone again.
import type { ReactNode } from "react";
import { usePageTitle } from "../../app/usePageTitle.ts";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";

/** The sections of the terms in order, each with its paragraphs: what the catalog holds (`terms.s<n>.title`, `terms.s<n>.p<m>`). */
export function termsSections(has: (key: string) => boolean): { readonly title: MessageKey; readonly paragraphs: readonly MessageKey[] }[] {
  const out: { title: MessageKey; paragraphs: MessageKey[] }[] = [];
  for (let n = 1; has(`terms.s${n}.title`); n++) {
    const paragraphs: MessageKey[] = [];
    for (let m = 1; has(`terms.s${n}.p${m}`); m++) paragraphs.push(`terms.s${n}.p${m}` as MessageKey);
    out.push({ title: `terms.s${n}.title` as MessageKey, paragraphs });
  }
  return out;
}

export function Terms(): ReactNode {
  const { t } = useI18n();
  usePageTitle("terms.title");
  return (
    <article>
      <h1>{t.t("terms.title")}</h1>
      <p className="muted">{t.t("terms.meta")}</p>
      <p><strong>{t.t("terms.draft")}</strong></p>
      <p>{t.t("terms.intro")}</p>
      {termsSections((k) => t.has(k as MessageKey)).map((s, i) => (
        <section key={s.title} aria-labelledby={`terms-${i + 1}`}>
          <h2 id={`terms-${i + 1}`}>{`${i + 1}. ${t.t(s.title)}`}</h2>
          {s.paragraphs.map((p) => <p key={p}>{t.t(p)}</p>)}
        </section>
      ))}
    </article>
  );
}

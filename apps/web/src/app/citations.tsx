// S15 Citation viewer (UX spec §4.12): a chip such as 《素問·至真要大論》 opens a bottom sheet (phone) / side drawer (desktop) with the original text, where it
// comes from and how far it has been verified. The sheet is a native modal <dialog>: Esc closes it and focus returns to the chip that opened it.
import { createContext, useCallback, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { Button, Dialog, DialogActions } from "../ui/index.ts";
import { useLoadedOptional } from "./knowledge.tsx";
import styles from "./citations.module.css";

interface Open { readonly id: string; readonly usedFor: string | undefined }
interface Value { readonly open: (id: string, usedFor?: string) => void }
const Ctx = createContext<Value | null>(null);

export function CitationsProvider({ children }: { children: ReactNode }): ReactNode {
  const [current, setCurrent] = useState<Open | null>(null);
  const open = useCallback((id: string, usedFor?: string) => setCurrent({ id, usedFor }), []);
  const value = useMemo<Value>(() => ({ open }), [open]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <CitationSheet current={current} onClose={() => setCurrent(null)} />
    </Ctx.Provider>
  );
}

function CitationSheet({ current, onClose }: { current: Open | null; onClose: () => void }): ReactNode {
  const { t } = useI18n();
  const loaded = useLoadedOptional();
  const id = useId();
  const c = current && loaded ? loaded.kb.citation(current.id) : undefined;
  return (
    <Dialog open={c !== undefined} onClose={onClose} labelledBy={id} variant="sheet">
      {c !== undefined && current !== null ? (
        <article>
          <p className="muted" style={{ margin: 0 }}>{t.t("report.citation.title")}</p>
          <h2 id={id} lang={t.zhLang} style={{ margin: "0 0 var(--space-2)" }}>《{t.zh(c.book)}》{t.zh(c.chapter)}</h2>
          {c.clause_no !== undefined ? <p className="muted">{t.t("report.citation.clause", { n: c.clause_no })}{c.clause_no_verified === false ? " *" : ""}</p> : null}
          <h3>{t.t("report.citation.original")}</h3>
          <blockquote lang={t.zhLang} className={`quote ${styles.quote}`}>{t.zh(c.quote_zh_hant)}</blockquote>
          <p><strong>{c.verified ? "✓ " : "○ "}{c.verified ? t.t("report.citation.verified") : t.t("report.citation.unverified")}</strong></p>
          <h3>{t.t("report.citation.translation")}</h3>
          <p className="muted">{t.t("report.citation.noTranslation")}</p>
          {c.source_repo ? (<><h3>{t.t("report.citation.edition")}</h3><p className="muted">{c.source_repo}</p></>) : null}
          <p className="muted">{t.t("report.citation.editionNote")} <Link href="/sources">{t.t("report.citation.sources")}</Link></p>
          {current.usedFor !== undefined ? <p>{t.t("report.citation.usedFor", { label: current.usedFor })}</p> : null}
        </article>
      ) : null}
      <DialogActions><Button variant="primary" onClick={onClose}>{t.t("report.citation.close")}</Button></DialogActions>
    </Dialog>
  );
}

/** A chip naming a classical source; Enter or a tap opens the sheet. Renders nothing for an id the knowledge base does not know or before it is loaded. */
export function CitationChip({ id, usedFor, mark }: { id: string; usedFor?: string; mark?: number }): ReactNode {
  const { t } = useI18n();
  const loaded = useLoadedOptional();
  const ctx = useContext(Ctx);
  const c = loaded?.kb.citation(id);
  if (!c || ctx === null) return null;
  const name = `《${t.zh(c.book)}》${t.zh(c.chapter)}`;
  const shown = mark === undefined ? name : `${name}（${mark}）`;
  return (
    <button type="button" className={styles.chip} lang={t.zhLang} aria-label={t.t("report.citation.open", { name: shown })} onClick={() => ctx.open(id, usedFor)}>{shown}</button>
  );
}

/**
 * The chips of a list of quotations. Two different passages of one chapter would read as the same chip twice, so they are numbered （1）（2） — only when they would otherwise look alike.
 */
export function CitationChips({ ids, usedFor }: { ids: readonly string[]; usedFor?: string }): ReactNode {
  const loaded = useLoadedOptional();
  const label = (id: string): string | undefined => { const c = loaded?.kb.citation(id); return c ? `${c.book}|${c.chapter}` : undefined; };
  const seen = new Map<string, number>();
  const total = new Map<string, number>();
  for (const id of ids) { const l = label(id); if (l !== undefined) total.set(l, (total.get(l) ?? 0) + 1); }
  return <>{ids.map((id) => {
    const l = label(id);
    const n = l === undefined ? 0 : (seen.get(l) ?? 0) + 1;
    if (l !== undefined) seen.set(l, n);
    return <CitationChip key={id} id={id} {...(usedFor !== undefined ? { usedFor } : {})} {...(l !== undefined && (total.get(l) ?? 0) > 1 ? { mark: n } : {})} />;
  })}</>;
}

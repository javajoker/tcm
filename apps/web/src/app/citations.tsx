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
          <h2 id={id} lang="zh-Hant" style={{ margin: "0 0 var(--space-2)" }}>《{c.book}》{c.chapter}</h2>
          {c.clause_no !== undefined ? <p className="muted">{t.t("report.citation.clause", { n: c.clause_no })}{c.clause_no_verified === false ? " *" : ""}</p> : null}
          <h3>{t.t("report.citation.original")}</h3>
          <blockquote lang="zh-Hant" className={`quote ${styles.quote}`}>{c.quote_zh_hant}</blockquote>
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
export function CitationChip({ id, usedFor }: { id: string; usedFor?: string }): ReactNode {
  const { t } = useI18n();
  const loaded = useLoadedOptional();
  const ctx = useContext(Ctx);
  const c = loaded?.kb.citation(id);
  if (!c || ctx === null) return null;
  const name = `《${c.book}》${c.chapter}`;
  return (
    <button type="button" className={styles.chip} lang="zh-Hant" aria-label={t.t("report.citation.open", { name })} onClick={() => ctx.open(id, usedFor)}>{name}</button>
  );
}

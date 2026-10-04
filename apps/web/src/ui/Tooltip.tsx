import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./ui.module.css";

/**
 * A "what is this?" disclosure. Works by tap/click and keyboard (Enter/Space on the button), never by hover alone; Esc and outside taps close it.
 * By default the trigger is a "?" button whose accessible name is `label` (localised by the caller). With `trigger` the visible text itself is the button
 * (an inline term in running text): its accessible name is that text, so no `label` is needed.
 */
export function Tooltip({ label, trigger, children }: { label?: string; trigger?: ReactNode; children: ReactNode }): ReactNode {
  const [open, setOpen] = useState(false);
  const id = useId();
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === "Escape") setOpen(false); };
    const onDown = (e: MouseEvent | TouchEvent): void => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); document.removeEventListener("touchstart", onDown); };
  }, [open]);
  return (
    <span className={styles.tipWrap} ref={wrap}>
      {trigger !== undefined ? (
        <button type="button" className={styles.termButton} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>{trigger}</button>
      ) : (
        <button type="button" className={styles.tipButton} aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
          <span aria-hidden="true">?</span>
        </button>
      )}
      {open ? <span role="note" id={id} className={styles.tipBubble}>{children}</span> : null}
    </span>
  );
}

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./ui.module.css";

export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Id of the heading that names the dialog. */
  readonly labelledBy: string;
  /** Esc and backdrop clicks close it. A blocking notice sets this to false: only its explicit action closes it. */
  readonly dismissable?: boolean;
  readonly variant?: "modal" | "full" | "sheet";
  readonly alert?: boolean;
  readonly children: ReactNode;
}

/**
 * A native modal <dialog>: the browser traps focus inside it, makes the rest of the page inert and restores focus to the opener on close.
 * `dismissable={false}` swallows Esc (cancel) and backdrop clicks and re-opens if the browser closes it anyway; the content must then offer its own explicit action.
 */
export function Dialog({ open, onClose, labelledBy, dismissable = true, variant = "modal", alert = false, children }: DialogProps): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);          // declared before the effects that open/close, so a close event sees the new value
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus();      // e.g. a notice's heading: the screen reader starts at the title, not at a button
    }
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event): void => { if (!dismissable) e.preventDefault(); };
    // Chrome lets a second Esc close a dialog whose first `cancel` was prevented (anti-abuse). A blocking dialog must not be closable that way:
    // if it closed while the owner still wants it open, show it again.
    const onNativeClose = (): void => {
      if (!dismissable && openRef.current) { d.showModal(); return; }
      onClose();
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("close", onNativeClose);
    return () => { d.removeEventListener("cancel", onCancel); d.removeEventListener("close", onNativeClose); };
  }, [dismissable, onClose]);
  const cls = [styles.dialog, variant === "full" ? styles.dialogFull : variant === "sheet" ? styles.sheet : ""].filter(Boolean).join(" ");
  return (
    // the backdrop is the <dialog> itself: a click on it (not on the content) dismisses a dismissable dialog
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog ref={ref} className={cls} aria-labelledby={labelledBy} role={alert ? "alertdialog" : undefined} onClick={(e) => { if (dismissable && e.target === e.currentTarget) onClose(); }}>
      <div className={styles.dialogBody}>{children}</div>
    </dialog>
  );
}

export function DialogActions({ children }: { children: ReactNode }): ReactNode {
  return <div className={styles.dialogActions}>{children}</div>;
}

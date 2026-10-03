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
 * `dismissable={false}` swallows Esc (cancel) and backdrop clicks; the content must then offer its own explicit action.
 */
export function Dialog({ open, onClose, labelledBy, dismissable = true, variant = "modal", alert = false, children }: DialogProps): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event): void => { if (!dismissable) e.preventDefault(); };
    const onNativeClose = (): void => onClose();
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

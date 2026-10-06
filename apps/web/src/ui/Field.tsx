import { cloneElement, useId, type ComponentProps, type ReactElement, type ReactNode, type SelectHTMLAttributes } from "react";
import styles from "./ui.module.css";

interface ControlProps { id?: string | undefined; "aria-describedby"?: string | undefined; "aria-invalid"?: boolean | undefined; required?: boolean | undefined }

/** Label + hint + error wired to the control with ids (aria-describedby, aria-invalid). */
export function Field({ label, hint, error, required, children }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactElement<ControlProps> }): ReactNode {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label>
      {hint ? <span id={`${id}-hint`} className={styles.hint}>{hint}</span> : null}
      {cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined, ...(required ? { required: true } : {}) })}
      {error ? <span id={`${id}-error`} className={styles.error} role="alert">{error}</span> : null}
    </div>
  );
}

/** A text field; `ref` is a prop (React 19), so a screen can move focus to it. */
export function TextInput(props: ComponentProps<"input">): ReactNode { return <input className={styles.input} {...props} />; }
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): ReactNode { return <select className={styles.input} {...props} />; }

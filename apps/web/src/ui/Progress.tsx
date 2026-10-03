import type { ReactNode } from "react";
import styles from "./ui.module.css";

/** A progress indicator with an accessible name (`name`, e.g. "Questions answered") and a text equivalent (`label`, e.g. "3 / 6"): never the bar alone. */
export function Progress({ value, name, label }: { value: number; name: string; label: string }): ReactNode {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div role="progressbar" aria-label={name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={label} className={styles.progress}>
      <div className={styles.progressBar} style={{ width: `${pct}%` }} />
    </div>
  );
}

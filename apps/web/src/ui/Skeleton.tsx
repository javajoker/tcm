import type { ReactNode } from "react";
import styles from "./ui.module.css";

/** A loading placeholder; the surrounding region should carry aria-busy and a visually hidden "loading" text. */
export function Skeleton({ width = "100%", height = "1.25rem" }: { width?: string; height?: string }): ReactNode {
  return <div className={styles.skeleton} style={{ width, height }} aria-hidden="true" />;
}

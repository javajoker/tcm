import type { ReactNode } from "react";
import styles from "./ui.module.css";

export function Chip({ tone = "plain", children }: { tone?: "plain" | "primary" | "notice"; children: ReactNode }): ReactNode {
  return <span className={[styles.chip, tone === "primary" ? styles.chipPrimary : tone === "notice" ? styles.chipNotice : ""].filter(Boolean).join(" ")}>{children}</span>;
}

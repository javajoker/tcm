import type { ReactNode } from "react";
import styles from "./ui.module.css";

export function Card({ title, headingLevel = 2, children, id }: { title?: ReactNode; headingLevel?: 2 | 3 | 4; children: ReactNode; id?: string }): ReactNode {
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  const labelled = title !== undefined && id !== undefined ? `${id}-title` : undefined;
  return (
    <section className={styles.card} id={id} aria-labelledby={labelled}>
      {title !== undefined ? <H className={styles.cardTitle} id={labelled}>{title}</H> : null}
      {children}
    </section>
  );
}

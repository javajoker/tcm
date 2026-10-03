import type { ReactNode } from "react";
import styles from "./ui.module.css";

export type NoticeKind = "emergency" | "caution" | "info";
const ICON: Record<NoticeKind, string> = { emergency: "!", caution: "▲", info: "i" };

/** A banner. Colour is never the only signal: an icon glyph and the (caller-supplied, localised) kind label come with it. */
export function Notice({ kind, kindLabel, title, children }: { kind: NoticeKind; kindLabel: string; title?: ReactNode; children?: ReactNode }): ReactNode {
  return (
    <div className={`${styles.notice} ${styles[kind]}`} role={kind === "emergency" ? "alert" : "status"}>
      <span className={styles.noticeIcon} aria-hidden="true">{ICON[kind]}</span>
      <div className={styles.noticeBody}>
        <span className="visually-hidden">{kindLabel}: </span>
        {title !== undefined ? <strong className={styles.noticeTitle}>{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}

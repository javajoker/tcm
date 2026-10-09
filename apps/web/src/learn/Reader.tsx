// The pages of the learning book and of the course (PM-43, PM-60): the blocks the bundler wrote, rendered as the page shows them. One reader for the two works of the set; a link to the
// other work is a link only where this build carries it (a public release may carry a reviewed book and no course), and its text otherwise.
import type { ReactNode } from "react";
import { Link } from "wouter";
import { itemChildren, itemText, type BookBlock, type BookText } from "@tcm/kb";
import { useLoaded } from "../app/knowledge.tsx";
import { bookHref, courseHref, hrefOf } from "./registry.ts";
import styles from "./Learn.module.css";

export type Work = "book" | "course";
const hrefIn = (work: Work, page: string): string => (work === "book" ? bookHref(page) : courseHref(page));

export function Spans({ text, work }: { text: BookText; work: Work }): ReactNode {
  const { kb } = useLoaded();
  return <>{text.map((s, i) => {
    if (typeof s === "string") return s;
    if ("strong" in s) return <strong key={i}>{s.strong}</strong>;
    if ("code" in s) return <code key={i}>{s.code}</code>;
    const target = s.work ?? work;
    const carried = target === "book" ? kb.book !== null : kb.course !== null;
    return carried ? <Link key={i} href={hrefIn(target, s.chapter)}>{s.text}</Link> : s.text;
  })}</>;
}

/** The name of each table's box, by the block's position: the section it is in (the page's title before the first section), numbered when a section holds more than one. */
function tableNames(blocks: readonly BookBlock[], title: string): ReadonlyMap<number, string> {
  const names = new Map<number, string>();
  const count = new Map<string, number>();
  let section = title;
  blocks.forEach((b, i) => {
    if (b.kind === "heading") section = b.text;
    if (b.kind !== "table") return;
    const n = (count.get(section) ?? 0) + 1;
    count.set(section, n);
    names.set(i, n === 1 ? section : `${section}（${n}）`);
  });
  return names;
}

/** The blocks of a page. A table scrolls inside its own box, named after the section it is in; a quotation links to its page among the quotations (R6). */
export function Blocks({ blocks, title, work }: { blocks: readonly BookBlock[]; title: string; work: Work }): ReactNode {
  const names = tableNames(blocks, title);
  return <>{blocks.map((b, i) => {
    switch (b.kind) {
      case "heading": return b.level === 3 ? <h3 key={i}>{b.text}</h3> : <h2 key={i}>{b.text}</h2>;
      case "paragraph": return <p key={i}><Spans text={b.text} work={work} /></p>;
      case "quote": return (
        <figure key={i} className={styles.bookQuote}>
          <blockquote className={`quote ${styles.quote}`}>「{b.text}」</blockquote>
          <figcaption>——<Link href={hrefOf("quotation", b.citation)}>《{b.source}》</Link></figcaption>
        </figure>
      );
      case "table": return (
        // a scrollable box has to be reachable with the keyboard (WCAG 2.1.1), so it is focusable and named
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        <div key={i} className={styles.tableWrap} tabIndex={0} role="region" aria-label={names.get(i)}>
          <table className={styles.table}>
            <thead><tr>{b.head.map((h, k) => <th key={k} scope="col"><Spans text={h} work={work} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => (k === 0 ? <th key={k} scope="row"><Spans text={c} work={work} /></th> : <td key={k}><Spans text={c} work={work} /></td>))}</tr>)}</tbody>
          </table>
        </div>
      );
      case "list": {
        const items = b.items.map((it, k) => {
          const children = itemChildren(it);
          return <li key={k}><Spans text={itemText(it)} work={work} />{children.length > 0 ? <ul>{children.map((c, j) => <li key={j}><Spans text={c} work={work} /></li>)}</ul> : null}</li>;
        });
        return b.ordered ? <ol key={i} start={b.start}>{items}</ol> : <ul key={i}>{items}</ul>;
      }
      case "code": return <pre key={i} className={styles.bookCode}>{b.text}</pre>;
    }
  })}</>;
}

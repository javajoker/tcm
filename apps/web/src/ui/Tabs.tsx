import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import styles from "./ui.module.css";

/** Tabs with the keyboard pattern of the ARIA authoring practices: Left/Right (and Home/End) move between tabs, the panel follows the selected tab. */
export function Tabs({ tabs, value, onChange, label }: { tabs: readonly { readonly id: string; readonly label: string; readonly panel: ReactNode }[]; value: string; onChange: (id: string) => void; label: string }): ReactNode {
  const base = useId();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const move = (e: KeyboardEvent, i: number): void => {
    const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    const id = tabs[next]!.id;
    onChange(id);
    refs.current[id]?.focus();
  };
  const current = tabs.find((t) => t.id === value) ?? tabs[0]!;
  return (
    <div>
      <div role="tablist" aria-label={label} className={styles.tablist}>
        {tabs.map((t, i) => (
          <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} type="button" role="tab" id={`${base}-tab-${t.id}`} aria-selected={t.id === current.id} aria-controls={`${base}-panel-${t.id}`} tabIndex={t.id === current.id ? 0 : -1}
            className={styles.tab} onClick={() => onChange(t.id)} onKeyDown={(e) => move(e, i)}>{t.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel-${current.id}`} aria-labelledby={`${base}-tab-${current.id}`} tabIndex={0}>{current.panel}</div>
    </div>
  );
}

import type { ReactNode } from "react";
import styles from "./ui.module.css";

export interface TileProps {
  readonly type: "radio" | "checkbox";
  readonly name: string;
  readonly value: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
}

/** A large selectable answer: a real radio or checkbox (so the browser and assistive technology own the semantics) with a ✓ mark — selection is never colour only. */
export function Tile({ type, name, value, checked, onChange, label, description, disabled = false }: TileProps): ReactNode {
  return (
    <label className={styles.tile}>
      <input type={type} name={name} value={value} checked={checked} disabled={disabled} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span className={`${styles.mark} ${type === "radio" ? styles.markRadio : styles.markCheck}`} aria-hidden="true">✓</span>
      <span className={styles.tileText}>
        <span>{label}</span>
        {description !== undefined ? <span className={styles.tileDesc}>{description}</span> : null}
      </span>
    </label>
  );
}

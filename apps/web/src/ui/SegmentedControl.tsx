import { useId, type ReactNode } from "react";
import styles from "./ui.module.css";

export interface SegmentedProps<V extends string> {
  readonly legend: ReactNode;
  readonly value: V | null;
  readonly options: readonly { readonly value: V; readonly label: ReactNode }[];
  readonly onChange: (value: V) => void;
  readonly hideLegend?: boolean;
}

/** A radiogroup shown as joined buttons (e.g. mild / moderate / strong). Arrow keys move the choice natively. */
export function SegmentedControl<V extends string>({ legend, value, options, onChange, hideLegend = false }: SegmentedProps<V>): ReactNode {
  const name = useId();
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className={hideLegend ? "visually-hidden" : styles.segmentedLegend}>{legend}</legend>
      <div className={styles.segmented}>
        {options.map((o) => (
          <label key={o.value} className={styles.segment}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

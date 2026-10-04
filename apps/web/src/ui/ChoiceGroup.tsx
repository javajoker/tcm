import { useId, type ReactNode } from "react";
import { Tile } from "./Tile.tsx";
import styles from "./ui.module.css";

export interface ChoiceOption { readonly value: string; readonly label: ReactNode; readonly description?: ReactNode; readonly disabled?: boolean }
interface GroupProps { readonly legend: ReactNode; readonly hint?: ReactNode; readonly error?: ReactNode; readonly options: readonly ChoiceOption[]; readonly inline?: boolean; readonly required?: boolean }

function Frame({ legend, hint, error, required, inline, children, describedBy }: GroupProps & { children: ReactNode; describedBy: string | undefined }): ReactNode {
  return (
    <fieldset className={styles.group} aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
      <legend className={styles.groupLegend}>{legend}{required ? <span aria-hidden="true"> *</span> : null}</legend>
      {hint ? <p className={styles.hint} style={{ margin: "0 0 var(--space-2)" }}>{hint}</p> : null}
      <div className={`${styles.groupOptions} ${inline ? styles.inline : ""}`}>{children}</div>
      {error ? <p className={styles.error} role="alert" style={{ margin: "var(--space-2) 0 0" }}>{error}</p> : null}
    </fieldset>
  );
}

/** One answer out of several (radio tiles in a fieldset). `value` null = not answered yet. */
export function ChoiceGroup(props: GroupProps & { value: string | null; onChange: (value: string) => void }): ReactNode {
  const name = useId();
  return (
    <Frame {...props} describedBy={undefined}>
      {props.options.map((o) => (
        <Tile key={o.value} type="radio" name={name} value={o.value} checked={props.value === o.value} onChange={() => props.onChange(o.value)} label={o.label}
          {...(o.description !== undefined ? { description: o.description } : {})} {...(o.disabled ? { disabled: true } : {})} />
      ))}
    </Frame>
  );
}

/** Any number of answers (checkbox tiles in a fieldset). */
export function CheckGroup(props: GroupProps & { values: readonly string[]; onChange: (values: readonly string[]) => void }): ReactNode {
  const name = useId();
  return (
    <Frame {...props} describedBy={undefined}>
      {props.options.map((o) => (
        <Tile key={o.value} type="checkbox" name={`${name}-${o.value}`} value={o.value} checked={props.values.includes(o.value)}
          onChange={(on) => props.onChange(on ? [...props.values, o.value] : props.values.filter((v) => v !== o.value))} label={o.label}
          {...(o.description !== undefined ? { description: o.description } : {})} {...(o.disabled ? { disabled: true } : {})} />
      ))}
    </Frame>
  );
}

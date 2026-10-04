import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./Button.tsx";
import { Field, TextInput } from "./Field.tsx";
import styles from "./ui.module.css";

/** A list of short free-text entries (allergens, medicine names): type, press Enter or the add button; each entry has a remove button. */
export function TagInput({ label, hint, addLabel, removeLabel, values, onChange, suggestions = [], maxLength = 60, maxItems = 20 }: {
  label: ReactNode; hint?: ReactNode; addLabel: string; removeLabel: (value: string) => string; values: readonly string[]; onChange: (values: readonly string[]) => void;
  suggestions?: readonly string[]; maxLength?: number; maxItems?: number;
}): ReactNode {
  const [text, setText] = useState("");
  const listId = useId();
  const entry = text.trim().replace(/\s+/g, " ");
  const canAdd = entry.length > 0 && values.length < maxItems && !values.some((v) => v.toLowerCase() === entry.toLowerCase());
  const add = (): void => { if (canAdd) { onChange([...values, entry]); setText(""); } };
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => { if (e.key === "Enter") { e.preventDefault(); add(); } };
  return (
    <div>
      <Field label={label} {...(hint !== undefined ? { hint } : {})}>
        <TextInput value={text} maxLength={maxLength} list={suggestions.length > 0 ? listId : undefined} onChange={(e) => setText(e.currentTarget.value)} onKeyDown={onKey} autoComplete="off" />
      </Field>
      {suggestions.length > 0 ? <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist> : null}
      <Button onClick={add} disabled={!canAdd}>{addLabel}</Button>
      {values.length > 0 ? (
        <ul className={styles.tags}>
          {values.map((v) => (
            <li key={v} className={styles.tag}>
              <span>{v}</span>
              <button type="button" className={styles.tagRemove} aria-label={removeLabel(v)} onClick={() => onChange(values.filter((x) => x !== v))}>×</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

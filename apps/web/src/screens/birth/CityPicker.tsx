import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type { City } from "@tcm/kb";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { Field, TextInput } from "../../ui/index.ts";
import styles from "./CityPicker.module.css";
import { namesOf, searchCities } from "./cities.ts";

function Name({ city }: { city: City }): ReactNode {
  const { t } = useI18n();
  const n = namesOf(city, t.lang, t.zh);
  return <><span lang={n.primaryLang}>{n.primary}</span>{n.secondary ? <span className="muted" lang={n.secondaryLang}> · {n.secondary}</span> : null}<span className="muted"> · {city.cc}</span></>;
}

/**
 * A type-ahead over the built-in city list (ARIA combobox with a listbox): type a name in either script, move with the arrow keys, Enter or a tap chooses. Choosing only fills the
 * longitude and the time zone of the form, which stay editable; the list is an aid, never a requirement.
 */
export function CityPicker({ cities, onChoose }: { cities: readonly City[]; onChoose: (c: City) => void }): ReactNode {
  const { t } = useI18n();
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => searchCities(cities, query, 8, t.zh), [cities, query, t]);
  const shown = open && query.trim() !== "";
  const choose = (c: City): void => { onChoose(c); const n = namesOf(c, t.lang, t.zh); setQuery(n.primary); setOpen(false); };
  const onKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!shown) { setOpen(true); setActive(0); } else if (hits.length > 0) setActive((a) => (a + 1) % hits.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (hits.length === 0 ? 0 : (a + hits.length - 1) % hits.length)); }
    else if (e.key === "Enter" && shown && hits[active]) { e.preventDefault(); choose(hits[active]!); }
    else if (e.key === "Escape" && shown) { e.preventDefault(); setOpen(false); }
  };
  return (
    <div className={styles.picker}>
      <Field label={t.t("intake.birth.city.label")} hint={t.t("intake.birth.city.hint")}>
        <TextInput role="combobox" aria-expanded={shown} aria-controls={`${id}-list`} aria-autocomplete="list" {...(shown && hits[active] ? { "aria-activedescendant": `${id}-${hits[active]!.id}` } : {})}
          autoComplete="off" spellCheck={false} value={query} onChange={(e) => { setQuery(e.currentTarget.value); setOpen(true); setActive(0); }} onKeyDown={onKey} onBlur={() => setOpen(false)} onFocus={() => setOpen(query.trim() !== "")} />
      </Field>
      {shown && hits.length > 0 ? (
        <ul id={`${id}-list`} role="listbox" aria-label={t.t("intake.birth.city.label")} className={styles.list}>
          {hits.map((c, i) => (
            <li key={c.id} id={`${id}-${c.id}`} role="option" aria-selected={i === active} className={i === active ? styles.optionActive : styles.option}
              onMouseDown={(e) => { e.preventDefault(); choose(c); }} onMouseEnter={() => setActive(i)}><Name city={c} /></li>
          ))}
        </ul>
      ) : null}
      {shown && hits.length > 0 ? <p className="visually-hidden" role="status">{t.t("intake.birth.city.count", { n: hits.length })}</p> : null}
      {shown && hits.length === 0 ? <p className="muted" role="status">{t.t("intake.birth.city.none")}</p> : null}
    </div>
  );
}

export { Name as CityName };

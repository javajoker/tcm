import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import { IS_DEV_PROFILE } from "../../app/profile.ts";
import { Link } from "wouter";
import type { City } from "@tcm/kb";
import { useLoadedOptional } from "../../app/knowledge.tsx";
import { useApp } from "../../app/store.tsx";
import type { Draft } from "../../storage/types.ts";
import { Button, Card, ChoiceGroup, Field, Notice, Select, Tile, TextInput } from "../../ui/index.ts";
import { CityName, CityPicker } from "./CityPicker.tsx";
import { formPatchOf, stillCity } from "./cities.ts";
import { echoOf, EMPTY_FORM, formOf, isTimeZone, parseBirth, type BirthForm } from "./model.ts";

interface Info { readonly resolution: "unique" | "ambiguous" | "nonexistent"; readonly echo: ReturnType<typeof echoOf> | null; readonly solarClock: { first: string; second: string } | null }

const zones = (): string[] => { try { return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? []; } catch { return []; } };
const hhmm = (c: { hour: number; minute: number }): string => `${String(c.hour).padStart(2, "0")}:${String(c.minute).padStart(2, "0")}`;

/**
 * The birth card (UX spec §4.2, S03): optional, opt-in in release (on by default in dev), with an echo of what will be used so the person can check it, both possibilities
 * for a time that happened twice when daylight saving ended, a warning for a time that never existed, and "remember on this device" (default off). The place is picked from the
 * built-in city list (K-10, loaded when the card opens) or entered as a longitude and an IANA time zone, which always works — also when the list cannot be loaded.
 */
export function BirthCard({ draft }: { draft: Draft }): ReactNode {
  const { t } = useI18n();
  const updateDraft = useApp((s) => s.updateDraft);
  const sex = draft.subject.sex;
  const [on, setOn] = useState(draft.birth !== undefined || IS_DEV_PROFILE);
  const [form, setForm] = useState<BirthForm>(draft.birth ? formOf(draft.birth) : EMPTY_FORM);
  const [info, setInfo] = useState<Info | null>(null);
  const parsed = useMemo(() => parseBirth(form, sex), [form, sex]);
  const key = parsed.birth === null ? "" : JSON.stringify(parsed.birth);
  const set = (patch: Partial<BirthForm>): void => setForm((f) => ({ ...f, ...patch }));
  const allZones = useMemo(() => zones(), []);
  const loaded = useLoadedOptional();
  const [cities, setCities] = useState<{ readonly status: "loading" | "ready" | "failed"; readonly items: readonly City[]; readonly attribution: string }>({ status: "loading", items: [], attribution: "" });
  const [city, setCity] = useState<City | null>(null);
  const named = city !== null && stillCity(form, city) ? city : null;
  useEffect(() => {
    if (!on || loaded === null) return;
    let cancelled = false;
    loaded.kb.cities().then((c) => { if (!cancelled) setCities({ status: "ready", items: c.items, attribution: c._meta.source.attribution }); }, () => { if (!cancelled) setCities({ status: "failed", items: [], attribution: "" }); });
    return () => { cancelled = true; };
  }, [on, loaded]);

  // what the chart makes of it: the echo, and whether the time is unique, happened twice or never happened (loaded on demand: the astronomy tables are not part of the first screens)
  useEffect(() => {
    let cancelled = false;
    if (!on || parsed.birth === null) { void Promise.resolve().then(() => { if (!cancelled) setInfo(null); }); return () => { cancelled = true; }; }
    const b = parsed.birth;
    void import("@tcm/wuxing").then(({ buildChart }) => {
      if (cancelled) return;
      try {
        const chart = buildChart(b);
        const solarClock = chart.corrections.resolution === "ambiguous"
          ? { first: hhmm(buildChart({ ...b, fold: "first" }).trueSolarCalendar), second: hhmm(buildChart({ ...b, fold: "second" }).trueSolarCalendar) } : null;
        setInfo({ resolution: chart.corrections.resolution, echo: echoOf(chart, b), solarClock });
      } catch { setInfo(null); }
    });
    return () => { cancelled = true; };
  }, [on, key, parsed.birth]);

  // keep the draft in step: valid and existing → stored; off, incomplete or non-existent → removed
  const usable = on && parsed.birth !== null && info !== null && info.resolution !== "nonexistent";
  const stored = draft.birth === undefined ? "" : JSON.stringify(draft.birth);
  useEffect(() => {
    if (usable && parsed.birth !== null) { if (stored !== key) updateDraft((d) => ({ ...d, birth: parsed.birth! })); }
    else if (stored !== "") updateDraft((d) => { const { birth: _b, ...rest } = d; return rest; });
  }, [usable, key, stored, parsed.birth, updateDraft]);

  const remove = (): void => { setOn(false); setForm(EMPTY_FORM); setInfo(null); };
  const tzInvalid = form.timeZone.trim() !== "" && !isTimeZone(form.timeZone);
  return (
    <Card title={t.t("intake.birth.title")} id="profile-birth">
      <p>{t.t("intake.birth.explainer")}</p>
      <p className="muted">{t.t("safety.notice.birth.text")}</p>
      <Tile type="checkbox" name="birth-on" value="on" checked={on} onChange={(v) => { setOn(v); if (!v) setInfo(null); }} label={t.t("intake.birth.toggle")} />
      {on ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          {sex === undefined ? <Notice kind="info" kindLabel={t.t("common.notice.info")}>{t.t("intake.birth.needSex")}</Notice> : null}
          <Field label={t.t("intake.birth.date")}><TextInput type="date" min="1900-01-01" value={form.date} onChange={(e) => set({ date: e.currentTarget.value })} /></Field>
          <Tile type="checkbox" name="birth-unknown-hour" value="unknown" checked={form.unknownHour} onChange={(v) => set({ unknownHour: v })} label={t.t("intake.birth.unknownHour")} description={form.unknownHour ? t.t("intake.birth.unknownHour.note") : undefined} />
          {form.unknownHour ? null : <Field label={t.t("intake.birth.time")}><TextInput type="time" value={form.time} onChange={(e) => set({ time: e.currentTarget.value })} /></Field>}
          <fieldset style={{ border: 0, padding: 0, margin: "var(--space-4) 0 0" }}>
            <legend style={{ fontWeight: 600 }}>{t.t("intake.birth.place")}</legend>
            <p className="muted">{t.t("intake.birth.place.hint")}</p>
            {cities.status === "ready" ? <CityPicker cities={cities.items} onChoose={(c) => { setCity(c); set(formPatchOf(c)); }} /> : null}
            {cities.status === "failed" ? <p className="muted">{t.t("intake.birth.city.failed")}</p> : null}
            {named ? <p>{t.t("intake.birth.city.using")} <CityName city={named} /></p> : null}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)" }}>
              <Field label={t.t("intake.birth.longitude")}><TextInput inputMode="decimal" maxLength={7} value={form.longitude} onChange={(e) => set({ longitude: e.currentTarget.value })} /></Field>
              <Field label={t.t("intake.birth.hemisphere")}>
                <Select value={form.hemisphere} onChange={(e) => set({ hemisphere: e.currentTarget.value as "east" | "west" })}>
                  <option value="east">{t.t("intake.birth.east")}</option><option value="west">{t.t("intake.birth.west")}</option>
                </Select>
              </Field>
            </div>
            <Field label={t.t("intake.birth.timeZone")} hint={t.t("intake.birth.timeZone.hint")} error={tzInvalid ? t.t("intake.birth.timeZone.invalid") : null}>
              <TextInput list="birth-zones" autoComplete="off" value={form.timeZone} onChange={(e) => set({ timeZone: e.currentTarget.value })} />
            </Field>
            <datalist id="birth-zones">{allZones.map((z) => <option key={z} value={z} />)}</datalist>
            {cities.status === "ready" ? <p className="muted">{t.t("intake.birth.city.attribution")} <Link href="/sources">{t.t("intake.birth.city.sources")}</Link></p> : null}
          </fieldset>

          {parsed.birth === null && sex !== undefined ? <p className="muted">{t.t("intake.birth.incomplete")}</p> : null}
          {info?.echo ? (
            <p role="status" style={{ fontWeight: 600 }}>
              {t.t("intake.birth.echo", { lon: info.echo.lon, hemi: t.t(`intake.birth.${info.echo.hemisphere}`), zone: info.echo.zone, delta: info.echo.deltaMinutes >= 0 ? `+${info.echo.deltaMinutes}` : `−${Math.abs(info.echo.deltaMinutes)}` })}
              {info.echo.dst ? <><br /><span className="muted" style={{ fontWeight: 400 }}>{t.t("intake.birth.echo.dst")}</span></> : null}
            </p>
          ) : null}
          {info?.resolution === "ambiguous" && info.solarClock ? (
            <ChoiceGroup legend={t.t("intake.birth.ambiguous.title")} hint={t.t("intake.birth.ambiguous.body")} value={form.fold} onChange={(v) => set({ fold: v as "first" | "second" })}
              options={[{ value: "first", label: t.t("intake.birth.ambiguous.first"), description: info.solarClock.first }, { value: "second", label: t.t("intake.birth.ambiguous.second"), description: info.solarClock.second }]} />
          ) : null}
          {info?.resolution === "nonexistent" ? (
            <Notice kind="caution" kindLabel={t.t("common.notice.caution")} title={t.t("intake.birth.nonexistent.title")}>
              <p>{t.t("intake.birth.nonexistent.body")}</p>
              <Button onClick={remove}>{t.t("intake.birth.remove")}</Button>
            </Notice>
          ) : null}

          <Tile type="checkbox" name="birth-remember" value="remember" checked={draft.rememberBirth} onChange={(v) => updateDraft((d) => ({ ...d, rememberBirth: v }))} label={t.t("intake.birth.remember")} description={t.t("intake.birth.remember.note")} />
          <p><Button variant="ghost" onClick={remove}>{t.t("intake.birth.remove")}</Button></p>
        </div>
      ) : null}
    </Card>
  );
}

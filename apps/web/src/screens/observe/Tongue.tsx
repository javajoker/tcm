import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { FlowGuard } from "../../app/FlowGuard.tsx";
import { NeedsKnowledge, useLoaded } from "../../app/knowledge.tsx";
import { useApp } from "../../app/store.tsx";
import { useDraft } from "../../app/useDraft.ts";
import { usePageTitle } from "../../app/usePageTitle.ts";
import type { Draft } from "../../storage/types.ts";
import { Button, Card, CheckGroup, ChoiceGroup, Dialog, DialogActions, LinkButton, Progress, Skeleton } from "../../ui/index.ts";
import { answerCategory, categoryState, setSign, signFeatures, SIGN_ZONES, type TongueCategory } from "./model.ts";
import { toggleExclusive } from "./exclusive.ts";
import { MAP_ZONES, TongueMap } from "./TongueMap.tsx";

const NORMAL = "__normal", UNSURE = "__unsure";
const SWATCH: Record<string, string> = { T_BODY_PALE: "var(--tongue-pale)", T_BODY_PALE_SWOLLEN: "var(--tongue-pale)", T_BODY_RED: "var(--tongue-red)", T_BODY_CRIMSON: "var(--tongue-crimson)", T_BODY_PURPLE: "var(--tongue-purple)" };

function Swatch({ color }: { color: string }): ReactNode {
  return <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" style={{ verticalAlign: "middle", marginInlineEnd: 8 }}><circle cx="11" cy="11" r="9" fill={color} stroke="var(--tongue-outline)" strokeWidth="1.5" /></svg>;
}

type StepId = "how" | "body" | "shape" | "coat" | "zones";

/** One whole-tongue category (colour, shape, coating): the features of the category, "normal" and "not sure"; choosing answers the whole category. */
function CategoryStep({ category, draft, multi, swatches }: { category: TongueCategory; draft: Draft; multi: boolean; swatches?: boolean }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const updateDraft = useApp((s) => s.updateDraft);
  const [note, setNote] = useState("");
  const features = kb.tongue.features.filter((f) => f.category === category);
  const state = categoryState(draft, kb, category);
  const groups = kb.exclusions.groups.filter((g) => g.kind === "exclusive" && g.symptoms.some((s) => features.some((f) => f.id === s))).map((g) => g.symptoms as readonly string[]);
  const value = state.answered === "normal" ? [NORMAL] : state.answered === "unsure" ? [UNSURE] : state.chosen;
  const options = [
    ...features.map((f) => ({ value: f.id, label: <>{swatches && SWATCH[f.id] ? <Swatch color={SWATCH[f.id]!} /> : null}<span>{t.localized(f.name).text}</span> <span className="muted" lang={t.zhLang}>{t.zh(f.name["zh-Hant"])}</span></> })),
    { value: NORMAL, label: t.t(`observe.tongue.${category}.normal` as MessageKey) },
    { value: UNSURE, label: t.t("observe.notSure") },
  ];
  const apply = (ids: readonly string[]): void => updateDraft((d) => (ids.includes(NORMAL) ? answerCategory(d, kb, category, { kind: "normal" }) : ids.includes(UNSURE) ? answerCategory(d, kb, category, { kind: "unsure" }) : ids.length === 0 ? answerCategory(d, kb, category, { kind: "clear" }) : answerCategory(d, kb, category, { kind: "chosen", ids })));
  const common = { legend: t.t(`observe.tongue.${category}.title` as MessageKey), hint: t.t(`observe.tongue.${category}.hint` as MessageKey), options };
  return (
    <>
      {multi ? (
        <CheckGroup {...common} values={value} onChange={(next) => {
          const added = next.find((v) => !value.includes(v));
          if (added === undefined) { apply(next); setNote(""); return; }
          if (added === NORMAL || added === UNSURE) { apply([added]); setNote(""); return; }
          const { next: n, replaced } = toggleExclusive(value.filter((v) => v !== NORMAL && v !== UNSURE), added, true, groups);
          apply(n);
          setNote(replaced ? t.t("observe.pulse.exclusive", { reason: replaced.map((id) => features.find((f) => f.id === id)).filter((f) => f !== undefined).map((f) => t.localized(f.name).text).join(" / ") }) : "");
        }} />
      ) : (
        <ChoiceGroup {...common} value={value[0] ?? null} onChange={(v) => apply([v])} />
      )}
      <p role="status" className="muted">{note}</p>
    </>
  );
}

function ZonesStep({ draft }: { draft: Draft }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const updateDraft = useApp((s) => s.updateDraft);
  const flags = kb.config.profile.tongue_pulse;
  const [open, setOpen] = useState<string | null>(null);
  const allowed = (zone: string): { id: string; name: { "zh-Hant": string; en: string } }[] => signFeatures(kb, zone).filter((f) => {
    const cat = kb.tongue.features.find((x) => x.id === f.id)?.category;
    return cat === "special" ? flags.tongue_special_signs : flags.tongue_zones;
  });
  const chosen = (zone: string): string[] => allowed(zone).map((f) => f.id).filter((id) => draft.findings[id]?.state === "present");
  const marked = new Set(MAP_ZONES.filter((z) => chosen(z).length > 0));
  const group = (zone: string): ReactNode => {
    const feats = allowed(zone);
    if (feats.length === 0) return null;
    return (
      <CheckGroup key={zone} legend={t.t(`observe.tongue.zone.${zone}` as MessageKey)} values={chosen(zone)}
        options={feats.map((f) => ({ value: f.id, label: <><span>{t.localized(f.name).text}</span> <span className="muted" lang={t.zhLang}>{t.zh(f.name["zh-Hant"])}</span></> }))}
        onChange={(next) => { const cur = chosen(zone); for (const id of next.filter((x) => !cur.includes(x))) updateDraft((d) => setSign(d, id, true)); for (const id of cur.filter((x) => !next.includes(x))) updateDraft((d) => setSign(d, id, false)); }} />
    );
  };
  return (
    <>
      <h2>{t.t("observe.tongue.zones.title")}</h2>
      <p className="muted">{t.t("observe.tongue.zones.hint")}</p>
      {flags.tongue_zones ? <TongueMap marked={marked} onOpen={setOpen} /> : null}
      <p className="muted">{t.t("observe.tongue.sublingual")}</p>
      <h3>{t.t("observe.tongue.zones.checklist")}</h3>
      {SIGN_ZONES.map(group)}
      <Dialog open={open !== null} onClose={() => setOpen(null)} labelledBy="zone-sheet-title" variant="sheet">
        {open !== null ? (
          <>
            <h2 id="zone-sheet-title">{t.t(`observe.tongue.zone.${open}` as MessageKey)}</h2>
            {allowed(open).length === 0 ? <p>{t.t("observe.tongue.sheet.empty")}</p> : group(open)}
          </>
        ) : null}
        <DialogActions><Button variant="primary" onClick={() => setOpen(null)}>{t.t("observe.done")}</Button></DialogActions>
      </Dialog>
    </>
  );
}

function Wizard({ draft }: { draft: Draft }): ReactNode {
  const { t } = useI18n();
  const { kb } = useLoaded();
  const [, navigate] = useLocation();
  const flags = kb.config.profile.tongue_pulse;
  const steps: StepId[] = ["how", "body", "shape", "coat", ...(flags.tongue_zones || flags.tongue_special_signs ? (["zones"] as const) : [])];
  const [i, setI] = useState(0);
  const step = steps[i]!;
  const last = i === steps.length - 1;
  return (
    <>
      <h1>{t.t("observe.tongue.title")}</h1>
      <p className="muted" style={{ margin: 0 }}>{t.t("observe.step", { n: i + 1, total: steps.length })}</p>
      <Progress value={(i + 1) / steps.length} name={t.t("observe.tongue.title")} label={t.t("observe.step", { n: i + 1, total: steps.length })} />
      <div style={{ marginTop: "var(--space-4)" }}>
        {step === "how" ? (
          <Card title={t.t("observe.tongue.how.title")} headingLevel={2}><p>{t.t("observe.tongue.how.body")}</p><p className="muted">{t.t("observe.tongue.how.quality")}</p></Card>
        ) : step === "body" ? <CategoryStep category="body" draft={draft} multi={false} swatches />
        : step === "shape" ? <CategoryStep category="shape" draft={draft} multi />
        : step === "coat" ? <CategoryStep category="coat" draft={draft} multi />
        : <ZonesStep draft={draft} />}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
        <Button onClick={() => (i === 0 ? navigate("/observe") : setI(i - 1))}>{t.t("observe.prev")}</Button>
        {last ? <Button variant="primary" onClick={() => navigate("/observe")}>{t.t("observe.done")}</Button> : <Button variant="primary" onClick={() => setI(i + 1)}>{t.t("observe.next")}</Button>}
        {!last ? <Button variant="ghost" onClick={() => setI(i + 1)}>{t.t("observe.skipStep")}</Button> : null}
        <LinkButton href="/observe" variant="ghost">{t.t("observe.cant")}</LinkButton>
      </div>
    </>
  );
}

/** S08 Tongue observation (UX spec §4.5): a five-step mini-flow; every step skippable; "Can't check right now" leaves with nothing recorded beyond what was already chosen. */
export function Tongue(): ReactNode {
  const { t } = useI18n();
  usePageTitle("observe.tongue.title");
  const draft = useDraft("/observe");
  if (draft === null) return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span><Skeleton height="2rem" width="50%" /></div>;
  return <NeedsKnowledge><FlowGuard draft={draft}><Wizard draft={draft} /></FlowGuard></NeedsKnowledge>;
}

import { lazy, Suspense, useState, type ReactNode } from "react";
import type { KnowledgeBase } from "@tcm/kb";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { Draft } from "../../storage/types.ts";
import { Button, LinkButton, Tile } from "../../ui/index.ts";
import { availableModules } from "./model.ts";

// AI help's way into the conversation (Release F): only in a build with AI help — the build constant is the condition, so a release makes no chunk for it (check-release rule 17)
const AiEntry = __APP_AI_ENABLED__ ? lazy(() => import("../../ai/AiEntry.tsx")) : null;

/** S06: the complaint modules (multi-select) or "nothing in particular"; at least one choice is needed. */
export function ModuleChooser({ kb, draft, onConfirm }: { kb: KnowledgeBase; draft: Draft; onConfirm: (modules: readonly string[]) => void }): ReactNode {
  const { t } = useI18n();
  const modules = availableModules(kb, draft);
  const initial = draft.inquiry.modules;
  const [chosen, setChosen] = useState<readonly string[]>(initial ?? []);
  const [general, setGeneral] = useState(initial !== null && initial.length === 0);
  const ok = general || chosen.length > 0;
  return (
    <>
      <h1>{t.t("intake.inquiry.modules.title")}</h1>
      {AiEntry !== null ? <Suspense fallback={null}><AiEntry draft={draft} /></Suspense> : null}
      <p>{t.t("intake.inquiry.modules.intro")}</p>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "var(--space-2)" }}>
        <legend className="visually-hidden">{t.t("intake.inquiry.modules.title")}</legend>
        {modules.map((m) => (
          <Tile key={m.id} type="checkbox" name="module" value={m.id} checked={chosen.includes(m.id)} label={t.localized(m.name).text} description={t.localized(m.description).text}
            onChange={(on) => { setGeneral(false); setChosen((c) => (on ? [...c, m.id] : c.filter((x) => x !== m.id))); }} />
        ))}
        <Tile type="checkbox" name="module" value="general" checked={general} label={t.t("intake.inquiry.modules.general")}
          onChange={(on) => { setGeneral(on); if (on) setChosen([]); }} />
      </fieldset>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-5)" }}>
        <LinkButton href="/screen">{t.t("common.action.back")}</LinkButton>
        <Button variant="primary" disabled={!ok} aria-describedby={ok ? undefined : "modules-help"} onClick={() => onConfirm(general ? [] : chosen)}>{t.t("intake.inquiry.modules.start")}</Button>
      </div>
      {ok ? null : <p id="modules-help" className="muted">{t.t("intake.inquiry.modules.help")}</p>}
    </>
  );
}


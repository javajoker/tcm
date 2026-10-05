import { useState, type ReactNode } from "react";
import { ENGINE_VERSION } from "@tcm/engine";
import { useI18n } from "../../i18n/I18nProvider.tsx";
import type { MessageKey } from "../../i18n/catalogs.ts";
import { useLoadedOptional } from "../../app/knowledge.tsx";
import { APP_BUILD, APP_PROFILE } from "../../app/profile.ts";
import { useApp } from "../../app/store.tsx";
import { LANGS } from "../../app/routing.ts";
import { usePageTitle } from "../../app/usePageTitle.ts";
import { TEXT_SCALES, THEMES } from "../../storage/types.ts";
import { Button, Card, ConfirmDialog, LinkButton, SegmentedControl, Tile } from "../../ui/index.ts";
import { DataTable } from "../result/Panel.tsx";

const SIZE_SLUG = { 0.9: "small", 1: "standard", 1.15: "large", 1.3: "xlarge" } as const;

/** S17 Settings and privacy (UX spec §4.14): preferences, an honest table of what is stored, erase everything, version stamps. */
export function Settings(): ReactNode {
  const { t, lang, setLang } = useI18n();
  usePageTitle("common.settings.title");
  const prefs = useApp((s) => s.prefs);
  const setPrefs = useApp((s) => s.setPrefs);
  const eraseAll = useApp((s) => s.eraseAll);
  const loaded = useLoadedOptional();
  const [confirm, setConfirm] = useState(false);
  const k = (key: string): string => t.t(key as MessageKey);

  const rows = (["prefs", "draft", "results", "birth"] as const).map((r) => [k(`common.settings.privacy.${r}`), k(`common.settings.privacy.${r}.where`), k(`common.settings.privacy.${r}.until`), k(`common.settings.privacy.${r}.remove`)]);
  return (
    <>
      <h1>{t.t("common.settings.title")}</h1>
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <Card title={t.t("common.settings.language")} headingLevel={2} id="settings-language">
          <SegmentedControl legend={t.t("common.settings.language")} hideLegend value={lang} onChange={setLang}
            options={LANGS.map((l) => ({ value: l, label: <span lang={l}>{t.t(`common.lang.name.${l}`)}</span> }))} />
        </Card>
        <Card title={t.t("common.settings.theme")} headingLevel={2} id="settings-theme">
          <SegmentedControl legend={t.t("common.settings.theme")} hideLegend value={prefs.theme} onChange={(theme) => setPrefs({ theme })}
            options={THEMES.map((v) => ({ value: v, label: k(`common.settings.theme.${v}`) }))} />
        </Card>
        <Card title={t.t("common.settings.textSize")} headingLevel={2} id="settings-text">
          <SegmentedControl legend={t.t("common.settings.textSize")} hideLegend value={String(prefs.textScale) as `${(typeof TEXT_SCALES)[number]}`} onChange={(v) => setPrefs({ textScale: Number(v) as (typeof TEXT_SCALES)[number] })}
            options={TEXT_SCALES.map((v) => ({ value: String(v) as `${typeof v}`, label: k(`common.settings.textSize.${SIZE_SLUG[v]}`) }))} />
        </Card>
        <Card title={t.t("common.settings.autoAdvance")} headingLevel={2} id="settings-auto">
          <Tile type="checkbox" name="autoAdvance" value="on" checked={prefs.autoAdvance} onChange={(on) => setPrefs({ autoAdvance: on })} label={t.t("common.settings.autoAdvance")} description={t.t("common.settings.autoAdvance.hint")} />
        </Card>

        <Card title={t.t("common.settings.rememberBirth")} headingLevel={2} id="settings-birth">
          <Tile type="checkbox" name="rememberBirthDefault" value="on" checked={prefs.rememberBirthDefault === true} onChange={(on) => setPrefs({ rememberBirthDefault: on })} label={t.t("common.settings.rememberBirth")} description={t.t("common.settings.rememberBirth.hint")} />
        </Card>

        <Card title={t.t("common.settings.privacy.title")} headingLevel={2} id="privacy">
          <p>{t.t("common.settings.privacy.intro")}</p>
          <DataTable caption={t.t("common.settings.privacy.caption")} head={["what", "where", "until", "remove"].map((c) => k(`common.settings.privacy.col.${c}`))} rows={rows} />
          <p>{t.t("common.settings.privacy.never")}</p>
          <p className="muted">{t.t("common.settings.privacy.shared")}</p>
          <p className="muted">{t.t("common.settings.privacy.hosting")}</p>
          <Button variant="danger" onClick={() => setConfirm(true)}>{t.t("common.settings.erase.action")}</Button>
        </Card>

        <Card title={t.t("common.settings.versions.title")} headingLevel={2} id="settings-versions">
          <dl style={{ margin: 0, display: "grid", gap: "var(--space-2)" }}>
            <div><dt style={{ fontWeight: 600 }}>{t.t("common.settings.versions.app")}</dt><dd style={{ margin: 0 }}>{APP_BUILD}</dd></div>
            <div><dt style={{ fontWeight: 600 }}>{t.t("common.settings.versions.kb")}</dt><dd style={{ margin: 0 }}>{loaded ? loaded.kb.version.slice(0, 12) : "…"}</dd></div>
            <div><dt style={{ fontWeight: 600 }}>{t.t("common.settings.versions.engine")}</dt><dd style={{ margin: 0 }}>{ENGINE_VERSION}</dd></div>
            <div><dt style={{ fontWeight: 600 }}>{t.t("common.settings.versions.profile")}</dt><dd style={{ margin: 0 }}>{loaded ? loaded.kb.profile : APP_PROFILE}</dd></div>
          </dl>
          <p><LinkButton href="/sources">{t.t("common.settings.links.sources")}</LinkButton></p>
        </Card>
      </div>

      <ConfirmDialog open={confirm} title={t.t("common.settings.erase.title")} confirmLabel={t.t("common.settings.erase.confirm")} cancelLabel={t.t("common.action.cancel")}
        onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); void eraseAll(); }}>
        <p>{t.t("common.settings.erase.body")}</p>
      </ConfirmDialog>
    </>
  );
}

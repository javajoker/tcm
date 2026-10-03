import { useState, type ReactNode } from "react";
import type { Lang } from "@tcm/i18n";
import { I18nProvider, useI18n } from "../i18n/I18nProvider.tsx";
import { AppShell } from "./AppShell.tsx";

function Placeholder(): ReactNode {
  const { t } = useI18n();
  return <h1>{t.t("common.app.name")}</h1>;
}

export function App(): ReactNode {
  const [lang, setLang] = useState<Lang>("zh-Hant");
  return (
    <I18nProvider lang={lang} setLang={setLang}>
      <AppShell><Placeholder /></AppShell>
    </I18nProvider>
  );
}

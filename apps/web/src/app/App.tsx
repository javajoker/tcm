import { lazy, Suspense, useState, type ReactNode } from "react";
import type { Lang } from "@tcm/i18n";
import { I18nProvider, useI18n } from "../i18n/I18nProvider.tsx";
import { AppShell } from "./AppShell.tsx";
import { IS_DEV_PROFILE } from "./profile.ts";

// dev-only route. The comparison must be written against the compile-time define itself: a dynamic import behind an imported constant is
// still emitted as a chunk, whereas a literal condition removes the import (and the whole dev module) from a release build.
const Catalogue = __APP_PROFILE__ === "dev" ? lazy(() => import("../dev/Catalogue.tsx")) : null;
const isCatalogueRoute = (): boolean => IS_DEV_PROFILE && window.location.pathname.replace(/\/$/, "") === "/dev/catalogue";

function Placeholder(): ReactNode {
  const { t } = useI18n();
  return <h1>{t.t("common.app.name")}</h1>;
}

export function App(): ReactNode {
  const [lang, setLang] = useState<Lang>("zh-Hant");
  return (
    <I18nProvider lang={lang} setLang={setLang}>
      <AppShell>
        {Catalogue !== null && isCatalogueRoute() ? <Suspense fallback={null}><Catalogue /></Suspense> : <Placeholder />}
      </AppShell>
    </I18nProvider>
  );
}

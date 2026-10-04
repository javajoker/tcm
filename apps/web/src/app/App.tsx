import { lazy, Suspense, useCallback, type ReactNode } from "react";
import { Redirect, Route, Router, Switch, useLocation, useSearch } from "wouter";
import type { Lang } from "@tcm/i18n";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { AppShell } from "./AppShell.tsx";
import { Landing } from "./Landing.tsx";
import { NotFound } from "./NotFound.tsx";
import { PrefsEffects } from "./PrefsEffects.tsx";
import { RouteFocus } from "./RouteFocus.tsx";
import { DEFAULT_LANG, pathForLang, splitLangPath } from "./routing.ts";
import { useApp } from "./store.tsx";

// dev-only route. The comparison must be written against the compile-time define itself: a dynamic import behind an imported constant is
// still emitted as a chunk, whereas a literal condition removes the import (and the whole dev module) from a release build.
const Catalogue = __APP_PROFILE__ === "dev" ? lazy(() => import("../dev/Catalogue.tsx")) : null;

/** Routes inside a language scope; paths here carry no language segment (the nested Router's base supplies it). */
function Screens(): ReactNode {
  return (
    <>
      <RouteFocus />
      <Switch>
        <Route path="/"><Landing /></Route>
        {Catalogue !== null ? <Route path="/_dev/components"><Suspense fallback={null}><Catalogue /></Suspense></Route> : null}
        <Route><NotFound /></Route>
      </Switch>
    </>
  );
}

/**
 * The language is the first path segment. `/` goes to the entry language (the one the user chose, else zh-Hant for everyone);
 * `/zh`, `/en-US`… are redirected to the canonical tag; anything else is a not-found screen in the default language.
 */
export function App(): ReactNode {
  const entryLang = useApp((s) => s.prefs.lang) ?? DEFAULT_LANG;
  const chooseLang = useApp((s) => s.chooseLang);
  const [location, navigate] = useLocation();
  const search = useSearch();
  const parsed = splitLangPath(location);
  const lang = parsed.lang ?? DEFAULT_LANG;
  // an explicit switch is a choice: remember it (so `/` opens in it next time) and retire the one-time English offer
  const setLang = useCallback((next: Lang) => { chooseLang(next); navigate(pathForLang(location, next, search, window.location.hash), { replace: true }); }, [location, search, navigate, chooseLang]);

  if (location === "/" || location === "") return <Redirect to={`/${entryLang}/`} replace />;
  if (parsed.lang !== null && parsed.alias) return <Redirect to={parsed.canonical + (search === "" ? "" : `?${search}`)} replace />;

  return (
    <I18nProvider lang={lang} setLang={setLang}>
      <PrefsEffects />
      <Router base={parsed.lang === null ? "" : `/${parsed.lang}`}>
        <AppShell>
          {parsed.lang === null ? <NotFound /> : <Screens />}
        </AppShell>
      </Router>
    </I18nProvider>
  );
}

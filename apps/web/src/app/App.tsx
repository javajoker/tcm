import { lazy, Suspense, useCallback, type ReactNode } from "react";
import { Redirect, Route, Router, Switch, useLocation, useSearch } from "wouter";
import type { Lang } from "@tcm/i18n";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { AppShell } from "./AppShell.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { CitationsProvider } from "./citations.tsx";
import { KnowledgeProvider, type Loader } from "./knowledge.tsx";
import { Landing } from "./Landing.tsx";
import { NotFound } from "./NotFound.tsx";
import { PrefsEffects } from "./PrefsEffects.tsx";
import { RouteFocus } from "./RouteFocus.tsx";
import { Profile } from "../screens/profile/Profile.tsx";
import { Inquiry } from "../screens/inquiry/Inquiry.tsx";
import { FormulaDetail } from "../screens/result/FormulaDetail.tsx";
import { Result } from "../screens/result/Result.tsx";
import { Review } from "../screens/review/Review.tsx";
import { Screening } from "../screens/screening/Screening.tsx";
import { Settings } from "../screens/settings/Settings.tsx";
import { Sources } from "../screens/settings/Sources.tsx";
import { DEFAULT_LANG, pathForLang, splitLangPath } from "./routing.ts";
import { useApp } from "./store.tsx";

// dev-only route. The comparison must be written against the compile-time define itself: a dynamic import behind an imported constant is
// still emitted as a chunk, whereas a literal condition removes the import (and the whole dev module) from a release build.
const Catalogue = __APP_PROFILE__ === "dev" ? lazy(() => import("../dev/Catalogue.tsx")) : null;

/** Routes inside a language scope; paths here carry no language segment (the nested Router's base supplies it). */
function Screens(): ReactNode {
  const [path] = useLocation();
  return (
    <>
      <RouteFocus />
      <ErrorBoundary resetKey={path}>
        <Switch>
          <Route path="/"><Landing /></Route>
          <Route path="/start"><Profile /></Route>
          <Route path="/screen"><Screening /></Route>
          <Route path="/inquiry"><Inquiry /></Route>
          <Route path="/review"><Review /></Route>
          <Route path="/settings"><Settings /></Route>
          <Route path="/sources"><Sources /></Route>
          <Route path="/result/:id/formula/:fid">{(params) => <FormulaDetail id={params.id} fid={params.fid} />}</Route>
          <Route path="/result/:id">{(params) => <Result id={params.id} />}</Route>
          {Catalogue !== null ? <Route path="/_dev/components"><Suspense fallback={null}><Catalogue /></Suspense></Route> : null}
          <Route><NotFound /></Route>
        </Switch>
      </ErrorBoundary>
    </>
  );
}

/**
 * The language is the first path segment. `/` goes to the entry language (the one the user chose, else zh-Hant for everyone);
 * `/zh`, `/en-US`… are redirected to the canonical tag; anything else is a not-found screen in the default language.
 */
export function App({ load }: { load?: Loader }): ReactNode {
  return <KnowledgeProvider {...(load ? { load } : {})}><LanguageRoutes /></KnowledgeProvider>;
}

function LanguageRoutes(): ReactNode {
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
      <CitationsProvider>
        <PrefsEffects />
        <Router base={parsed.lang === null ? "" : `/${parsed.lang}`}>
          <AppShell>
            {parsed.lang === null ? <NotFound /> : <Screens />}
          </AppShell>
        </Router>
      </CitationsProvider>
    </I18nProvider>
  );
}

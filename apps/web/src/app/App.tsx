import { lazy, Suspense, useCallback, type ReactNode } from "react";
import { Redirect, Route, Router, Switch, useLocation, useSearch } from "wouter";
import type { Lang } from "@tcm/i18n";
import { I18nProvider } from "../i18n/I18nProvider.tsx";
import { AppShell } from "./AppShell.tsx";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { CitationsProvider } from "./citations.tsx";
import { KnowledgeProvider, type Loader } from "./knowledge.tsx";
import { Landing } from "./Landing.tsx";
import { DocumentMeta } from "./DocumentMeta.tsx";
import { NotFound } from "./NotFound.tsx";
import { PrefsEffects } from "./PrefsEffects.tsx";
import { RouteFocus } from "./RouteFocus.tsx";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { Skeleton } from "../ui/index.ts";
import { DEFAULT_LANG, pathForLang, splitLangPath } from "./routing.ts";
import { useApp } from "./store.tsx";

// Every screen except the landing page is its own chunk (tech spec §12: the initial JavaScript is the shell and the landing page; the flow loads as the person walks through it).
const Profile = lazy(() => import("../screens/profile/Profile.tsx").then((m) => ({ default: m.Profile })));
const History = lazy(() => import("../screens/history/History.tsx").then((m) => ({ default: m.History })));
const Constitution = lazy(() => import("../screens/constitution/Constitution.tsx").then((m) => ({ default: m.Constitution })));
const Inquiry = lazy(() => import("../screens/inquiry/Inquiry.tsx").then((m) => ({ default: m.Inquiry })));
const Observe = lazy(() => import("../screens/observe/Observe.tsx").then((m) => ({ default: m.Observe })));
const Pulse = lazy(() => import("../screens/observe/Pulse.tsx").then((m) => ({ default: m.Pulse })));
const Tongue = lazy(() => import("../screens/observe/Tongue.tsx").then((m) => ({ default: m.Tongue })));
const FormulaDetail = lazy(() => import("../screens/result/FormulaDetail.tsx").then((m) => ({ default: m.FormulaDetail })));
const PractitionerSummary = lazy(() => import("../screens/result/PractitionerSummary.tsx").then((m) => ({ default: m.PractitionerSummary })));
const Result = lazy(() => import("../screens/result/Result.tsx").then((m) => ({ default: m.Result })));
const Review = lazy(() => import("../screens/review/Review.tsx").then((m) => ({ default: m.Review })));
const Screening = lazy(() => import("../screens/screening/Screening.tsx").then((m) => ({ default: m.Screening })));
const Settings = lazy(() => import("../screens/settings/Settings.tsx").then((m) => ({ default: m.Settings })));
const Sources = lazy(() => import("../screens/settings/Sources.tsx").then((m) => ({ default: m.Sources })));

// dev-only route. The comparison must be written against the compile-time define itself: a dynamic import behind an imported constant is
// still emitted as a chunk, whereas a literal condition removes the import (and the whole dev module) from a release build.
const Catalogue = __APP_PROFILE__ === "dev" ? lazy(() => import("../dev/Catalogue.tsx")) : null;
const Inspector = __APP_PROFILE__ === "dev" ? lazy(() => import("../dev/Inspector.tsx")) : null;

/** What the person sees while a screen's chunk loads: a busy region that says so, with the skeleton of a page. */
function LoadingScreen(): ReactNode {
  const { t } = useI18n();
  return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span><Skeleton height="2rem" width="50%" /><br /><Skeleton /><br /><Skeleton /></div>;
}

/** Routes inside a language scope; paths here carry no language segment (the nested Router's base supplies it). */
function Screens(): ReactNode {
  const [path] = useLocation();
  return (
    <>
      <RouteFocus />
      <ErrorBoundary resetKey={path}>
        <Suspense fallback={<LoadingScreen />}>
        <Switch>
          <Route path="/"><Landing /></Route>
          <Route path="/start"><Profile /></Route>
          <Route path="/screen"><Screening /></Route>
          <Route path="/inquiry"><Inquiry /></Route>
          <Route path="/observe"><Observe /></Route>
          <Route path="/constitution"><Constitution /></Route>
          <Route path="/observe/tongue"><Tongue /></Route>
          <Route path="/observe/pulse"><Pulse /></Route>
          <Route path="/review"><Review /></Route>
          <Route path="/history"><History /></Route>
          <Route path="/settings"><Settings /></Route>
          <Route path="/sources"><Sources /></Route>
          <Route path="/result/:id/summary">{(params) => <PractitionerSummary id={params.id} />}</Route>
          <Route path="/result/:id/formula/:fid">{(params) => <FormulaDetail id={params.id} fid={params.fid} />}</Route>
          <Route path="/result/:id">{(params) => <Result id={params.id} />}</Route>
          {Inspector !== null ? <Route path="/_dev"><Suspense fallback={null}><Inspector /></Suspense></Route> : null}
          {Catalogue !== null ? <Route path="/_dev/components"><Suspense fallback={null}><Catalogue /></Suspense></Route> : null}
          <Route><NotFound /></Route>
        </Switch>
        </Suspense>
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
    <I18nProvider lang={lang} setLang={setLang} pseudo={parsed.pseudo}>
      <CitationsProvider>
        <PrefsEffects />
        <DocumentMeta />
        <Router base={parsed.segment === null ? "" : `/${parsed.segment}`}>
          <AppShell>
            {parsed.lang === null ? <NotFound /> : <Screens />}
          </AppShell>
        </Router>
      </CitationsProvider>
    </I18nProvider>
  );
}

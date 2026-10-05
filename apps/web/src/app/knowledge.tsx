// Lazy loading of the knowledge base and the engine (tech spec §8, UX spec S19). Both are fetched after the first paint, in their own chunks, so the
// landing page and the first screens never wait for them; screens that need them sit inside <NeedsKnowledge>. A failure is a state with a retry,
// never a partial result.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type * as EngineModule from "@tcm/engine";
import type { KbErrorCode, KnowledgeBase } from "@tcm/kb";
import type { Script } from "@tcm/i18n";
import { DisplayContext, identity } from "../i18n/display.ts";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { IS_DEV_PROFILE } from "./profile.ts";
import { Button, Notice, Skeleton } from "../ui/index.ts";

export type Engine = typeof EngineModule;
export interface Loaded { readonly kb: KnowledgeBase; readonly engine: Engine }
export type KnowledgeState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly loaded: Loaded }
  | { readonly status: "error"; readonly code: KbErrorCode | "unknown"; readonly offline: boolean };

/** `script` is the script Chinese text is shown in; the data and the engine are the same for both (docs/post-mvp/design/simplified-chinese.md). */
const LOADING: KnowledgeState = { status: "loading" };

export type Loader = (script: Script) => Promise<Loaded>;

export const defaultLoader: Loader = async (script) => {
  const [{ loadKnowledgeBase }, engine] = await Promise.all([import("@tcm/kb"), import("@tcm/engine")]);
  // a display list that cannot be used leaves Chinese text in the data's own script (`kb.script` says `Hant`): a reader sees Traditional text, never a broken page
  const kb = await loadKnowledgeBase({ baseUrl: `${import.meta.env.BASE_URL}kb`, script });
  return { kb, engine };
};

interface Value { readonly state: KnowledgeState; readonly retry: () => void }
const Ctx = createContext<Value | null>(null);

const isOffline = (): boolean => typeof navigator !== "undefined" && navigator.onLine === false;
const failure = (e: unknown): KnowledgeState => ({ status: "error", code: typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string" ? ((e as { code: KbErrorCode }).code) : "unknown", offline: isOffline() });

/** One fetch per (loader, attempt), even when StrictMode runs the effect twice. */
const inflight = new WeakMap<Loader, Map<string, Promise<Loaded>>>();
function loadOnce(load: Loader, attempt: number, script: Script): Promise<Loaded> {
  let attempts = inflight.get(load);
  if (attempts === undefined) { attempts = new Map(); inflight.set(load, attempts); }
  const key = `${attempt}:${script}`;
  let p = attempts.get(key);
  if (p === undefined) { p = load(script); attempts.set(key, p); }
  return p;
}

export function KnowledgeProvider({ load = defaultLoader, script = "Hant", children }: { load?: Loader; /** The script of Chinese text in the page language; a change loads the knowledge base again with the other display list. */ script?: Script; children: ReactNode }): ReactNode {
  // what was loaded or what failed, and for which script: a state for another script than the page's is "loading" (derived, so no state is set from an effect before the fetch settles)
  const [settled, setSettled] = useState<{ readonly state: KnowledgeState; readonly script: Script; readonly attempt: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const state: KnowledgeState = settled !== null && settled.script === script && settled.attempt === attempt ? settled.state : LOADING;
  useEffect(() => {
    let cancelled = false;
    loadOnce(load, attempt, script).then((loaded) => { if (!cancelled) setSettled({ state: { status: "ready", loaded }, script, attempt }); }, (e: unknown) => { if (!cancelled) setSettled({ state: failure(e), script, attempt }); });
    return () => { cancelled = true; };
  }, [attempt, load, script]);
  const retry = useCallback(() => { setAttempt((a) => a + 1); }, []);
  // coming back online after a failure: try again without making the user find the button
  useEffect(() => {
    if (state.status !== "error") return;
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [state.status, retry]);
  const value = useMemo<Value>(() => ({ state, retry }), [state, retry]);
  const zh = state.status === "ready" ? state.loaded.kb.zh : identity;
  return <Ctx.Provider value={value}><DisplayContext.Provider value={zh}>{children}</DisplayContext.Provider></Ctx.Provider>;
}

export function useKnowledge(): Value {
  const v = useContext(Ctx);
  if (v === null) throw new Error("useKnowledge must be used inside <KnowledgeProvider>");
  return v;
}

/** The loaded knowledge base and engine, or `null` while loading or after a failure (for optional uses such as <Term>). */
export function useLoadedOptional(): Loaded | null {
  const v = useContext(Ctx);
  return v !== null && v.state.status === "ready" ? v.state.loaded : null;
}

/** For screens inside <NeedsKnowledge>: the knowledge base and engine, ready by construction. */
export function useLoaded(): Loaded {
  const loaded = useLoadedOptional();
  if (loaded === null) throw new Error("useLoaded must be used inside <NeedsKnowledge>");
  return loaded;
}

/** Renders its children only when the knowledge base and engine are ready; otherwise a loading skeleton or the failure state with a retry. */
export function NeedsKnowledge({ children }: { children: ReactNode }): ReactNode {
  const { state, retry } = useKnowledge();
  const { t } = useI18n();
  if (state.status === "ready") return children;
  if (state.status === "loading") {
    return (
      <div role="status" aria-busy="true">
        <span className="visually-hidden">{t.t("common.loading")}</span>
        <Skeleton width="60%" height="2rem" /><br /><Skeleton /><br /><Skeleton /><br /><Skeleton width="80%" />
      </div>
    );
  }
  return (
    <>
      <Notice kind="caution" kindLabel={t.t("common.notice.caution")} title={t.t("errors.kb.title")}>
        <p>{state.offline ? t.t("errors.kb.offline") : null} {t.t("errors.kb.body")}</p>
        {IS_DEV_PROFILE ? <p><code>{state.code}</code></p> : null}
      </Notice>
      <p><Button variant="primary" onClick={retry}>{t.t("errors.kb.retry")}</Button></p>
    </>
  );
}

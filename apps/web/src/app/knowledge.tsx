// Lazy loading of the knowledge base and the engine (tech spec §8, UX spec S19). Both are fetched after the first paint, in their own chunks, so the
// landing page and the first screens never wait for them; screens that need them sit inside <NeedsKnowledge>. A failure is a state with a retry,
// never a partial result.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type * as EngineModule from "@tcm/engine";
import type { KbErrorCode, KnowledgeBase } from "@tcm/kb";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { IS_DEV_PROFILE } from "./profile.ts";
import { Button, Notice, Skeleton } from "../ui/index.ts";

export type Engine = typeof EngineModule;
export interface Loaded { readonly kb: KnowledgeBase; readonly engine: Engine }
export type KnowledgeState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly loaded: Loaded }
  | { readonly status: "error"; readonly code: KbErrorCode | "unknown"; readonly offline: boolean };

export type Loader = () => Promise<Loaded>;

export const defaultLoader: Loader = async () => {
  const [{ loadKnowledgeBase }, engine] = await Promise.all([import("@tcm/kb"), import("@tcm/engine")]);
  const kb = await loadKnowledgeBase({ baseUrl: `${import.meta.env.BASE_URL}kb` });
  return { kb, engine };
};

interface Value { readonly state: KnowledgeState; readonly retry: () => void }
const Ctx = createContext<Value | null>(null);

const isOffline = (): boolean => typeof navigator !== "undefined" && navigator.onLine === false;
const failure = (e: unknown): KnowledgeState => ({ status: "error", code: typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string" ? ((e as { code: KbErrorCode }).code) : "unknown", offline: isOffline() });

/** One fetch per (loader, attempt), even when StrictMode runs the effect twice. */
const inflight = new WeakMap<Loader, Map<number, Promise<Loaded>>>();
function loadOnce(load: Loader, attempt: number): Promise<Loaded> {
  let attempts = inflight.get(load);
  if (attempts === undefined) { attempts = new Map(); inflight.set(load, attempts); }
  let p = attempts.get(attempt);
  if (p === undefined) { p = load(); attempts.set(attempt, p); }
  return p;
}

export function KnowledgeProvider({ load = defaultLoader, children }: { load?: Loader; children: ReactNode }): ReactNode {
  const [state, setState] = useState<KnowledgeState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadOnce(load, attempt).then((loaded) => { if (!cancelled) setState({ status: "ready", loaded }); }, (e: unknown) => { if (!cancelled) setState(failure(e)); });
    return () => { cancelled = true; };
  }, [attempt, load]);
  const retry = useCallback(() => { setState({ status: "loading" }); setAttempt((a) => a + 1); }, []);
  // coming back online after a failure: try again without making the user find the button
  useEffect(() => {
    if (state.status !== "error") return;
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [state.status, retry]);
  const value = useMemo<Value>(() => ({ state, retry }), [state, retry]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
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

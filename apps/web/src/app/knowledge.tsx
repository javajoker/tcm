// Lazy loading of the knowledge base and the engine (tech spec §8, UX spec S19). Both are fetched after the first paint, in their own chunks, so the
// landing page and the first screens never wait for them; screens that need them sit inside <NeedsKnowledge>. A failure is a state with a retry,
// never a partial result.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type * as EngineModule from "@tcm/engine";
import type { KbErrorCode, KnowledgeBase, Role } from "@tcm/kb";
import type { Script } from "@tcm/i18n";
import { DisplayContext, identity } from "../i18n/display.ts";
import { useI18n } from "../i18n/I18nProvider.tsx";
import { IS_DEV_PROFILE } from "./profile.ts";
import { Button, Notice, Skeleton } from "../ui/index.ts";

export type Engine = typeof EngineModule;
export interface Loaded { readonly kb: KnowledgeBase; readonly engine: Engine }
/** For a learner or a practitioner (PM-53): `active` when the knowledge base is theirs, `unavailable` when this build serves no role or the reference could not come — the general one is used then. */
export type RoleState = "none" | "active" | "unavailable";
export type KnowledgeState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly loaded: Loaded; readonly role: RoleState }
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

/** The knowledge base of a role: the reference merged in (fetched once), or — where it cannot be had — the general one, said so. */
async function withRole(loaded: Loaded, role: Role | null): Promise<{ readonly loaded: Loaded; readonly role: RoleState }> {
  if (role === null) return { loaded, role: "none" };
  if (!loaded.kb.roles.includes(role)) return { loaded, role: "unavailable" };
  try {
    return { loaded: { ...loaded, kb: await loaded.kb.forRole(role) }, role: "active" };
  } catch {
    return { loaded, role: "unavailable" };
  }
}

export function KnowledgeProvider({ load = defaultLoader, script = "Hant", role = null, children }: {
  load?: Loader;
  /** The script of Chinese text in the page language; a change loads the knowledge base again with the other display list. */
  script?: Script;
  /** The reading role (PM-53): a learner or a practitioner reads with the reference for their role merged in; a change makes the knowledge base again (the general one is kept). */
  role?: Role | null;
  children: ReactNode;
}): ReactNode {
  // what was loaded or what failed, and for which script and role: a state for another than the page's is "loading" (derived, so no state is set from an effect before the fetch settles)
  const [settled, setSettled] = useState<{ readonly state: KnowledgeState; readonly script: Script; readonly attempt: number; readonly role: Role | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const state: KnowledgeState = settled !== null && settled.script === script && settled.attempt === attempt && settled.role === role ? settled.state : LOADING;
  useEffect(() => {
    let cancelled = false;
    loadOnce(load, attempt, script).then((loaded) => withRole(loaded, role)).then(
      (r) => { if (!cancelled) setSettled({ state: { status: "ready", loaded: r.loaded, role: r.role }, script, attempt, role }); },
      (e: unknown) => { if (!cancelled) setSettled({ state: failure(e), script, attempt, role }); },
    );
    return () => { cancelled = true; };
  }, [attempt, load, script, role]);
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

/** Whether the knowledge base is a learner's or a practitioner's (PM-53); `none` while it loads. */
export function useRoleState(): RoleState {
  const v = useContext(Ctx);
  return v !== null && v.state.status === "ready" ? v.state.role : "none";
}

/**
 * The knowledge base a saved result was made with (PM-53): a result is shown as it was made, so one made for a learner or a practitioner is shown with the reference of that role
 * even where the session is a general reader's — the attestation was given when it was made. `null` while that comes. A role's knowledge base shows a general reader's result as well
 * (it holds everything the general one does).
 */
export function useKnowledgeOf(role: Role | null | undefined): KnowledgeBase | null {
  const { kb } = useLoaded();
  const want = role ?? null;
  const needs = want !== null && kb.role === null && kb.roles.includes(want);
  const [other, setOther] = useState<{ readonly base: KnowledgeBase; readonly kb: KnowledgeBase } | null>(null);
  useEffect(() => {
    if (!needs || want === null) return;
    let cancelled = false;
    kb.forRole(want).then((k) => { if (!cancelled) setOther({ base: kb, kb: k }); }, () => { if (!cancelled) setOther({ base: kb, kb }); });
    return () => { cancelled = true; };
  }, [kb, want, needs]);
  if (!needs) return kb;
  return other !== null && other.base === kb ? other.kb : null;
}

/**
 * The screens of a saved result, with the knowledge base the result was made with (PM-53; `useKnowledgeOf`): inside it every `useLoaded()` gives that one. Shows the loading
 * state while a role's reference comes. Use it inside <NeedsKnowledge>.
 */
export function KnowledgeOf({ role, children }: { role: Role | null | undefined; children: ReactNode }): ReactNode {
  const outer = useContext(Ctx);
  const { t } = useI18n();
  const loaded = useLoaded();
  const kb = useKnowledgeOf(role);
  const value = useMemo<Value | null>(() => (kb === null || kb === loaded.kb || outer === null ? null : { state: { status: "ready", loaded: { ...loaded, kb }, role: "active" }, retry: outer.retry }), [kb, loaded, outer]);
  if (kb === null) return <div role="status" aria-busy="true"><span className="visually-hidden">{t.t("common.loading")}</span><Skeleton width="60%" height="2rem" /><br /><Skeleton /></div>;
  if (value === null) return children;
  return <Ctx.Provider value={value}><DisplayContext.Provider value={kb.zh}>{children}</DisplayContext.Provider></Ctx.Provider>;
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

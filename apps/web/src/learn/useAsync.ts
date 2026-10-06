import { useEffect, useRef, useState } from "react";

export type Async<T> = { readonly status: "loading" } | { readonly status: "ready"; readonly value: T } | { readonly status: "error" };
const LOADING = { status: "loading" } as const;
const FAILED = { status: "error" } as const;

/**
 * A value that comes from a promise: loading, ready or failed, with a way to try again. `source` names what is loaded; another source starts loading again. The state is derived from what
 * settled and for which source and attempt, so nothing is set from an effect before the fetch settles (the same device as the knowledge provider's). The loader may be a new closure on every
 * render — only the source and the attempt decide when it runs, so a loader can never make the effect run again by being re-created.
 */
export function useAsync<T>(source: unknown, load: () => Promise<T>): { readonly state: Async<T>; readonly retry: () => void } {
  const [settled, setSettled] = useState<{ readonly source: unknown; readonly attempt: number; readonly state: Async<T> } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const state: Async<T> = settled !== null && settled.source === source && settled.attempt === attempt ? settled.state : LOADING;
  const latest = useRef(load);
  useEffect(() => { latest.current = load; });
  useEffect(() => {
    let cancelled = false;
    latest.current().then((value) => { if (!cancelled) setSettled({ source, attempt, state: { status: "ready", value } }); }, () => { if (!cancelled) setSettled({ source, attempt, state: FAILED }); });
    return () => { cancelled = true; };
  }, [source, attempt]);
  return { state, retry: () => { setAttempt((a) => a + 1); } };
}

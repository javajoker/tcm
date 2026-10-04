import { useEffect } from "react";
import { useLocation } from "wouter";
import type { Draft } from "../storage/types.ts";
import { DISCLAIMER_VERSION } from "./disclaimer.ts";
import { useApp } from "./store.tsx";

/**
 * The draft for a flow screen. Waits until the stored draft has been read, and makes sure one exists: a person who opens a flow address directly
 * (a bookmark, a reload) either continues the stored draft, or — having acknowledged the current disclaimer — gets a fresh one, or is sent to the
 * Landing page to acknowledge. Also records `route` as the draft's position so Resume returns here.
 */
export function useDraft(route: string, opts: { autoStart?: boolean } = {}): Draft | null {
  const autoStart = opts.autoStart ?? true;
  const draft = useApp((s) => s.draft);
  const loaded = useApp((s) => s.draftLoaded);
  const acknowledged = useApp((s) => s.prefs.disclaimerAck?.version === DISCLAIMER_VERSION);
  const startDraft = useApp((s) => s.startDraft);
  const updateDraft = useApp((s) => s.updateDraft);
  const [, navigate] = useLocation();
  const position = draft?.position.route;
  useEffect(() => {
    if (!loaded) return;
    if (draft === null) {
      if (!autoStart) return;                // a finished assessment deleted its draft on purpose
      if (acknowledged) startDraft(); else navigate("/", { replace: true });
      return;
    }
    if (position !== route) updateDraft((d) => ({ ...d, position: { route } }));
  }, [loaded, draft, acknowledged, autoStart, position, route, startDraft, updateDraft, navigate]);
  return loaded ? draft : null;
}

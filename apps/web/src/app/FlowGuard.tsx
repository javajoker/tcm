import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useLoaded } from "./knowledge.tsx";
import type { Draft } from "../storage/types.ts";
import { missingItems } from "../screens/profile/model.ts";
import { pendingNotices, unanswered } from "../screens/screening/model.ts";

/** The stages after the inquiry need a complete profile and a finished screening with its blocking notices acknowledged; otherwise back to where it is missing. Render inside <NeedsKnowledge>. */
export function FlowGuard({ draft, children, allowPending = false }: { draft: Draft; children: ReactNode; /** The screen raises and shows its own blocking notice (the pulse): unacknowledged notices must not send the person away. */ allowPending?: boolean }): ReactNode {
  const { kb } = useLoaded();
  const [, navigate] = useLocation();
  const target = missingItems(draft).length > 0 ? "/start" : unanswered(kb, draft).length > 0 || (!allowPending && pendingNotices(kb, draft).length > 0) ? "/screen" : null;
  useEffect(() => { if (target !== null) navigate(target, { replace: true }); }, [target, navigate]);
  return target === null ? children : null;
}

import { useEffect, type ReactNode } from "react";
import { useApp } from "../app/store.tsx";
import { DEFAULT_LOCK_IDLE_MINUTES } from "../storage/types.ts";

const ACTIVITY = ["pointerdown", "keydown", "touchstart", "wheel", "focusin"] as const;

/**
 * Idle auto-lock (design §5.4): while the history is unlocked, ten minutes (or what the person chose) without a touch, a key or a click lock it. The check is against the clock, not a count of ticks, so a laptop
 * that slept — or a tab that was hidden and had its timers slowed — locks as soon as it is looked at again. It renders nothing.
 */
export function IdleLock(): ReactNode {
  const unlocked = useApp((s) => s.lock === "unlocked");
  const minutes = useApp((s) => s.prefs.lockIdleMinutes ?? DEFAULT_LOCK_IDLE_MINUTES);
  const lockNow = useApp((s) => s.lockNow);
  useEffect(() => {
    if (!unlocked) return;
    const limit = minutes * 60_000;
    let last = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = (): void => {
      const idle = Date.now() - last;
      if (idle >= limit) { void lockNow(); return; }
      timer = setTimeout(check, limit - idle);
    };
    const touch = (): void => { last = Date.now(); };
    const visible = (): void => { if (document.visibilityState === "visible") { clearTimeout(timer); check(); } };
    for (const e of ACTIVITY) window.addEventListener(e, touch, { passive: true, capture: true });
    document.addEventListener("visibilitychange", visible);
    timer = setTimeout(check, limit);
    return () => { clearTimeout(timer); for (const e of ACTIVITY) window.removeEventListener(e, touch, { capture: true }); document.removeEventListener("visibilitychange", visible); };
  }, [unlocked, minutes, lockNow]);
  return null;
}

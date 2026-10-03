import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * Moves focus to the new screen's <h1> when the route changes (UX spec §8), so screen-reader and keyboard users land at the top of the new screen.
 * Runs only when the path *within* the language scope changes: switching language keeps the path, so focus stays on the toggle. Not on first load.
 */
export function RouteFocus(): null {
  const [path] = useLocation();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (previous.current !== null && previous.current !== path) {
      const target = document.querySelector<HTMLElement>("main h1") ?? document.getElementById("main");
      if (target) { target.tabIndex = -1; target.focus(); }
    }
    previous.current = path;
  }, [path]);
  return null;
}

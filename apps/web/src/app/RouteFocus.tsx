import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * Moves focus to the new screen's <h1> when the route changes (UX spec §8), so screen-reader and keyboard users land at the top of the new screen.
 * Runs only when the path *within* the language scope changes: switching language keeps the path, so focus stays on the toggle. Not on first load.
 *
 * A screen whose content comes after a fetch (a herb page, a result that waits for the knowledge base) has no heading yet when the route changes: focus goes to the page's container
 * meanwhile, and moves to the heading when it arrives — unless the person has already moved on (focus is no longer on the container), and never later than fifteen seconds after.
 */
export function RouteFocus(): null {
  const [path] = useLocation();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    let stop: (() => void) | undefined;
    if (previous.current !== null && previous.current !== path) {
      const heading = (): HTMLElement | null => document.querySelector<HTMLElement>("main h1");
      const move = (el: HTMLElement): void => { el.tabIndex = -1; el.focus(); };
      const now = heading();
      if (now !== null) move(now);
      else {
        const main = document.getElementById("main");
        if (main !== null) move(main);
        const observer = new MutationObserver(() => {
          const active = document.activeElement;
          if (active !== main && active !== document.body) { observer.disconnect(); return; }
          const late = heading();
          if (late !== null) { observer.disconnect(); move(late); }
        });
        observer.observe(main ?? document.body, { childList: true, subtree: true });
        const timer = setTimeout(() => { observer.disconnect(); }, 15_000);
        stop = () => { observer.disconnect(); clearTimeout(timer); };
      }
    }
    previous.current = path;
    return stop;
  }, [path]);
  return null;
}

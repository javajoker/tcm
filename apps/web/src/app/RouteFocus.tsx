import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

/**
 * Moves focus to the new screen's <h1> — or to the place its address names with a `#` — when the route changes (UX spec §8), so screen-reader and keyboard users land at the top of the new screen.
 * Runs only when the path *within* the language scope changes: switching language keeps the path, so focus stays on the toggle. Not on first load.
 *
 * A screen whose content comes after a fetch (a herb page, a result that waits for the knowledge base) has no heading yet when the route changes: focus goes to the page's container
 * meanwhile, and moves to the heading when it arrives — unless the person has already moved on (focus is no longer on the container), and never later than fifteen seconds after.
 */
/** Is the element in the page and not hidden by itself or by anything around it? */
function shown(el: HTMLElement): boolean {
  for (let n: HTMLElement | null = el; n !== null; n = n.parentElement) if (window.getComputedStyle(n).display === "none") return false;
  return el.isConnected;
}

export function RouteFocus(): null {
  const [path] = useLocation();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    let stop: (() => void) | undefined;
    if (previous.current !== null && previous.current !== path) {
      // a link may name a place on the page (`/settings#settings-seasons`): focus goes there when it is shown, to the heading otherwise. What is not shown does not count: while a screen's code loads, React keeps
      // the old screen in the page hidden (`display: none`), and focus given to its heading would go nowhere.
      const heading = (): HTMLElement | null => {
        let id = "";
        try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { /* a malformed hash names nothing */ }
        const named = id !== "" ? document.getElementById(id) : null;
        if (named !== null && shown(named)) return named;
        return [...document.querySelectorAll<HTMLElement>("main h1")].find(shown) ?? null;
      };
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

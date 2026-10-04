import { useEffect } from "react";
import { useApp } from "./store.tsx";

/** Applies the stored theme and text size to the document: `data-theme` (absent = follow the system) and the `--text-scale` token. */
export function PrefsEffects(): null {
  const theme = useApp((s) => s.prefs.theme);
  const textScale = useApp((s) => s.prefs.textScale);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", theme);
  }, [theme]);
  useEffect(() => { document.documentElement.style.setProperty("--text-scale", String(textScale)); }, [textScale]);
  return null;
}

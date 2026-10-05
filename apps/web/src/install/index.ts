// The page's one connection to the browser's install offer. Created when the page starts, because the browser fires its event early. A development build never installs (there is no offline copy).
import { createInstall, type Install, type InstallEvent } from "./install.ts";

const media = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(display-mode: standalone)") : null;

export const install: Install = createInstall({
  target: typeof window === "undefined" ? { addEventListener: () => undefined } : (window as unknown as { addEventListener(type: string, l: (e: InstallEvent) => void): void }),
  standalone: {
    matches: () => (media?.matches ?? false) || (typeof navigator !== "undefined" && (navigator as unknown as { standalone?: boolean }).standalone === true),
    onChange: (listener) => { media?.addEventListener("change", listener); },
  },
});

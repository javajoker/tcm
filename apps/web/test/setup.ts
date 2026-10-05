import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// The device's time zone preselects the region of the emergency numbers (docs/post-mvp/design/tap-tempo-and-regions.md §2): tests run as a device in Taiwan unless they say otherwise.
process.env.TZ = "Asia/Taipei";

// the default 1 s for findBy*/waitFor is too tight when several jsdom + axe suites run in parallel
configure({ asyncUtilTimeout: 4000 });

// compile-time constants (vite.config.ts `define` also applies under Vitest; this keeps the type of the global explicit)
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// jsdom (v30) has no <dialog>.showModal/close: model the observable parts the components rely on (open attribute, cancel + close events).
if (typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal !== "function") {
  const openers = new WeakMap<HTMLDialogElement, Element | null>();
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void { openers.set(this, document.activeElement); this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement): void {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    (openers.get(this) as HTMLElement | null | undefined)?.focus?.();       // like a browser: focus goes back to the element that opened the dialog
    this.dispatchEvent(new Event("close"));
  };
}

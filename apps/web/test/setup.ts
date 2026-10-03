import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// compile-time constants (vite.config.ts `define` also applies under Vitest; this keeps the type of the global explicit)
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// jsdom (v30) has no <dialog>.showModal/close: model the observable parts the components rely on (open attribute, cancel + close events).
if (typeof HTMLDialogElement !== "undefined" && typeof HTMLDialogElement.prototype.showModal !== "function") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement): void {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

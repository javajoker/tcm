import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// compile-time constants (vite.config.ts `define` also applies under Vitest; this keeps the type of the global explicit)
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

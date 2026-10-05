// The shape of what a build tells its service worker. Types only, and no library types, so that the build scripts (scripts/sw-build.ts, check-release) can share it with the worker
// (core.ts) without taking the page's DOM types along.

export type Script = "Hant" | "Hans";

/** What the build knows about itself, generated from the files it just wrote (scripts/sw-build.ts) and written into `sw.js`. */
export interface Build {
  /** A hash of every file of the build: a different build is a different id, so a different cache. */
  readonly id: string;
  /** What the page needs to start and run, as site-root paths (scripts including the lazy chunks, styles, icons, the manifest, the notice). Installed together or not at all. */
  readonly shell: readonly string[];
  /** The knowledge base: files every language needs (manifest, chunks, city list), and those only Simplified needs (display lists, the Simplified catalogue). Fetched on request of the page. */
  readonly knowledge: { readonly common: readonly string[]; readonly hans: readonly string[] };
  /** The first path segments the host maps to the app (`LANGUAGE_SEGMENTS`). */
  readonly languages: readonly string[];
}

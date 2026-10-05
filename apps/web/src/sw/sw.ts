// The service worker (docs/post-mvp/design/offline-and-install.md). Only the wiring: the build's script (scripts/sw-build.ts) puts the build's facts in front of this code as
// `self.__TCM_BUILD__`, and every decision is made by the pure functions of core.ts. No dependency, no library.
import { activate, answer, cacheKnowledge, decide, install, SCRIPTS, type Build, type Env, type Script } from "./core.ts";

/** The few parts of the worker scope this file uses (the project's type library is the page's, not the worker's). */
interface Scope {
  readonly __TCM_BUILD__: Build;
  readonly location: { readonly origin: string };
  readonly caches: Env["caches"];
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  fetch: typeof fetch;
  addEventListener(type: "install" | "activate", listener: (event: Wait) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEvt) => void): void;
  addEventListener(type: "message", listener: (event: Msg) => void): void;
}
interface Wait { waitUntil(promise: Promise<unknown>): void }
interface FetchEvt { readonly request: Request; respondWith(response: Promise<Response>): void }
interface Msg extends Wait { readonly data: unknown; readonly source: { postMessage(message: unknown): void } | null }

const scope = self as unknown as Scope;
const build = scope.__TCM_BUILD__;
const env = (): Env => ({ caches: scope.caches, fetch: (...args) => scope.fetch(...args), origin: scope.location.origin });

// A new version waits (no `skipWaiting` of its own, §3.3 rule 1): the person chooses, or the next visit uses it.
scope.addEventListener("install", (event) => event.waitUntil(install(build, env())));
scope.addEventListener("activate", (event) => event.waitUntil(activate(build, env()).then(() => scope.clients.claim())));

scope.addEventListener("fetch", (event) => {
  const { request } = event;
  const decision = decide({ method: request.method, mode: request.mode, pathname: new URL(request.url).pathname, sameOrigin: new URL(request.url).origin === scope.location.origin, hasBody: (request.body ?? null) !== null }, build);       // (Firefox has no `body` on a request: undefined is no body)
  if (decision !== null) event.respondWith(answer(decision, request, build, env()));
});

scope.addEventListener("message", (event) => {
  const data = event.data as { type?: unknown; script?: unknown } | null;
  if (data?.type === "SKIP_WAITING") { event.waitUntil(scope.skipWaiting()); return; }
  if (data?.type === "CACHE_KB" && SCRIPTS.includes(data.script as Script)) {
    const script = data.script as Script;
    event.waitUntil(cacheKnowledge(build, env(), script).then((ok) => event.source?.postMessage({ type: "KB_READY", script, ok, build: build.id })));
  }
});

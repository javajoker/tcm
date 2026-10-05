// The page's one connection to the service worker, created where the browser's own objects are available. A release build in a browser that has service workers registers it; anything else is
// `unsupported` and does nothing. The development build never registers one (its `sw.js` is the kill worker).
import { browserEnvironment } from "../storage/browser.ts";
import { afterLoadAndIdle, createOffline, type Container, type Offline } from "./worker.ts";

const browser = browserEnvironment();
const container = typeof navigator !== "undefined" && "serviceWorker" in navigator ? (navigator.serviceWorker as unknown as Container) : undefined;
const reload = (): void => { window.location.reload(); };

export const offline: Offline = createOffline({
  container: __APP_PROFILE__ === "release" ? container : undefined,
  caches: __APP_PROFILE__ === "release" ? browser.caches ?? undefined : undefined,
  whenIdle: afterLoadAndIdle,
  reload,
});


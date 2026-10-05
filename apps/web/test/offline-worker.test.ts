// The page's side of the service worker: registration once, the knowledge files asked for per script, and the status in a word (docs/post-mvp/design/offline-and-install.md §3.5).
import { describe, expect, it } from "vitest";
import { createOffline, type CacheStorageLike, type Container, type OfflineEnv, type OfflineStatus, type Registration, type Worker } from "../src/offline/worker.ts";

class FakeWorker implements Worker {
  state: string;
  readonly posted: unknown[] = [];
  private listeners: (() => void)[] = [];
  constructor(state = "activated") { this.state = state; }
  postMessage(message: unknown): void { this.posted.push(message); }
  addEventListener(_t: "statechange", l: () => void): void { this.listeners.push(l); }
  become(state: string): void { this.state = state; for (const l of this.listeners) l(); }
}
class FakeRegistration implements Registration {
  installing: Worker | null = null;
  waiting: Worker | null = null;
  active: Worker | null = null;
  private onUpdate: (() => void)[] = [];
  addEventListener(_t: "updatefound", l: () => void): void { this.onUpdate.push(l); }
  found(w: FakeWorker): void { this.installing = w; for (const l of this.onUpdate) l(); }
}
class FakeContainer implements Container {
  controller: unknown = null;
  readonly registered: { url: string; options: unknown }[] = [];
  unregistered = 0;
  private onMessage: ((e: { data: unknown }) => void)[] = [];
  private onControllerChange: (() => void)[] = [];
  readonly registration: FakeRegistration;
  private readonly failWith: Error | undefined;
  constructor(registration: FakeRegistration, failWith?: Error) { this.registration = registration; this.failWith = failWith; }
  async register(url: string, options: { scope: string; updateViaCache: "none" }): Promise<Registration> {
    this.registered.push({ url, options });
    if (this.failWith) throw this.failWith;
    return this.registration;
  }
  async getRegistrations(): Promise<{ unregister(): Promise<boolean> }[]> { return [{ unregister: async () => { this.unregistered++; return true; } }]; }
  addEventListener(type: "message", l: (e: { data: unknown }) => void): void;
  addEventListener(type: "controllerchange", l: () => void): void;
  addEventListener(type: string, l: ((e: { data: unknown }) => void) | (() => void)): void { if (type === "message") this.onMessage.push(l as (e: { data: unknown }) => void); else this.onControllerChange.push(l as () => void); }
  send(data: unknown): void { for (const l of this.onMessage) l({ data }); }
  controllerChanged(): void { for (const l of this.onControllerChange) l(); }
}
class FakeCaches implements CacheStorageLike {
  names: string[];
  constructor(names: string[]) { this.names = names; }
  async keys(): Promise<string[]> { return [...this.names]; }
  async delete(name: string): Promise<boolean> { this.names = this.names.filter((n) => n !== name); return true; }
}
const idle = (): Promise<void> => Promise.resolve();
/** An environment around a container: the page reloads are counted. */
function environment(container: Container | undefined, caches: CacheStorageLike | undefined = undefined, whenIdle: () => Promise<void> = idle): OfflineEnv & { reloads: number } {
  const env = { container, caches, whenIdle, reloads: 0, reload: () => { env.reloads++; } };
  return env;
}
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

function setup(over: { active?: FakeWorker | null; container?: FakeContainer } = {}) {
  const reg = new FakeRegistration();
  reg.active = over.active === undefined ? new FakeWorker() : over.active;
  const container = over.container ?? new FakeContainer(reg);
  const env = environment(container, new FakeCaches(["tcm-app-old", "tcm-app-new", "other-app"]));
  const offline = createOffline(env);
  const seen: OfflineStatus[] = [];
  offline.subscribe(() => seen.push(offline.getStatus()));
  return { reg, container, offline, seen, env, active: reg.active as FakeWorker | null };
}

describe("registration", () => {
  it("registers /sw.js at the root with the HTTP cache off, once however many times the language changes", async () => {
    const { container, offline } = setup();
    await offline.ensure("Hant");
    await offline.ensure("Hans");
    await offline.ensure("Hant");
    expect(container.registered).toEqual([{ url: "/sw.js", options: { scope: "/", updateViaCache: "none" } }]);
  });

  it("waits until the page has loaded and the browser is idle", async () => {
    const reg = new FakeRegistration();
    reg.active = new FakeWorker();
    const container = new FakeContainer(reg);
    let release!: () => void;
    const offline = createOffline(environment(container, undefined, () => new Promise<void>((r) => { release = r; })));
    const pending = offline.ensure("Hant");
    await flush();
    expect(container.registered).toEqual([]);
    release();
    await pending;
    expect(container.registered).toHaveLength(1);
  });

  it("without service workers it says so and does nothing", async () => {
    const offline = createOffline(environment(undefined));
    expect(offline.getStatus()).toBe("unsupported");
    await offline.ensure("Hant");
    expect(offline.getStatus()).toBe("unsupported");
  });

  it("a registration the browser refuses is a failure, never an exception", async () => {
    const reg = new FakeRegistration();
    const container = new FakeContainer(reg, new Error("blocked"));
    const offline = createOffline(environment(container));
    await expect(offline.ensure("Hant")).resolves.toBeUndefined();
    expect(offline.getStatus()).toBe("failed");
  });
});

describe("the knowledge files of the script in use", () => {
  it("asks the active worker for them and is ready when it says they are cached", async () => {
    const { container, offline, active, seen } = setup();
    expect(offline.getStatus()).toBe("preparing");
    await offline.ensure("Hant");
    expect(active!.posted).toEqual([{ type: "CACHE_KB", script: "Hant" }]);
    expect(offline.getStatus()).toBe("preparing");
    container.send({ type: "KB_READY", script: "Hant", ok: true, build: "b1" });
    expect(offline.getStatus()).toBe("ready");
    expect(seen).toEqual(["ready"]);
  });

  it("is not ready for a script it has not been told about: switching to Simplified asks again", async () => {
    const { container, offline, active } = setup();
    await offline.ensure("Hant");
    container.send({ type: "KB_READY", script: "Hant", ok: true });
    await offline.ensure("Hans");
    expect(offline.getStatus()).toBe("preparing");
    expect(active!.posted).toEqual([{ type: "CACHE_KB", script: "Hant" }, { type: "CACHE_KB", script: "Hans" }]);
    container.send({ type: "KB_READY", script: "Hans", ok: true });
    expect(offline.getStatus()).toBe("ready");
    await offline.ensure("Hant");                              // back again: still cached, nothing to ask
    expect(offline.getStatus()).toBe("ready");
    expect(active!.posted).toHaveLength(2);
  });

  it("a worker that could not cache them is a failure, and the next ask tries again", async () => {
    const { container, offline, active } = setup();
    await offline.ensure("Hant");
    container.send({ type: "KB_READY", script: "Hant", ok: false });
    expect(offline.getStatus()).toBe("failed");
    await offline.ensure("Hant");
    expect(active!.posted).toHaveLength(2);
    container.send({ type: "KB_READY", script: "Hant", ok: true });
    expect(offline.getStatus()).toBe("ready");
  });

  it("on the first visit it waits for the worker to become active, and gives up when the install fails", async () => {
    const first = setup({ active: null });
    const w = new FakeWorker("installing");
    first.reg.installing = w;
    const pending = first.offline.ensure("Hant");
    await flush();
    expect(w.posted).toEqual([]);
    first.reg.active = w;
    w.become("activated");
    await pending;
    expect(w.posted).toEqual([{ type: "CACHE_KB", script: "Hant" }]);

    const second = setup({ active: null });
    const bad = new FakeWorker("installing");
    second.reg.installing = bad;
    const p2 = second.offline.ensure("Hant");
    await flush();
    bad.become("redundant");
    await p2;
    expect(second.offline.getStatus()).toBe("failed");
  });

  it("ignores messages that are not about the knowledge files", async () => {
    const { container, offline } = setup();
    await offline.ensure("Hant");
    for (const data of [null, "x", { type: "OTHER" }, { type: "KB_READY", script: "xx", ok: true }, { type: "KB_READY" }]) container.send(data);
    expect(offline.getStatus()).toBe("preparing");
  });
});

describe("a newer build", () => {
  it("one that installs while the page is controlled by another is 'update-ready'", async () => {
    const { container, reg, offline } = setup();
    container.controller = {};
    await offline.ensure("Hant");
    container.send({ type: "KB_READY", script: "Hant", ok: true });
    expect(offline.getStatus()).toBe("ready");
    const next = new FakeWorker("installing");
    reg.found(next);
    next.become("installed");
    expect(offline.getStatus()).toBe("update-ready");
  });

  it("the first install is not an update: there is no controller yet", async () => {
    const { reg, offline } = setup();
    await offline.ensure("Hant");
    const w = new FakeWorker("installing");
    reg.found(w);
    w.become("installed");
    expect(offline.getStatus()).toBe("preparing");
  });

  it("a build that was already waiting when the page started is noticed", async () => {
    const reg = new FakeRegistration();
    reg.active = new FakeWorker();
    reg.waiting = new FakeWorker("installed");
    const container = new FakeContainer(reg);
    container.controller = {};
    const offline = createOffline(environment(container));
    await offline.ensure("Hant");
    expect(offline.getStatus()).toBe("update-ready");
  });
});

describe("the scripts that can be used without a connection", () => {
  it("are the ones the worker says it holds, even before the person asks for them", async () => {
    const { container, offline } = setup();
    await offline.ensure("Hant");
    expect(offline.getView().cachedScripts).toEqual([]);
    container.send({ type: "KB_READY", script: "Hant", ok: true, scripts: ["Hant", "Hans"] });
    expect(offline.getView().cachedScripts).toEqual(["Hans", "Hant"]);
    expect(offline.getStatus()).toBe("ready");
  });

  it("a view changes (and listeners hear it) only when something in it changed", async () => {
    const { container, offline, seen } = setup();
    await offline.ensure("Hant");
    const first = offline.getView();
    expect(offline.getView()).toBe(first);
    container.send({ type: "KB_READY", script: "Hant", ok: true, scripts: ["Hant"] });
    const second = offline.getView();
    expect(second).not.toBe(first);
    container.send({ type: "KB_READY", script: "Hant", ok: true, scripts: ["Hant"] });
    expect(offline.getView()).toBe(second);
    expect(seen).toEqual(["ready"]);
  });
});

describe("applying a newer build", () => {
  async function waitingBuild() {
    const o = setup();
    o.container.controller = {};
    await o.offline.ensure("Hant");
    o.container.send({ type: "KB_READY", script: "Hant", ok: true, scripts: ["Hant"] });
    const next = new FakeWorker("installing");
    o.reg.found(next);
    o.reg.waiting = next;
    next.become("installed");
    return { ...o, next };
  }

  it("asks the waiting worker to take over — and reloads once it has, not before", async () => {
    const { offline, container, env, next } = await waitingBuild();
    expect(offline.getStatus()).toBe("update-ready");
    await offline.applyUpdate();
    expect(next.posted).toEqual([{ type: "SKIP_WAITING" }]);
    expect(env.reloads).toBe(0);
    container.controllerChanged();
    expect(env.reloads).toBe(1);
    container.controllerChanged();
    expect(env.reloads).toBe(1);
  });

  it("nothing applies it by itself: a waiting build stays waiting, and nothing is posted or reloaded", async () => {
    const { next, env, offline } = await waitingBuild();
    await Promise.resolve();
    expect(next.posted).toEqual([]);
    expect(env.reloads).toBe(0);
    expect(offline.getStatus()).toBe("update-ready");
  });

  it("a build that takes over on its own (another tab closed) does not reload this page: it says a new version is ready", async () => {
    const o = setup();
    o.container.controller = {};
    await o.offline.ensure("Hant");
    o.container.send({ type: "KB_READY", script: "Hant", ok: true });
    expect(o.offline.getStatus()).toBe("ready");
    o.container.controllerChanged();
    expect(o.env.reloads).toBe(0);
    expect(o.offline.getStatus()).toBe("update-ready");
    await o.offline.applyUpdate();                       // nothing waits any more: the new build is already there, so this page only has to load it
    expect(o.env.reloads).toBe(1);
  });

  it("the first worker ever is not an update: taking control of a page that had none changes nothing", async () => {
    const o = setup();
    await o.offline.ensure("Hant");
    o.container.send({ type: "KB_READY", script: "Hant", ok: true });
    o.container.controllerChanged();
    expect(o.offline.getStatus()).toBe("ready");
    expect(o.env.reloads).toBe(0);
  });

  it("a page that was first taken over after it loaded (a first visit) treats the next change as an update", async () => {
    const o = setup();
    await o.offline.ensure("Hant");
    o.container.send({ type: "KB_READY", script: "Hant", ok: true });
    o.container.controllerChanged();                     // the first worker claims the page: not an update
    expect(o.offline.getStatus()).toBe("ready");
    o.container.controller = {};
    const next = new FakeWorker("installing");
    o.reg.found(next);
    o.reg.waiting = next;
    next.become("installed");
    expect(o.offline.getStatus()).toBe("update-ready");
    await o.offline.applyUpdate();
    o.container.controllerChanged();                     // the newer build takes over: now it reloads
    expect(o.env.reloads).toBe(1);
  });

  it("the notice can be dismissed for this visit; the status stays", async () => {
    const { offline, seen } = await waitingBuild();
    expect(offline.getView().updateDismissed).toBe(false);
    offline.dismissUpdate();
    expect(offline.getView()).toMatchObject({ status: "update-ready", updateDismissed: true });
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe("removing the offline copy", () => {
  it("unregisters the worker and deletes the caches of this application only", async () => {
    const o = setup();
    await o.offline.ensure("Hant");
    o.container.send({ type: "KB_READY", script: "Hant", ok: true, scripts: ["Hant"] });
    await o.offline.remove();
    expect(o.container.unregistered).toBe(1);
    expect(await (o.env.caches as FakeCaches).keys()).toEqual(["other-app"]);
    expect(o.offline.getView()).toEqual({ status: "removed", updateDismissed: false, cachedScripts: [] });
  });

  it("leaves it removed for the rest of the visit: a language change does not install it again", async () => {
    const o = setup();
    await o.offline.ensure("Hant");
    await o.offline.remove();
    await o.offline.ensure("Hans");
    expect(o.active!.posted).toEqual([{ type: "CACHE_KB", script: "Hant" }]);
    expect(o.offline.getStatus()).toBe("removed");
  });

  it("before anything was registered it still clears what is there, and does not register", async () => {
    const reg = new FakeRegistration();
    const container = new FakeContainer(reg);
    const env = environment(container, new FakeCaches(["tcm-app-a"]));
    const offline = createOffline(env);
    await offline.remove();
    await offline.ensure("Hant");
    expect(container.registered).toEqual([]);
    expect(await (env.caches as FakeCaches).keys()).toEqual([]);
  });

  it("without service workers there is nothing to remove", async () => {
    const offline = createOffline(environment(undefined, new FakeCaches(["tcm-app-a"])));
    await offline.remove();
    expect(offline.getStatus()).toBe("unsupported");
  });

  it("a browser that refuses to unregister still has its caches cleared", async () => {
    const reg = new FakeRegistration();
    const container = new FakeContainer(reg);
    container.getRegistrations = async () => { throw new Error("no"); };
    const env = environment(container, new FakeCaches(["tcm-app-a", "keep"]));
    const offline = createOffline(env);
    await offline.remove();
    expect(await (env.caches as FakeCaches).keys()).toEqual(["keep"]);
  });
});

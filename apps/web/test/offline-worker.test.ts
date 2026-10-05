// The page's side of the service worker: registration once, the knowledge files asked for per script, and the status in a word (docs/post-mvp/design/offline-and-install.md §3.5).
import { describe, expect, it } from "vitest";
import { createOffline, type Container, type OfflineStatus, type Registration, type Worker } from "../src/offline/worker.ts";

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
  private onMessage: ((e: { data: unknown }) => void)[] = [];
  readonly registration: FakeRegistration;
  private readonly failWith: Error | undefined;
  constructor(registration: FakeRegistration, failWith?: Error) { this.registration = registration; this.failWith = failWith; }
  async register(url: string, options: { scope: string; updateViaCache: "none" }): Promise<Registration> {
    this.registered.push({ url, options });
    if (this.failWith) throw this.failWith;
    return this.registration;
  }
  addEventListener(_t: "message", l: (e: { data: unknown }) => void): void { this.onMessage.push(l); }
  send(data: unknown): void { for (const l of this.onMessage) l({ data }); }
}
const idle = (): Promise<void> => Promise.resolve();
const flush = async (): Promise<void> => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

function setup(over: { active?: FakeWorker | null; container?: FakeContainer } = {}) {
  const reg = new FakeRegistration();
  reg.active = over.active === undefined ? new FakeWorker() : over.active;
  const container = over.container ?? new FakeContainer(reg);
  const offline = createOffline({ container, whenIdle: idle });
  const seen: OfflineStatus[] = [];
  offline.subscribe(() => seen.push(offline.getStatus()));
  return { reg, container, offline, seen, active: reg.active as FakeWorker | null };
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
    const offline = createOffline({ container, whenIdle: () => new Promise<void>((r) => { release = r; }) });
    const pending = offline.ensure("Hant");
    await flush();
    expect(container.registered).toEqual([]);
    release();
    await pending;
    expect(container.registered).toHaveLength(1);
  });

  it("without service workers it says so and does nothing", async () => {
    const offline = createOffline({ container: undefined, whenIdle: idle });
    expect(offline.getStatus()).toBe("unsupported");
    await offline.ensure("Hant");
    expect(offline.getStatus()).toBe("unsupported");
  });

  it("a registration the browser refuses is a failure, never an exception", async () => {
    const reg = new FakeRegistration();
    const container = new FakeContainer(reg, new Error("blocked"));
    const offline = createOffline({ container, whenIdle: idle });
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
    const offline = createOffline({ container, whenIdle: idle });
    await offline.ensure("Hant");
    expect(offline.getStatus()).toBe("update-ready");
  });
});

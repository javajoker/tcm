// Installing the app (docs/post-mvp/design/offline-and-install.md §3.6): the browser's own offer, kept until the person asks for it. Chromium-family browsers fire `beforeinstallprompt` when they
// would offer to install; the app holds the event and uses it only when the person presses *Install* in Settings — never a pop-up, never on a first visit. Everywhere else, and always, the
// card explains "Add to Home Screen" in words (no user-agent sniffing). No DOM and no globals here: the window's events and the display-mode query are passed in, so every path is tested with fakes.

/** What a browser gives when it offers to install (`BeforeInstallPromptEvent`, which TypeScript's DOM library does not have). */
export interface InstallEvent {
  preventDefault(): void;
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
}

export interface InstallState {
  /** The app is running in its own window (installed), so there is nothing to offer. */
  readonly installed: boolean;
  /** The browser has offered to install and the person has not used the offer yet. */
  readonly canPrompt: boolean;
}
export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

export interface InstallEnv {
  readonly target: {
    addEventListener(type: "beforeinstallprompt", listener: (event: InstallEvent) => void): void;
    addEventListener(type: "appinstalled", listener: () => void): void;
  };
  /** `(display-mode: standalone)`, and `navigator.standalone` of older iOS Safari. */
  readonly standalone: { matches(): boolean; onChange(listener: () => void): void };
}

export interface Install {
  getState(): InstallState;
  subscribe(listener: () => void): () => void;
  /** Show the browser's install dialog. `unavailable` when the browser has not offered (or the offer was used). */
  prompt(): Promise<InstallOutcome>;
}

export function createInstall(env: InstallEnv): Install {
  const listeners = new Set<() => void>();
  let deferred: InstallEvent | null = null;
  let installed = env.standalone.matches();
  let state: InstallState = { installed, canPrompt: false };
  const publish = (): void => {
    const next = { installed, canPrompt: deferred !== null && !installed };
    if (next.installed === state.installed && next.canPrompt === state.canPrompt) return;
    state = next;
    for (const l of [...listeners]) l();
  };
  env.target.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferred = event; publish(); });      // hold it back: the browser would show its own bar
  env.target.addEventListener("appinstalled", () => { installed = true; deferred = null; publish(); });
  env.standalone.onChange(() => { installed = env.standalone.matches(); publish(); });
  publish();

  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async prompt() {
      const event = deferred;
      if (event === null) return "unavailable";
      deferred = null;                                  // an offer can be used once
      publish();
      try {
        await event.prompt();
        const choice = await event.userChoice;
        return choice.outcome;
      } catch {
        return "unavailable";
      }
    },
  };
}

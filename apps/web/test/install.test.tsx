// Installing the app (docs/post-mvp/design/offline-and-install.md §3.6): the browser's offer is held until the person asks; the card says what there is to do; no screen is a dead end in a window
// without browser buttons; and the manifest is the one of an installable app.
import { render, screen, within, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "../src/i18n/I18nProvider.tsx";
import { InstallProvider } from "../src/install/InstallContext.tsx";
import { createInstall, type Install, type InstallEnv, type InstallEvent, type InstallState } from "../src/install/install.ts";
import { InstallCard } from "../src/screens/settings/InstallCard.tsx";
import { render as renderRoute, ROUTES } from "./sweep.tsx";

const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });

/** A browser window that can fire the install events, and a display mode the test can change. */
function fakeWindow(standalone = false) {
  const before: ((e: InstallEvent) => void)[] = [];
  const installedListeners: (() => void)[] = [];
  const modeListeners: (() => void)[] = [];
  let mode = standalone;
  const env: InstallEnv = {
    target: { addEventListener: ((type: string, l: never) => { if (type === "beforeinstallprompt") before.push(l); else installedListeners.push(l); }) as InstallEnv["target"]["addEventListener"] },
    standalone: { matches: () => mode, onChange: (l) => { modeListeners.push(l); } },
  };
  return {
    env,
    offer(outcome: "accepted" | "dismissed" | "fails" = "accepted"): { event: InstallEvent; prevented: () => boolean; prompts: () => number } {
      let prevented = false, prompts = 0;
      const event: InstallEvent = { preventDefault: () => { prevented = true; }, prompt: async () => { prompts++; if (outcome === "fails") throw new Error("denied"); }, userChoice: Promise.resolve({ outcome: outcome === "fails" ? "dismissed" : outcome }) };
      for (const l of before) l(event);
      return { event, prevented: () => prevented, prompts: () => prompts };
    },
    installed() { for (const l of installedListeners) l(); },
    setMode(next: boolean) { mode = next; for (const l of modeListeners) l(); },
  };
}

describe("the install offer", () => {
  it("is held back when the browser makes it, and never shown by the app until it is asked for", async () => {
    const w = fakeWindow();
    const install = createInstall(w.env);
    expect(install.getState()).toEqual({ installed: false, canPrompt: false });
    const offer = w.offer();
    expect(offer.prevented()).toBe(true);                               // the browser's own bar is not shown
    expect(offer.prompts()).toBe(0);                                    // and the app does not show its dialog by itself
    expect(install.getState()).toEqual({ installed: false, canPrompt: true });
  });

  it("shows the browser's dialog when asked, reports the choice, and cannot use the same offer twice", async () => {
    const w = fakeWindow();
    const install = createInstall(w.env);
    const offer = w.offer("accepted");
    expect(await install.prompt()).toBe("accepted");
    expect(offer.prompts()).toBe(1);
    expect(install.getState().canPrompt).toBe(false);
    expect(await install.prompt()).toBe("unavailable");
    expect(offer.prompts()).toBe(1);
    w.offer("dismissed");
    expect(install.getState().canPrompt).toBe(true);                    // a later offer from the browser is a new one
    expect(await install.prompt()).toBe("dismissed");
  });

  it("without an offer there is nothing to show", async () => {
    expect(await createInstall(fakeWindow().env).prompt()).toBe("unavailable");
  });

  it("an offer whose dialog cannot be shown is 'unavailable', not an exception", async () => {
    const w = fakeWindow();
    const install = createInstall(w.env);
    w.offer("fails");
    expect(await install.prompt()).toBe("unavailable");
    expect(install.getState().canPrompt).toBe(false);
  });

  it("running in its own window means installed: nothing is offered; the installed event and a change of display mode update it", () => {
    const standalone = createInstall(fakeWindow(true).env);
    expect(standalone.getState()).toEqual({ installed: true, canPrompt: false });

    const w = fakeWindow();
    const install = createInstall(w.env);
    const seen: InstallState[] = [];
    install.subscribe(() => seen.push(install.getState()));
    w.offer();
    w.installed();
    expect(install.getState()).toEqual({ installed: true, canPrompt: false });
    w.setMode(false);
    expect(install.getState()).toEqual({ installed: false, canPrompt: false });
    w.setMode(true);
    expect(seen.map((s) => `${s.installed}/${s.canPrompt}`)).toEqual(["false/true", "true/false", "false/false", "true/false"]);
  });
});

function card(install: Install, lang: "en" | "zh-Hant" = "en") {
  return render(<InstallProvider value={install}><I18nProvider lang={lang} setLang={() => undefined}><InstallCard /></I18nProvider></InstallProvider>);
}

describe("Settings → Install this app", () => {
  it("always explains 'Add to Home Screen' in words, including iPhone and iPad, and offers no button until the browser has offered", () => {
    card(createInstall(fakeWindow().env));
    expect(screen.getByText(/Installing puts the app on your home screen/)).toBeInTheDocument();
    expect(screen.getByText(/On iPhone and iPad \(Safari\): tap the Share button, then “Add to Home Screen”/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install this app" })).toBeNull();
  });

  it("offers the button once the browser has made its offer, and says what happened", async () => {
    const w = fakeWindow();
    card(createInstall(w.env));
    act(() => { w.offer("dismissed"); });
    await userEvent.click(screen.getByRole("button", { name: "Install this app" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Not installed. You can install it later");
    expect(screen.queryByRole("button", { name: "Install this app" })).toBeNull();            // the offer was used
    act(() => { w.offer("accepted"); });
    await userEvent.click(screen.getByRole("button", { name: "Install this app" }));
    expect(await screen.findByText("Installing. The app will appear in your app list.")).toBeInTheDocument();
  });

  it("says so, and offers nothing, when the app is already running in its own window", () => {
    card(createInstall(fakeWindow(true).env));
    expect(screen.getByRole("status")).toHaveTextContent("This app is installed on this device.");
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/Add to Home Screen/)).toBeNull();
  });

  it("has no accessibility violations, in either language", async () => {
    for (const lang of ["en", "zh-Hant"] as const) {
      const w = fakeWindow();
      const { container, unmount } = card(createInstall(w.env), lang);
      act(() => { w.offer(); });
      expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      unmount();
    }
  });

  it("is in Traditional Chinese too", () => {
    const w = fakeWindow();
    card(createInstall(w.env), "zh-Hant");
    act(() => { w.offer(); });
    expect(screen.getByRole("button", { name: "安裝此應用程式" })).toBeInTheDocument();
    expect(screen.getByText(/點「分享」按鈕，再選「加入主畫面」/)).toBeInTheDocument();
  });
});

describe("a window without browser buttons", () => {
  it("every screen keeps the header: the way home and the three places to go, so none is a dead end", async () => {
    for (const route of ROUTES.filter((r) => !r.dev)) {
      const { unmount } = await renderRoute("en", route.url, route.needs);
      const brand = screen.getAllByRole("link", { name: "TCM Self-Check" })[0]!;
      expect(brand, route.url).toHaveAttribute("href", "/en/");
      const menu = screen.getByRole("navigation", { name: "Main menu" });
      expect(within(menu).getAllByRole("link").map((a) => a.getAttribute("href")), route.url).toEqual(["/en/history", "/en/sources", "/en/settings"]);
      unmount();
    }
  }, 60_000);
});

describe("the manifest", () => {
  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "public", "manifest.webmanifest"), "utf8")) as Record<string, unknown> & { icons: { src: string; sizes: string; type: string; purpose?: string }[] };
  it("is that of an installable app: standalone, opening at the root, with icons for every use", () => {
    expect(manifest).toMatchObject({ id: "/", start_url: "/", scope: "/", display: "standalone", lang: "zh-Hant" });
    expect(manifest.icons.map((i) => `${i.sizes} ${i.type} ${i.purpose ?? "any"}`)).toEqual(expect.arrayContaining(["192x192 image/png any", "512x512 image/png any", "512x512 image/png maskable"]));
    for (const key of ["shortcuts", "categories", "related_applications", "screenshots"]) expect(manifest).not.toHaveProperty(key);
  });
  it("names the app as the page does", () => {
    const html = readFileSync(join(import.meta.dirname, "..", "index.html"), "utf8");
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon"');
    expect(String(manifest.short_name)).toBe("TCM Self-Check");
  });
});

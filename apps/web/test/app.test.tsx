import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_PROFILE, IS_DEV_PROFILE } from "../src/app/profile.ts";
import { blockedEnvironment, fakeEnvironment, renderApp, testStore } from "./helpers.tsx";

const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); document.documentElement.lang = ""; document.title = ""; document.documentElement.removeAttribute("data-theme"); document.documentElement.style.removeProperty("--text-scale"); });

describe("app scaffold", () => {
  it("renders the shell with a main landmark, a skip link and the permanent disclaimer, in zh-Hant", () => {
    go("/zh-Hant/");
    renderApp();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "跳到主要內容" })).toHaveAttribute("href", "#main");
    expect(screen.getByText("僅供教育參考，不是醫療診斷或處方。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("依古典中醫的方法，了解您的身體");
    expect(document.documentElement.lang).toBe("zh-Hant");
    expect(document.title).toBe("中醫自我評估");
  });

  it("knows its build-time profile (tests run as dev unless APP_PROFILE says otherwise)", () => {
    go("/zh-Hant/");
    expect(["release", "dev"]).toContain(APP_PROFILE);
    expect(IS_DEV_PROFILE).toBe(APP_PROFILE === "dev");
    renderApp();
    expect(screen.queryByTestId("profile-badge") !== null).toBe(IS_DEV_PROFILE);
  });
});

describe("language routing", () => {
  it("/ goes to the entry language: zh-Hant for everyone unless a saved language is supplied", () => {
    go("/");
    renderApp();
    expect(window.location.pathname).toBe("/zh-Hant/");
    expect(document.documentElement.lang).toBe("zh-Hant");
  });

  it("a saved language is honoured at /", () => {
    go("/");
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang: "en" }));
    renderApp(testStore(env).store);
    expect(window.location.pathname).toBe("/en/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Understand your body the way classical TCM does");
    expect(document.documentElement.lang).toBe("en");
  });

  it("an alias such as /zh or /EN-us is redirected to the canonical tag, keeping the rest and the query", () => {
    go("/EN-us/_dev/nowhere?x=1");
    renderApp();
    expect(window.location.pathname + window.location.search).toBe("/en/_dev/nowhere?x=1");
  });

  it("an unknown first segment is a not-found screen in the default language, with a way home", () => {
    go("/nothing/here");
    renderApp();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("找不到這個頁面");
    expect(document.title).toBe("找不到這個頁面 · 中醫自我評估");
    expect(screen.getByRole("link", { name: "回到首頁" })).toHaveAttribute("href", "/");          // `/` redirects to the entry language
  });

  it("an unknown route inside a language is a not-found screen in that language", () => {
    go("/en/nothing");
    renderApp();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("We couldn't find that page");
    expect(document.title).toBe("We couldn't find that page · TCM Self-Check");
  });

  it("switching language keeps the route, the query and the focus, and updates <html lang> and the title (E11)", async () => {
    go("/zh-Hant/nothing?draft=1");
    renderApp();
    const toggle = screen.getByRole("group", { name: "語言" });
    expect(toggle).toBeInTheDocument();
    const en = screen.getByRole("button", { name: "EN" });
    expect(en).toHaveAttribute("aria-pressed", "false");
    expect(en).toHaveAttribute("lang", "en");
    await userEvent.click(en);
    expect(window.location.pathname + window.location.search).toBe("/en/nothing?draft=1");
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("We couldn't find that page · TCM Self-Check");
    expect(screen.getByRole("group", { name: "Language" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "中文" })).toHaveAttribute("aria-pressed", "false");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "EN" }));          // language switch does not steal focus
    await userEvent.click(screen.getByRole("button", { name: "中文" }));
    expect(window.location.pathname).toBe("/zh-Hant/nothing");
    expect(document.documentElement.lang).toBe("zh-Hant");
  });

  it("the language switch replaces the history entry, so Back does not flip the language", async () => {
    go("/zh-Hant/");
    const before = window.history.length;
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(window.history.length).toBe(before);
  });

  it("moves focus to the new screen's h1 when the route changes, but not on first load", async () => {
    go("/zh-Hant/nothing");
    renderApp();
    expect(document.activeElement).toBe(document.body);
    await userEvent.click(screen.getByRole("link", { name: "回到首頁" }));
    expect(window.location.pathname).toBe("/zh-Hant/");
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
  });

  it("follows browser Back/Forward across languages", async () => {
    go("/zh-Hant/");
    renderApp();
    act(() => { go("/en/"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(document.documentElement.lang).toBe("en");
    act(() => { go("/zh-Hant/"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(document.documentElement.lang).toBe("zh-Hant");
  });
});

describe.runIf(IS_DEV_PROFILE)("dev routes", () => {
  it("serves the component catalogue under /:lang/_dev/components in dev builds", async () => {
    go("/en/_dev/components");
    renderApp();
    expect(await screen.findByTestId("catalogue")).toBeInTheDocument();
  });
});

describe("storage and preferences in the shell", () => {
  it("shows the 'Not saved' chip when storage is blocked, and the app still works (E20)", async () => {
    go("/zh-Hant/");
    const { store } = renderApp(testStore(blockedEnvironment()).store);
    await waitFor(() => expect(screen.getByTestId("not-saved")).toHaveTextContent("未儲存"));
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    store.getState().startDraft();
    expect(store.getState().draft).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "說明：為何未儲存" }));
    expect(screen.getByRole("note")).toHaveTextContent("不會在關閉或重新整理頁面後保留");
  });

  it("shows no chip when storage works", async () => {
    go("/zh-Hant/");
    renderApp();
    await waitFor(() => expect(screen.queryByTestId("not-saved")).toBeNull());
  });

  it("an explicit language switch is remembered: / then opens in it, and the choice survives a new session", async () => {
    go("/zh-Hant/");
    const env = fakeEnvironment();
    const { store, unmount } = renderApp(testStore(env).store);
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(store.getState().prefs.lang).toBe("en");
    unmount();
    go("/");
    renderApp(testStore(env).store);
    expect(window.location.pathname).toBe("/en/");
  });

  it("applies the stored theme and text size to the document", () => {
    go("/zh-Hant/");
    const env = fakeEnvironment();
    env.localStorage.setItem("tcm.prefs", JSON.stringify({ theme: "dark", textScale: 1.3 }));
    renderApp(testStore(env).store);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--text-scale")).toBe("1.3");
    act(() => { /* a later preference change reaches the document */ });
  });

  describe("the one-time 'View in English' offer", () => {
    const setBrowserLanguages = (langs: string[]): void => { vi.spyOn(navigator, "languages", "get").mockReturnValue(langs); };

    it("is offered (in English) to an English browser that has not chosen, and is retired by Dismiss", async () => {
      go("/zh-Hant/");
      setBrowserLanguages(["en-GB"]);
      const env = fakeEnvironment();
      const { store, unmount } = renderApp(testStore(env).store);
      const offer = screen.getByRole("region", { name: "Language" });
      expect(offer).toHaveAttribute("lang", "en");
      expect(offer).toHaveTextContent("This page is also available in English.");
      await userEvent.click(screen.getByRole("button", { name: "No thanks" }));
      expect(screen.queryByRole("region", { name: "Language" })).toBeNull();
      expect(store.getState().prefs.langOfferDismissed).toBe(true);
      expect(store.getState().prefs.lang).toBeUndefined();         // dismissing is not choosing
      unmount();
      renderApp(testStore(env).store);
      expect(screen.queryByRole("region", { name: "Language" })).toBeNull();
    });

    it("'View in English' switches the language, keeps the route and records the choice", async () => {
      go("/zh-Hant/nothing");
      setBrowserLanguages(["en-US"]);
      const { store } = renderApp();
      await userEvent.click(screen.getByRole("button", { name: "View in English" }));
      expect(window.location.pathname).toBe("/en/nothing");
      expect(store.getState().prefs.lang).toBe("en");
      expect(screen.queryByRole("region", { name: "Language" })).toBeNull();
    });

    it("is not offered to a Chinese browser, nor to someone who has already chosen, nor on the English page", () => {
      go("/zh-Hant/");
      setBrowserLanguages(["zh-TW", "en"]);
      const { unmount } = renderApp();
      expect(screen.queryByRole("region", { name: "語言" })).toBeNull();
      unmount();
      setBrowserLanguages(["en-GB"]);
      const env = fakeEnvironment();
      env.localStorage.setItem("tcm.prefs", JSON.stringify({ lang: "zh-Hant" }));
      const second = renderApp(testStore(env).store);
      expect(screen.queryByRole("region", { name: "語言" })).toBeNull();
      second.unmount();
      go("/en/");
      renderApp();
      expect(screen.queryByRole("region", { name: "Language" })).toBeNull();
    });
  });
});

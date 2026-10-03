import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../src/app/App.tsx";
import { APP_PROFILE, IS_DEV_PROFILE } from "../src/app/profile.ts";

const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); document.documentElement.lang = ""; document.title = ""; });

describe("app scaffold", () => {
  it("renders the shell with a main landmark, a skip link and the permanent disclaimer, in zh-Hant", () => {
    go("/zh-Hant/");
    render(<App />);
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "跳到主要內容" })).toHaveAttribute("href", "#main");
    expect(screen.getByText("僅供教育參考，不是醫療診斷或處方。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("中醫自我評估");
    expect(document.documentElement.lang).toBe("zh-Hant");
    expect(document.title).toBe("中醫自我評估");
  });

  it("knows its build-time profile (tests run as dev unless APP_PROFILE says otherwise)", () => {
    go("/zh-Hant/");
    expect(["release", "dev"]).toContain(APP_PROFILE);
    expect(IS_DEV_PROFILE).toBe(APP_PROFILE === "dev");
    render(<App />);
    expect(screen.queryByTestId("profile-badge") !== null).toBe(IS_DEV_PROFILE);
  });
});

describe("language routing", () => {
  it("/ goes to the entry language: zh-Hant for everyone unless a saved language is supplied", () => {
    go("/");
    render(<App />);
    expect(window.location.pathname).toBe("/zh-Hant/");
    expect(document.documentElement.lang).toBe("zh-Hant");
  });

  it("a saved language is honoured at /", () => {
    go("/");
    render(<App entryLang="en" />);
    expect(window.location.pathname).toBe("/en/");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("TCM Self-Check");
    expect(document.documentElement.lang).toBe("en");
  });

  it("an alias such as /zh or /EN-us is redirected to the canonical tag, keeping the rest and the query", () => {
    go("/EN-us/_dev/nowhere?x=1");
    render(<App />);
    expect(window.location.pathname + window.location.search).toBe("/en/_dev/nowhere?x=1");
  });

  it("an unknown first segment is a not-found screen in the default language, with a way home", () => {
    go("/nothing/here");
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("找不到這個頁面");
    expect(document.title).toBe("找不到這個頁面 · 中醫自我評估");
    expect(screen.getByRole("link", { name: "回到首頁" })).toHaveAttribute("href", "/");          // `/` redirects to the entry language
  });

  it("an unknown route inside a language is a not-found screen in that language", () => {
    go("/en/nothing");
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("We couldn't find that page");
    expect(document.title).toBe("We couldn't find that page · TCM Self-Check");
  });

  it("switching language keeps the route, the query and the focus, and updates <html lang> and the title (E11)", async () => {
    go("/zh-Hant/nothing?draft=1");
    render(<App />);
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
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(window.history.length).toBe(before);
  });

  it("moves focus to the new screen's h1 when the route changes, but not on first load", async () => {
    go("/zh-Hant/nothing");
    render(<App />);
    expect(document.activeElement).toBe(document.body);
    await userEvent.click(screen.getByRole("link", { name: "回到首頁" }));
    expect(window.location.pathname).toBe("/zh-Hant/");
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));
  });

  it("follows browser Back/Forward across languages", async () => {
    go("/zh-Hant/");
    render(<App />);
    act(() => { go("/en/"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(document.documentElement.lang).toBe("en");
    act(() => { go("/zh-Hant/"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(document.documentElement.lang).toBe("zh-Hant");
  });
});

describe.runIf(IS_DEV_PROFILE)("dev routes", () => {
  it("serves the component catalogue under /:lang/_dev/components in dev builds", async () => {
    go("/en/_dev/components");
    render(<App />);
    expect(await screen.findByTestId("catalogue")).toBeInTheDocument();
  });
});

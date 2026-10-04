import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";

const root = join(import.meta.dirname, "..");
const go = (path: string): void => { window.history.pushState({}, "", path); };
const robots = (): string | null => document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;
const description = (): string | null => document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null;

beforeEach(() => { document.head.querySelectorAll('meta[name="description"], meta[name="robots"]').forEach((m) => m.remove()); const m = document.createElement("meta"); m.name = "description"; m.content = "static"; document.head.appendChild(m); });
afterEach(() => { go("/"); document.head.querySelectorAll('meta[name="description"], meta[name="robots"]').forEach((m) => m.remove()); vi.resetModules(); });

describe("static page metadata (U-26)", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  it("index.html has the viewport, colour-scheme, theme colours for both schemes, icons and the manifest", () => {
    expect(html).toContain('name="viewport"');
    expect(html).toMatch(/name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: light\)"/i);
    expect(html).toMatch(/name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: dark\)"/i);
    expect(html).toContain('rel="icon" href="/icon.svg"');
    expect(html).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
  });

  it("the manifest is valid, names the app in both languages and every icon exists with the size it claims", () => {
    const m = JSON.parse(readFileSync(join(root, "public", "manifest.webmanifest"), "utf8")) as { name: string; start_url: string; icons: { src: string; sizes: string; type: string; purpose: string }[] };
    expect(m.name).toMatch(/中醫自我評估/);
    expect(m.name).toMatch(/TCM Self-Check/);
    expect(m.start_url).toBe("/");
    expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of m.icons) {
      const file = join(root, "public", icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      if (icon.type === "image/png") {
        const b = readFileSync(file);
        expect(b.subarray(1, 4).toString()).toBe("PNG");
        expect(`${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`, icon.src).toBe(icon.sizes);
      }
    }
    expect(existsSync(join(root, "public", "apple-touch-icon.png"))).toBe(true);
  });
});

describe("description follows the language", () => {
  it("is set in Traditional Chinese and then English as the language changes", async () => {
    go("/zh-Hant/");
    renderApp();
    expect(description()).toMatch(/中醫自我評估/);
    act(() => { go("/en/"); window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(description()).toMatch(/Traditional Chinese Medicine self-assessment/);
  });
});

describe("robots meta", () => {
  it("only the start page and the sources are indexable; a step, a result and a not-found page are not", async () => {
    go("/en/");
    renderApp();
    expect(robots()).toBe("index, follow");
    for (const [path, expected] of [["/en/start", "noindex, nofollow"], ["/en/sources", "index, follow"], ["/en/result/abc", "noindex, nofollow"], ["/en/history", "noindex, nofollow"], ["/en/zzz", "noindex, nofollow"]] as const) {
      act(() => { go(path); window.dispatchEvent(new PopStateEvent("popstate")); });
      expect(robots(), path).toBe(expected);
    }
  });

  it("a build that says noindex (dev, closed beta) is never made indexable by a route", async () => {
    const meta = document.createElement("meta"); meta.name = "robots"; meta.content = "noindex, nofollow"; document.head.appendChild(meta);
    vi.resetModules();
    const { DocumentMeta } = await import("../src/app/DocumentMeta.tsx");
    const { I18nProvider } = await import("../src/i18n/I18nProvider.tsx");
    const loc = memoryLocation({ path: "/en/", static: true });
    render(<I18nProvider lang="en" setLang={() => undefined}><Router hook={loc.hook}><DocumentMeta /></Router></I18nProvider>);
    expect(robots()).toBe("noindex, nofollow");
  });
});

describe("404 (S19)", () => {
  it("offers the start, and — when an assessment is in progress — a way back to where the person left off, with or without a language segment", async () => {
    const env = fakeEnvironment();
    const t = testStore(env);
    t.store.getState().startDraft();
    t.store.getState().updateDraft((d) => ({ ...d, position: { route: "/inquiry" } }));
    go("/en/zzz");
    const first = renderApp(t.store);
    expect(await screen.findByRole("link", { name: "Continue my assessment" })).toHaveAttribute("href", "/en/inquiry");
    expect(screen.getByRole("link", { name: "Back to the start" })).toBeInTheDocument();
    first.unmount();
    go("/nothing/here");
    renderApp(t.store);
    expect(await screen.findByRole("link", { name: "繼續我的評估" })).toHaveAttribute("href", "/zh-Hant/inquiry");
  });

  it("with nothing in progress there is only the way home", async () => {
    go("/en/zzz");
    renderApp();
    expect(await screen.findByRole("link", { name: "Back to the start" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continue my assessment" })).toBeNull();
  });
});

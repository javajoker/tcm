import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { placeholdersOf, pseudoXA, type Message } from "@tcm/i18n";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { IS_DEV_PROFILE } from "../src/app/profile.ts";
import { splitLangPath } from "../src/app/routing.ts";
import { DISCLAIMER_VERSION } from "../src/app/disclaimer.ts";
import { catalogs } from "../src/i18n/catalogs.ts";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";

const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); document.documentElement.removeAttribute("data-pseudo"); });

function start(path: string) {
  const env = fakeEnvironment();
  env.localStorage.setItem("tcm.prefs", JSON.stringify({ disclaimerAck: { version: DISCLAIMER_VERSION, at: 1 } }));
  go(path);
  return renderApp(testStore(env).store);
}

describe.runIf(IS_DEV_PROFILE)("pseudo-locales (dev profile only)", () => {
  it("the route knows them: a base language, a transform, a canonical segment — and an alias is redirected to it", () => {
    expect(splitLangPath("/en-XA/start")).toMatchObject({ lang: "en", pseudo: "xa", segment: "en-XA", alias: false, rest: "/start", canonical: "/en-XA/start" });
    expect(splitLangPath("/ZH-xl/")).toMatchObject({ lang: "zh-Hant", pseudo: "xl", segment: "zh-XL", alias: true, canonical: "/zh-XL/" });
    expect(splitLangPath("/en/start")).toMatchObject({ lang: "en", pseudo: null, segment: "en" });
    expect(splitLangPath("/fr/start")).toMatchObject({ lang: null, pseudo: null, segment: null });
  });

  it("/en-XA shows the English messages accented, doubled in the vowels and bracketed, with the page language still English", async () => {
    start("/en-XA/");
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/^⟦.+⟧$/);
    expect(h1.textContent!.length).toBeGreaterThan("Understand your body the way classical TCM does".length * 1.25);
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dataset.pseudo).toBe("xa");
    const internal = screen.getAllByRole("link").map((a) => a.getAttribute("href")!).filter((h) => h.startsWith("/"));
    expect(internal.length).toBeGreaterThan(2);
    for (const h of internal) expect(h, h).toMatch(/^\/en-XA\//);
  });

  it("navigation keeps the pseudo-locale, and a plain language switch leaves it", async () => {
    start("/en-XA/");
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: /繁體/ }));
    expect(window.location.pathname).toBe("/zh-Hant/");
    expect(document.documentElement.dataset.pseudo).toBeUndefined();
  });

  it("/zh-XL repeats every Chinese message so overflow shows", async () => {
    start("/zh-XL/");
    const h1 = await screen.findByRole("heading", { level: 1 });
    const [a, b] = h1.textContent!.split(" · ");
    expect(a!.length).toBeGreaterThan(3);
    expect(a).toBe(b);
    expect(document.documentElement.lang).toBe("zh-Hant");
  });

  it("an alias such as /EN-xa/start is redirected to the canonical /en-XA/start", async () => {
    start("/EN-xa/start");
    await act(async () => { await Promise.resolve(); });
    expect(window.location.pathname).toBe("/en-XA/start");
  });

  it("the pseudo-localised landing has no accessibility violations", async () => {
    const { container } = start("/en-XA/");
    await screen.findByRole("heading", { level: 1 });
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
});

describe("every message survives the transform", () => {
  it("each English message keeps exactly its placeholders, tags and plural forms under en-XA", () => {
    const en = catalogs.en as Record<string, Message>;
    for (const [key, message] of Object.entries(en)) {
      const forms = typeof message === "string" ? [message] : Object.values(message);
      const mapped = typeof message === "string" ? pseudoXA(message) : Object.fromEntries(Object.entries(message).map(([k, v]) => [k, pseudoXA(v)])) as Message;
      expect(placeholdersOf(mapped), key).toEqual(placeholdersOf(message));
      for (const f of forms) expect(pseudoXA(f), key).toMatch(/^⟦[\s\S]*⟧$/);
    }
  });
});

// The terms of service (PD-36): the Terms page in the page language, reached from the footer of every screen and from the landing page's statement, which accepts them —
// every message of the terms is part of the statement's version, so a change of the terms asks everyone again.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { afterEach, describe, expect, it } from "vitest";
import { DISCLAIMER_VERSION, disclaimerVersionFor } from "../src/app/disclaimer.ts";
import { catalogs } from "../src/i18n/catalogs.ts";
import { termsSections } from "../src/screens/settings/Terms.tsx";
import { fakeEnvironment, renderApp, testStore } from "./helpers.tsx";

const go = (path: string): void => { window.history.pushState({}, "", path); };
afterEach(() => { go("/"); });
const has = (lang: "zh-Hant" | "en") => (k: string): boolean => k in (catalogs[lang] as Record<string, unknown>);

describe("the terms of service", () => {
  it("the page: the title, the version, the draft notice, the introduction and twelve numbered sections — and no accessibility violation", async () => {
    go("/en/terms");
    const { container } = renderApp(testStore(fakeEnvironment()).store);
    expect(await screen.findByRole("heading", { level: 1, name: "Terms of service" })).toBeInTheDocument();
    expect(screen.getByText(/^Version 0\.1 \(draft\)/)).toBeInTheDocument();
    expect(screen.getByText(/^Draft for legal review/)).toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(termsSections(has("en")).map((s, i) => `${i + 1}. ${(catalogs.en as Record<string, string>)[s.title]}`));
    expect(headings).toHaveLength(12);
    expect(screen.getByText(/for study and for use within the project only/)).toBeInTheDocument();
    expect(screen.getByText(/do not limit the rights the Apache License gives you to the source code/)).toBeInTheDocument();
    expect((await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);   // contrast is checked in the browser (E2E)
  });

  it("in Traditional Chinese, the same sections", async () => {
    go("/zh-Hant/terms");
    renderApp(testStore(fakeEnvironment()).store);
    expect(await screen.findByRole("heading", { level: 1, name: "使用條款" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(12);
    expect(termsSections(has("zh-Hant"))).toEqual(termsSections(has("en")));
  });

  it("every screen's footer links to it", async () => {
    go("/en/sources");
    renderApp(testStore(fakeEnvironment()).store);
    const footer = within(screen.getByRole("navigation", { name: "Footer links" }));
    expect(footer.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/en/terms");
  });

  it("the landing page's statement accepts them and links to them", async () => {
    go("/en/");
    renderApp(testStore(fakeEnvironment()).store);
    expect(screen.getByRole("checkbox", { name: /I accept the terms of service/ })).not.toBeChecked();
    await userEvent.click(screen.getByRole("link", { name: "Terms of service" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Terms of service" })).toBeInTheDocument();
  });

  it("a change of the terms changes the statement's version, so everyone is asked again", () => {
    expect(disclaimerVersionFor(catalogs)).toBe(DISCLAIMER_VERSION);
    const changed = { ...catalogs, "zh-Hant": { ...catalogs["zh-Hant"], "terms.s5.p1": "改過的條款" } };
    expect(disclaimerVersionFor(changed)).not.toBe(DISCLAIMER_VERSION);
    const added = { ...catalogs, en: { ...catalogs.en, "terms.s13.title": "A new section" }, "zh-Hant": { ...catalogs["zh-Hant"], "terms.s13.title": "新的一節" } };
    expect(disclaimerVersionFor(added)).not.toBe(DISCLAIMER_VERSION);
  });
});

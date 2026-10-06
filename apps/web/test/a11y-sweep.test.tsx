// The accessibility sweep (test plan §5.2, task Q-05): axe on every route of the app in both languages, each in a state where the route has something to show, plus a guard that
// fails when a route is added without being listed here. jsdom cannot compute colours, so contrast is checked elsewhere: the token pairs of both colour schemes in tokens.test.ts and
// real rendering in the Playwright / Lighthouse runs (Q-04, Q-06). Manual assistive-technology passes follow docs/accessibility-protocol.md.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it } from "vitest";
import { IS_DEV_PROFILE } from "../src/app/profile.ts";
import { finished, render, ROUTES, STATES } from "./sweep.tsx";

const violations = async (container: Element): Promise<string[]> =>
  (await axe(container, { rules: { "color-contrast": { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

describe("axe on every route (WCAG 2.1 A and AA, every language)", () => {
  for (const lang of ["en", "zh-Hant", "zh-Hans"] as const) {
    for (const r of ROUTES.filter((x) => !x.dev || IS_DEV_PROFILE)) {
      it(`${r.pattern} · ${lang}`, async () => {
        const { container } = await render(lang, r.url, r.needs);
        expect(window.location.pathname, "a guard redirected: the sweep would be checking another screen").toBe(`/${lang}${r.url}`);
        expect(await violations(container)).toEqual([]);
        expect(document.documentElement.lang).toBe(lang);
        expect(document.title.length).toBeGreaterThan(0);
        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getAllByRole("main")).toHaveLength(1);
      });
    }
    for (const s of STATES) {
      it(`${s.name} · ${lang}`, async () => {
        const { container } = await render(lang, s.url, "draft", s.draft(finished));
        expect(window.location.pathname + window.location.search).toBe(`/${lang}${s.url}`);
        expect(await violations(container)).toEqual([]);
      });
    }
  }
});

describe("the sweep covers every route", () => {
  it("every <Route path> of App.tsx is in the table", () => {
    const source = readFileSync(join(import.meta.dirname, "..", "src", "app", "App.tsx"), "utf8");
    const inApp = [...source.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]!).sort();
    const inTable = ROUTES.map((r) => r.pattern).filter((p) => p !== "*").sort();
    expect(inTable).toEqual(inApp);
    expect(source).toMatch(/<Route><NotFound \/><\/Route>/);                              // the catch-all is the "*" row
  });
});

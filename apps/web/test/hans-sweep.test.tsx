// The Simplified-Chinese purity sweep (docs/post-mvp/design/simplified-chinese.md §6): every route, rendered in zh-Hans with a Simplified knowledge base, shows no Traditional-only character.
// This is the check that finds a display site that forgot `t.zh`. It also checks that the page says it is Simplified.
import { describe, expect, it } from "vitest";
import { IS_DEV_PROFILE } from "../src/app/profile.ts";
import { TRADITIONAL_ONLY, traditionalOnScreen } from "./hans.ts";
import * as engine from "@tcm/engine";
import { assessInputOf, toSaved } from "../src/app/assessment.ts";
import { interview } from "./interview.ts";
import { finished, kb, render, ROUTES, saved, STATES } from "./sweep.tsx";

describe("the set of Traditional-only characters is a real one", () => {
  it("knows the characters that matter and not the shared ones", () => {
    for (const c of "腎濕脈氣陰陽藥臟") expect(TRADITIONAL_ONLY.has(c), c).toBe(true);
    for (const c of "脾肝心肺火木土金水") expect(TRADITIONAL_ONLY.has(c), c).toBe(false);
    expect(TRADITIONAL_ONLY.size).toBeGreaterThan(300);
  });
});

describe("zh-Hans: nothing Traditional on any route", () => {
  for (const r of ROUTES.filter((x) => !x.dev || IS_DEV_PROFILE)) {
    it(`${r.pattern}`, async () => {
      await render("zh-Hans", r.url, r.needs);
      expect(window.location.pathname).toBe(`/zh-Hans${r.url}`);
      expect(document.documentElement.lang).toBe("zh-Hans");
      expect(traditionalOnScreen()).toEqual([]);
    });
  }
  for (const s of STATES) {
    it(s.name, async () => {
      await render("zh-Hans", s.url, "draft", s.draft(finished));
      expect(traditionalOnScreen()).toEqual([]);
    });
  }
});

describe("zh-Hans: the result of every pattern's typical patient, and every formula's page", () => {
  for (const p of kb.patterns) {
    it(`result · ${p.id}`, async () => {
      const draft = interview(kb, p.id);
      const input = assessInputOf(draft, Date.UTC(2026, 9, 4, 12));
      expect(input, "the typical patient is complete").not.toBeNull();
      const mine = toSaved(draft, engine.assess(kb, input!), { id: `r-${p.id.toLowerCase()}-0123456789`, lang: "zh-Hans" });
      await render("zh-Hans", `/result/${mine.id}`, "saved", finished, [mine]);
      expect(traditionalOnScreen()).toEqual([]);
    });
  }
  for (const id of kb.formulas.keys()) {
    it(`formula · ${id}`, async () => {
      await render("zh-Hans", `/result/${saved.id}/formula/${id}`, "saved");
      expect(traditionalOnScreen()).toEqual([]);
    });
  }
});

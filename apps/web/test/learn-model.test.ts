// The Learn section's models (docs/post-mvp/design/knowledge-browser.md §3–§5, §10): search normalisation and ranking, the page model of every term and quotation, the registry, and the
// wording rule R2 over the whole catalogue.
import { createI18n } from "@tcm/i18n";
import { describe, expect, it } from "vitest";
import { catalogs, type MessageKey } from "../src/i18n/catalogs.ts";
import { listOf, pageOf } from "../src/learn/pages.ts";
import { AVAILABLE, hrefOf, infoOf, TYPES, typeOfPath } from "../src/learn/registry.ts";
import { buildIndex, matching, normalise, PER_TYPE, search } from "../src/learn/search.ts";
import { kb, kbHans } from "./sweep.tsx";

const tFor = (lang: "en" | "zh-Hant", k = kb) => createI18n<MessageKey>({ ...catalogs, "zh-Hans": {} }, lang, { zh: k.zh });
const en = tFor("en");

describe("normalise", () => {
  it("ignores case, tone marks, width and spaces", () => {
    expect(normalise("Yīn Yáng")).toBe("yinyang");
    expect(normalise("ＹＩＮ　ＹＡＮＧ")).toBe("yinyang");
    expect(normalise("  Qi-and blood ")).toBe("qiandblood");
    expect(normalise("陰 陽")).toBe("陰陽");
  });
  it("keeps what a ü or an ǖ is told apart by from other letters, and drops nothing but marks", () => {
    expect(normalise("lǜ")).toBe("lu");
    expect(normalise("")).toBe("");
  });
});

describe("search", () => {
  const index = buildIndex(kb);
  it("finds a term by its Chinese, English, pinyin (with or without tones) and id forms", () => {
    const term = kb.glossary.find((g) => g.id === "yin-yang")!;
    for (const q of [term["zh-Hant"], term.en, "yīn yáng", "yin yang", "YIN-YANG"]) {
      const hits = search(index, q).byType.get("term")?.hits ?? [];
      expect(hits.some((h) => h.entry.id === "yin-yang"), q).toBe(true);
    }
  });
  it("ranks exact before prefix before substring, and caps each kind at eight with the true total", () => {
    const r = search(index, "qi");
    const group = r.byType.get("term")!;
    expect(group.hits.length).toBeLessThanOrEqual(PER_TYPE);
    expect(group.total).toBeGreaterThan(group.hits.length);
    const ranks = group.hits.map((h) => h.rank);
    expect(ranks).toEqual([...ranks].sort());
    expect(r.total).toBe([...r.byType.values()].reduce((n, g) => n + g.total, 0));
  });
  it("finds a quotation by its book and chapter", () => {
    const c = kb.citation("shanghan-035")!;
    const hits = search(index, `${c.book}${c.chapter}`).byType.get("quotation")?.hits ?? [];
    expect(hits.map((h) => h.entry.id)).toContain(c.id);
  });
  it("finds nothing for nothing, and nothing for nonsense", () => {
    expect(search(index, "   ").total).toBe(0);
    expect(search(index, "qzxqzxqzx").total).toBe(0);
  });
  it("the kind with the best match comes first, ties in the hub's order", () => {
    const order = AVAILABLE.map((a) => a.type);
    for (const q of ["a", "yin yang", "傷寒論"]) {
      const r = search(index, q);
      const kinds = [...r.byType.keys()];
      const best = (k: (typeof kinds)[number]): number => Math.min(...r.byType.get(k)!.hits.map((h) => h.rank));
      for (let i = 1; i < kinds.length; i++) {
        const [a, b] = [kinds[i - 1]!, kinds[i]!];
        expect(best(a) < best(b) || (best(a) === best(b) && order.indexOf(a) < order.indexOf(b)), `${q}: ${a} before ${b}`).toBe(true);
      }
    }
    const first = [...search(index, "陰陽").byType.entries()][0]!;           // the term 陰陽 is an exact match; a chapter that begins with it is only a prefix match
    expect(first[0]).toBe("term");
  });
  it("`matching` is uncapped, and an empty query keeps everything of the kind", () => {
    expect(matching(index, "term", "").size).toBe(kb.glossary.length);
    expect(matching(index, "term", "qi").size).toBe(search(index, "qi").byType.get("term")!.total);
  });
  it("a Simplified page is searchable by what it shows: a Simplified query finds the Traditional entry through its readings", () => {
    const hansIndex = buildIndex(kbHans);
    const term = kbHans.glossary.find((g) => g.id === "yin-yang")!;
    const simplified = kbHans.zh(term["zh-Hant"]);
    expect(simplified).not.toBe(term["zh-Hant"]);
    const direct = search(hansIndex, simplified).byType.get("term")?.hits.map((h) => h.entry.id) ?? [];
    expect(direct).toContain("yin-yang");
    const viaReadings = search(hansIndex, simplified, kbHans.traditional(simplified)).byType.get("term")?.hits.map((h) => h.entry.id) ?? [];
    expect(viaReadings).toContain("yin-yang");
  });
});

describe("the registry", () => {
  it("has the seven kinds, unique paths, and only the kinds whose pages exist are available", () => {
    expect(TYPES.map((t) => t.type)).toEqual(["pattern", "constitution", "formula", "point", "food", "quotation", "term"]);
    expect(new Set(TYPES.map((t) => t.path)).size).toBe(TYPES.length);
    expect(AVAILABLE.map((t) => t.type).sort()).toEqual(["quotation", "term"]);
  });
  it("addresses are ASCII and round-trip", () => {
    for (const { type, path } of AVAILABLE) {
      expect(typeOfPath(path)?.type).toBe(type);
      expect(hrefOf(type)).toBe(`/learn/${path}`);
      expect(hrefOf(type, "x-1")).toBe(`/learn/${path}/x-1`);
    }
    expect(typeOfPath("patterns")).toBeUndefined();            // not built yet: the route says not found rather than showing an empty list
    expect(infoOf("formula").adviceLike).toBe(true);
    expect(infoOf("term").adviceLike).toBe(false);
  });
});

describe.each(["en", "zh-Hant"] as const)("the pages of every available kind · %s", (lang) => {
  const t = tFor(lang);
  it("every glossary term has a page with a title, a source label, a review state and links that resolve", () => {
    expect(kb.glossary.length).toBeGreaterThan(100);
    for (const g of kb.glossary) {
      const page = pageOf(kb, "term", g.id, t)!;
      expect(page, g.id).not.toBeNull();
      expect(page.title["zh-Hant"]).toBe(g["zh-Hant"]);
      expect(page.sourceLabel !== undefined || page.citations.length > 0, `${g.id} has neither a source nor "no source"`).toBe(true);
      expect(page.adviceLike).toBe(false);
      for (const r of page.related) expect(r.href).toMatch(/^\/learn\/terms\/[a-z0-9-]+$/);
      const ids = new Set(kb.glossary.map((x) => x.id));
      for (const r of page.related) expect(ids.has(r.href.split("/").pop()!), r.href).toBe(true);
    }
  });
  it("every quotation has a page with its text, a verification state and a source", () => {
    expect(kb.citations.length).toBeGreaterThan(50);
    for (const c of kb.citations) {
      const page = pageOf(kb, "quotation", c.id, t)!;
      expect(page, c.id).not.toBeNull();
      expect(JSON.stringify(page.sections)).toContain(c.quote_zh_hant);
      expect(page.review).toBe(c.verified ? "checked" : "unchecked");
      expect(page.sourceLabel).toBeTruthy();
      for (const r of page.related) expect(kb.citation(r.href.split("/").pop()!), r.href).toBeDefined();
    }
  });
  it("an unknown id has no page, and a kind that is not built has no list and no page", () => {
    expect(pageOf(kb, "term", "no-such-term", t)).toBeNull();
    expect(pageOf(kb, "quotation", "no-such-quotation", t)).toBeNull();
    expect(pageOf(kb, "formula", "anything", t)).toBeNull();
    expect(listOf(kb, "formula", t)).toEqual([]);
  });
  it("the lists hold every record exactly once, in groups with headings", () => {
    const terms = listOf(kb, "term", t);
    expect(terms.flatMap((g) => g.items.map((i) => i.id)).sort()).toEqual(kb.glossary.map((g) => g.id).sort());
    for (const g of terms) expect(g.heading, g.key).toBeTruthy();
    const quotes = listOf(kb, "quotation", t);
    expect(quotes.flatMap((g) => g.items.map((i) => i.id)).sort()).toEqual(kb.citations.map((c) => c.id).sort());
  });
});

describe("ids", () => {
  it("terms and quotations have unique ASCII ids, so no route contains a Chinese character", () => {
    for (const ids of [kb.glossary.map((g) => g.id), kb.citations.map((c) => c.id)]) {
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });
});

describe("R2: the Learn catalogue never speaks to the reader", () => {
  const SECOND_PERSON = { en: /\b(you|your|yours|yourself|yourselves|you're|you'll|you've)\b/i, "zh-Hant": /[你妳您]/ } as const;
  for (const lang of ["en", "zh-Hant"] as const) {
    it(lang, () => {
      const offenders = Object.entries(catalogs[lang]).filter(([k]) => k.startsWith("learn.")).flatMap(([k, m]) => (typeof m === "string" ? [m] : Object.values(m).filter((x): x is string => typeof x === "string")).filter((s) => SECOND_PERSON[lang].test(s)).map((s) => `${k}: ${s}`));
      expect(offenders).toEqual([]);
    });
  }
  it("the catalogue has keys to check (the scan is not vacuous)", () => {
    expect(Object.keys(catalogs.en).filter((k) => k.startsWith("learn.")).length).toBeGreaterThan(50);
    expect(en.t("learn.page.standing")).toMatch(/not advice/);
  });
});

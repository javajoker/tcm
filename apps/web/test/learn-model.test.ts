// The Learn section's models (docs/post-mvp/design/knowledge-browser.md §3–§5, §10): search normalisation and ranking, the page model of every term and quotation, the registry, and the
// wording rule R2 over the whole catalogue.
import { indexKnowledgeBase } from "@tcm/kb";
import { rawChunksFromDisk } from "@tcm/kb/node";
import { createI18n } from "@tcm/i18n";
import { describe, expect, it } from "vitest";
import { catalogs, type MessageKey } from "../src/i18n/catalogs.ts";
import { comparisonPage, compareHref, compareLinks, parseIds } from "../src/learn/compare.ts";
import { listOf, pageOf } from "../src/learn/pages.ts";
import { AVAILABLE, hrefOf, infoOf, TYPES, typeOfPath } from "../src/learn/registry.ts";
import { buildIndex, matching, normalise, PER_TYPE, search } from "../src/learn/search.ts";
import { kb, kbHans } from "./sweep.tsx";

const tFor = (lang: "en" | "zh-Hant", k = kb) => createI18n<MessageKey>({ ...catalogs, "zh-Hans": {} }, lang, { zh: k.zh });
const en = tFor("en");
const release = indexKnowledgeBase(rawChunksFromDisk("release"));

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
    expect(AVAILABLE.map((t) => t.type).sort()).toEqual(["constitution", "food", "formula", "pattern", "point", "quotation", "term"]);
  });
  it("addresses are ASCII and round-trip", () => {
    for (const { type, path } of AVAILABLE) {
      expect(typeOfPath(path)?.type).toBe(type);
      expect(hrefOf(type)).toBe(`/learn/${path}`);
      expect(hrefOf(type, "x-1")).toBe(`/learn/${path}/x-1`);
    }
    expect(typeOfPath("herbs")).toBeUndefined();               // not built yet (Release C): the route says not found rather than showing an empty list
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
  it("every pattern has a page: its group, direction of care, tongue and pulse, features in bands, components, and sources or none", () => {
    expect(kb.patterns).toHaveLength(23);
    for (const p of kb.patterns) {
      const page = pageOf(kb, "pattern", p.id, t)!;
      expect(page, p.id).not.toBeNull();
      expect(page.title).toEqual(p.name);
      expect(page.adviceLike).toBe(false);
      expect(page.cautions).toEqual([]);
      expect(page.citations).toEqual(p.citations);
      const ids = page.sections.map((s) => s.id);
      expect(ids.slice(0, 4)).toEqual(["overview", "principle", "tongue-pulse", "features"]);
      const features = page.sections.find((s) => s.id === "features")!;
      const groups = features.blocks.filter((b) => b.kind === "groups").flatMap((b) => (b.kind === "groups" ? b.groups : []));
      const shown = groups.flatMap((g) => g.items.map((i) => i["zh-Hant"]));
      for (const s of Object.keys(p.weights)) expect(shown, `${p.id} ${s}`).toContain(kb.symptoms.get(s)!["zh-Hant"]);
      for (const s of Object.keys(p.against)) expect(shown, `${p.id} against ${s}`).toContain(kb.symptoms.get(s)!["zh-Hant"]);
      expect(groups[0]!.label).toBe(t.t("learn.band.key"));
      // R5: a pattern page never addresses the reader, never asks, and never says which pattern a visitor might have
      const text = JSON.stringify(page.sections, (k, v) => (k === "href" ? undefined : v));        // the text of the page: an address may carry a query
      expect(text).not.toMatch(/\b(you|your)\b|\?/i);
      for (const r of page.related) expect(kb.patternById.get(r.href.split("/").pop()!)?.group, r.href).toBe(p.group);
      // the treatment lists (points, foods, lifestyle) belong to the pages that carry cautions first, not to this one
      // …they are only reachable as links, in a section of their own, to pages that carry their cautions first
      const assoc = page.sections.find((s) => s.id === "assoc");
      const outside = JSON.stringify(page.sections.filter((s) => s.id !== "assoc"));
      for (const point of p.treatment.acupoints) expect(outside, `${p.id} ${point}`).not.toContain(point);
      for (const food of p.treatment.foods) expect(outside, `${p.id} ${food}`).not.toContain(food);
      for (const f of p.formulas) expect(outside, `${p.id} ${f}`).not.toContain(f);
      const links = (assoc?.blocks ?? []).flatMap((b) => (b.kind === "links" ? b.groups.flatMap((g) => g.items.map((i) => i.href)) : []));
      expect(links.length, p.id).toBe(p.formulas.length + p.treatment.acupoints.length + p.treatment.foods.length);
      for (const href of links) expect(href).toMatch(/^\/learn\/(formulas|points|foods)\/[A-Za-z0-9_-]+$/);
    }
  });
  it("every constitution has a page: description, features, related nature, tendencies, source", () => {
    expect(kb.constitutions).toHaveLength(9);
    for (const c of kb.constitutions) {
      const page = pageOf(kb, "constitution", c.id, t)!;
      expect(page, c.id).not.toBeNull();
      expect(page.title).toEqual(c.name);
      expect(page.sourceLabel).toBeTruthy();
      expect(page.sections[0]!.id).toBe("overview");
      expect(JSON.stringify(page.sections)).not.toMatch(/\b(you|your)\b|\?/i);
      expect(page.related).toHaveLength(8);
      // the questionnaire items are first-person statements for a person; the page shows the description only
      for (const type of kb.constitutionItems.types.filter((x) => x.constitution === c.id)) for (const item of type.items) expect(JSON.stringify(page.sections)).not.toContain(item.text["zh-Hant"]);
    }
    expect(JSON.stringify(pageOf(kb, "constitution", "C_YINXU", en)!.sections)).toContain("markedly");
  });
  it("an unknown id has no page, and a kind that is not built has no list and no page", () => {
    expect(pageOf(kb, "term", "no-such-term", t)).toBeNull();
    expect(pageOf(kb, "quotation", "no-such-quotation", t)).toBeNull();
    expect(pageOf(kb, "pattern", "NOPE", t)).toBeNull();
    expect(pageOf(kb, "constitution", "C_NOPE", t)).toBeNull();
    expect(pageOf(kb, "formula", "F_NOPE", t)).toBeNull();
    expect(pageOf(kb, "point", "XX99", t)).toBeNull();
    expect(pageOf(kb, "food", "no-such-food", t)).toBeNull();
  });
  it("the lists hold every record exactly once, in groups with headings", () => {
    const terms = listOf(kb, "term", t);
    expect(terms.flatMap((g) => g.items.map((i) => i.id)).sort()).toEqual(kb.glossary.map((g) => g.id).sort());
    for (const g of terms) expect(g.heading, g.key).toBeTruthy();
    expect(listOf(kb, "pattern", t).flatMap((g) => g.items.map((i) => i.id)).sort()).toEqual(kb.patterns.map((p) => p.id).sort());
    expect(listOf(kb, "pattern", t).map((g) => g.key)).toEqual([...new Set(kb.patterns.map((p) => p.group))]);
    expect(listOf(kb, "constitution", t).flatMap((g) => g.items.map((i) => i.id))).toEqual(kb.constitutions.map((c) => c.id));
    const quotes = listOf(kb, "quotation", t);
    expect(quotes.flatMap((g) => g.items.map((i) => i.id)).sort()).toEqual(kb.citations.map((c) => c.id).sort());
  });
});

describe("ids", () => {
  it("every kind has unique ASCII ids, so no route contains a Chinese character", () => {
    for (const ids of [kb.glossary.map((g) => g.id), kb.citations.map((c) => c.id), kb.patterns.map((p) => p.id), kb.constitutions.map((c) => c.id)]) {
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
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

describe.each(["en", "zh-Hant"] as const)("pages about something a person might use · %s", (lang) => {
  const t = tFor(lang);
  const SECOND_PERSON = lang === "en" ? /\b(you|your|yours|yourself)\b/i : /[你妳您]/;
  const everyPage = (k: typeof kb) => AVAILABLE.flatMap(({ type }) => listOf(k, type, t).flatMap((g) => g.items.map((i) => ({ type, id: i.id, page: pageOf(k, type, i.id, t)! }))));

  it("every page of every kind is reachable from its list, and never speaks to the reader (R2), in the data it shows as well as in the catalogue", () => {
    const pages = everyPage(kb);
    expect(pages).toHaveLength(kb.glossary.length + kb.citations.length + kb.patterns.length + kb.constitutions.length + kb.formulas.size + Object.keys(kb.treatment.acupoints).length + Object.keys(kb.treatment.foods).length);
    for (const { type, id, page } of pages) {
      expect(page, `${type}/${id}`).not.toBeNull();
      const text = JSON.stringify(page);
      expect(text.match(SECOND_PERSON)?.[0], `${type}/${id}`).toBeUndefined();
    }
  });
  it("R1: every page about something a person might use has cautions or flags to put first, and one that describes none says so", () => {
    for (const { type, id, page } of everyPage(kb)) {
      if (!page.adviceLike) continue;
      expect(page.cautions.length + page.flags.length, `${type}/${id}`).toBeGreaterThan(0);
      expect(page.flags.length, `${type}/${id} states its flags`).toBeGreaterThan(0);
    }
    expect(AVAILABLE.filter((a) => a.adviceLike).map((a) => a.type).sort()).toEqual(["food", "formula", "point"]);
  });
  it("R7 formulas: the flags shown are the stored ones — pregnancy, every interaction, allergy — and the stored ones agree with the herbs", () => {
    for (const f of kb.formulas.values()) {
      const page = pageOf(kb, "formula", f.id, t)!;
      const flags = page.flags.join("\n");
      expect(flags, f.id).toContain(t.t(f.pregnancy === "avoid" ? "formula.cautions.pregnancy.avoid" : f.pregnancy === "caution" ? "formula.cautions.pregnancy.caution" : "formula.cautions.pregnancy.ok"));
      for (const i of f.interactions) expect(flags, `${f.id} ${i}`).toContain(t.t(`formula.interaction.${i}` as MessageKey));
      if (f.interactions.length === 0) expect(flags).toContain(t.t("learn.formula.noInteraction"));
      expect(flags).toContain(t.t("learn.formula.allergy"));
      expect(page.cautions.map((c) => c["zh-Hant"])).toEqual(f.cautions);
      // the stored flags against the herbs (the build checks this too, validate_kb)
      const herbs = f.composition.map((c) => kb.herbs!.get(c.herb)!);
      expect([...f.interactions].sort()).toEqual([...new Set(herbs.flatMap((h) => h.interactions))].sort());
      const order = ["ok", "ok-unreviewed", "caution", "avoid"];
      expect(f.pregnancy).toBe(herbs.map((h) => h.pregnancy).sort((a, b) => order.indexOf(a) - order.indexOf(b)).at(-1));
    }
  });
  it("R7 points and foods: the pregnancy flag follows the record, a point that is to be avoided says so in its cautions too, and the allergy line is there", () => {
    for (const [name, a] of Object.entries(kb.treatment.acupoints)) {
      const page = pageOf(kb, "point", a.code, t)!;
      expect(page.flags, a.code).toEqual([t.t(a.pregnancy_avoid ? "learn.point.pregnancy" : "learn.point.noPregnancy")]);
      expect(page.cautions.length, a.code).toBe(a.cautions.length + kb.treatment.acupressure.cautions.length);
      if (a.pregnancy_avoid) expect(page.cautions.some((c) => /pregnan|懷孕/.test(c["zh-Hant"] + c.en)), `${name} lists the pregnancy caution`).toBe(true);
    }
    for (const [name, f] of Object.entries(kb.treatment.foods)) {
      const page = pageOf(kb, "food", f.id, t)!;
      expect(page.flags[0], name).toBe(t.t(f.pregnancy_caution ? "report.diet.pregnancy" : "learn.food.noPregnancy"));
      expect(page.flags, name).toContain(t.t("learn.food.allergy"));
      expect(page.cautions, name).toEqual(f.cautions);
    }
  });
  it("a formula's composition table has a row per herb with its role, and amounts only where the data has them", () => {
    for (const f of kb.formulas.values()) {
      const table = pageOf(kb, "formula", f.id, t)!.sections.find((s) => s.id === "composition")!.blocks.find((b) => b.kind === "table")!;
      if (table.kind !== "table") throw new Error("no table");
      expect(table.rows).toHaveLength(f.composition.length);
      expect(table.head).toHaveLength(f.composition.some((r) => r.typical_g !== undefined || r.classical_amount !== undefined) ? 4 : 3);
    }
  });
  it("R4: a release build shows only its bundle — the tier-A formulas, without amounts — and nothing else can be opened by address", () => {
    const listed = listOf(release, "formula", t).flatMap((g) => g.items.map((i) => i.id)).sort();
    expect(listed).toEqual([...release.formulas.keys()].sort());
    expect(listed.length).toBeLessThan(kb.formulas.size);
    for (const f of kb.formulas.values()) {
      if (f.tier === "A") continue;
      expect(pageOf(release, "formula", f.id, t), `${f.id} (tier ${f.tier}) is not in the release`).toBeNull();
      expect(listed).not.toContain(f.id);
    }
    for (const id of listed) {
      const table = pageOf(release, "formula", id, t)!.sections.find((s) => s.id === "composition")!.blocks.find((b) => b.kind === "table")!;
      if (table.kind === "table") expect(table.head, id).toHaveLength(3);
    }
    // a pattern page links only to the formula pages that exist in this build
    for (const p of release.patterns) {
      const links = pageOf(release, "pattern", p.id, t)!.sections.find((s) => s.id === "assoc")?.blocks.flatMap((b) => (b.kind === "links" ? b.groups.flatMap((g) => g.items.map((i) => i.href)) : [])) ?? [];
      for (const href of links.filter((h) => h.startsWith("/learn/formulas/"))) expect(release.formulas.has(href.split("/").pop()!), `${p.id} ${href}`).toBe(true);
    }
  });
});

describe("the comparison of patterns", () => {
  it("reads the patterns of an address: known, different, in order, at most three; an unknown one is reported", () => {
    expect(parseIds(kb, "?ids=EX1,EX2")).toEqual({ ids: ["EX1", "EX2"], unknown: false });
    expect(parseIds(kb, "ids=EX2,EX1,SP1,LV1")).toEqual({ ids: ["EX2", "EX1", "SP1"], unknown: false });
    expect(parseIds(kb, "ids=EX1,EX1,EX2")).toEqual({ ids: ["EX1", "EX2"], unknown: false });
    expect(parseIds(kb, "ids=EX1,NOPE,EX2")).toEqual({ ids: ["EX1", "EX2"], unknown: true });
    expect(parseIds(kb, "ids=")).toEqual({ ids: [], unknown: false });
    expect(parseIds(kb, "")).toEqual({ ids: [], unknown: false });
    expect(compareHref(["EX1", "EX2"])).toBe("/learn/compare?ids=EX1,EX2");
    expect(compareHref([])).toBe("/learn/compare");
  });
  for (const lang of ["en", "zh-Hant"] as const) {
    const t = tFor(lang);
    const SECOND_PERSON = lang === "en" ? /\b(you|your|yours|yourself)\b/i : /[你妳您]/;
    it(`every pair of the 23 patterns has a comparison in words, with a cell per pattern in every row and no second-person text, no question mark and no number from the records · ${lang}`, () => {
      const all = kb.patterns.map((p) => p.id);
      for (const [i, a] of all.entries()) for (const b of all.slice(i + 1)) {
        const m = comparisonPage(kb, [a, b], t);
        expect(m.sections.map((s) => s.id), `${a}/${b}`).toEqual(["overview", "shared", "differ", "questions"]);
        for (const s of m.sections) for (const block of s.blocks) {
          if (block.kind === "table") for (const row of block.rows) expect(row, `${a}/${b} ${s.id}`).toHaveLength(3);
          if (block.kind === "table") expect(block.head).toHaveLength(3);
        }
        const text = JSON.stringify(m.sections);
        expect(text.match(SECOND_PERSON)?.[0], `${a}/${b}`).toBeUndefined();
        expect(text, `${a}/${b}: topics, not questions`).not.toContain("?");
        expect(text, `${a}/${b}: no question of the bank is quoted`).not.toMatch(/Select all that apply|符合的請全選/);
      }
    });
    it(`bands are words and the K-07 pairs name three topics of the bank · ${lang}`, () => {
      const m = comparisonPage(kb, ["EX2", "EX4"], t);
      const differ = m.sections.find((s) => s.id === "differ")!.blocks.find((b) => b.kind === "table")!;
      if (differ.kind !== "table") throw new Error("no table");
      const words = new Set([t.t("learn.compare.band.key"), t.t("learn.compare.band.common"), t.t("learn.compare.band.supporting"), t.t("learn.compare.band.against"), t.t("learn.compare.band.none")]);
      for (const row of differ.rows) for (const cell of row.slice(1)) expect(words.has(cell as string), `${cell}`).toBe(true);
      const topics = m.sections.find((s) => s.id === "questions")!.blocks.find((b) => b.kind === "groups")!;
      if (topics.kind !== "groups") throw new Error("no topics");
      expect(topics.groups).toHaveLength(3);
      for (const g of topics.groups) { expect(g.label).toBeTruthy(); expect(g.items.length).toBeGreaterThan(0); }
    });
  }
  it("a pattern page links to the comparison with each other pattern of its group, and nowhere else", () => {
    for (const p of kb.patterns) {
      const links = compareLinks(kb, p.id);
      expect(links.map((l) => l.href)).toEqual(kb.patterns.filter((x) => x.group === p.group && x.id !== p.id).map((x) => compareHref([p.id, x.id])));
      for (const l of links) expect(parseIds(kb, new URL(l.href, "http://x").search).ids[0]).toBe(p.id);
    }
    expect(compareLinks(kb, "NOPE")).toEqual([]);
  });
});

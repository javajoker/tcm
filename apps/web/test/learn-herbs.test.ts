// The herb pages' models (PM-25; docs/post-mvp/design/knowledge-browser.md §3, §4): the list by category, the filter in every script, and the page rules R1–R7 checked over all 703 herbs in both languages.
// The data comes from the herb browser, as it does on screen: the rows from the index, each detail from its shard.
import { alignedList, chineseStrings, indexKnowledgeBase, newDisplay, type HerbDetail, type HerbRow, type KnowledgeBase } from "@tcm/kb";
import { buildFromDisk } from "@tcm/kb/node";
import { createI18n } from "@tcm/i18n";
import { describe, expect, it } from "vitest";
import { catalogs, type MessageKey } from "../src/i18n/catalogs.ts";
import { CATEGORIES, categoryLabel, channelLabel, flavorLabel, FLAVORS, formsOf, herbGroups, herbPage, marksOf, matchingHerbs, natureLabel, NATURES, naturesOf } from "../src/learn/herbs.ts";
import { hrefOf } from "../src/learn/registry.ts";
import type { Block, PageModel } from "../src/learn/types.ts";
import { dictionary } from "./hans.ts";

const dev = buildFromDisk("dev");
const kb = indexKnowledgeBase(dev.chunks);
/** The same knowledge base showing Simplified, with the display list also covering the herb files (the loader pairs those lists when each file arrives). */
const kbHans: KnowledgeBase = (() => {
  const files = dev.herbFiles!;
  const list = chineseStrings(dev.chunks.core, dev.chunks.formulas, dev.chunks.citations, dev.chunks.guidance, dev.chunks.herbs, files.index, ...Object.values(files.shards));
  const display = newDisplay();
  display.add(list, alignedList(list, dictionary));
  return indexKnowledgeBase(dev.chunks, display);
})();
const tFor = (lang: "en" | "zh-Hant", k: KnowledgeBase = kb) => createI18n<MessageKey>({ ...catalogs, "zh-Hans": {} }, lang, { zh: k.zh });
const en = tFor("en");
const zh = tFor("zh-Hant");

const rows: readonly HerbRow[] = await kb.herbBrowser!.rows();
const details: ReadonlyMap<string, HerbDetail> = new Map((await Promise.all(rows.map((r) => kb.herbBrowser!.detail(r.slug)))).map((d) => [d!.slug, d!] as const));
const CJK = /[㐀-鿿]/;

const strings = (node: unknown, out: string[] = []): string[] => {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) for (const v of node) strings(v, out);
  else if (node !== null && typeof node === "object") for (const v of Object.values(node)) strings(v, out);
  return out;
};
const blocksOf = (page: PageModel, id: string): readonly Block[] => page.sections.find((s) => s.id === id)?.blocks ?? [];

describe("the data the pages are built from", () => {
  it("is the whole herb browser: a row and a shard record for each of the 703 herbs, the same in both", () => {
    expect(rows).toHaveLength(703);
    expect(details.size).toBe(703);
    for (const r of rows) {
      const d = details.get(r.slug)!;
      expect([d.name, d.category, d.nature, d.toxic, d.pregnancy, d.status]).toEqual([r.name, r.category, r.nature, r.toxic, r.pregnancy, r.status]);
    }
  });
  it("has an address for every herb: ASCII, unique, and under /learn/herbs", () => {
    expect(new Set(rows.map((r) => r.slug)).size).toBe(703);
    for (const r of rows) { expect(r.slug).toMatch(/^[a-z0-9_-]+$/); expect(hrefOf("herb", r.slug)).toBe(`/learn/herbs/${r.slug}`); }
  });
  it("has English for every category, nature and flavour of the data, and for the channels (the glossary's, or the page's own for the two it lacks)", () => {
    const categories = new Set(rows.map((r) => r.category));
    const natures = new Set(rows.flatMap((r) => r.nature));
    const flavors = new Set(rows.flatMap((r) => r.flavors));
    const channels = new Set(rows.flatMap((r) => r.channels));
    for (const c of categories) expect(CATEGORIES.map(([z]) => z), c).toContain(c);
    for (const n of natures) expect(NATURES.map(([z]) => z), n).toContain(n);
    for (const f of flavors) expect(FLAVORS.map(([z]) => z), f).toContain(f);
    for (const [label, set] of [["category", categories], ["nature", natures], ["flavour", flavors], ["channel", channels]] as const) {
      for (const zhName of set) {
        const english = label === "category" ? categoryLabel(en, zhName) : label === "nature" ? natureLabel(en, zhName) : label === "flavour" ? flavorLabel(en, zhName) : channelLabel(kb, en, zhName);
        expect(english, `${label} ${zhName} in English`).not.toMatch(CJK);
        expect(english.length).toBeGreaterThan(2);
      }
    }
  });
});

describe("the list", () => {
  it("groups every herb once, by category, in the order a textbook lists them, headed in the page's language", () => {
    const groups = herbGroups(en, rows);
    expect(groups.flatMap((g) => g.items.map((i) => i.id)).sort()).toEqual(rows.map((r) => r.slug).sort());
    expect(groups.map((g) => g.heading).slice(0, 3)).toEqual(["exterior-releasing herbs", "heat-clearing herbs", "purgative herbs"]);
    expect(herbGroups(zh, rows).map((g) => g.heading).slice(0, 3)).toEqual(["解表藥", "清熱藥", "瀉下藥"]);
    for (const g of groups) expect(g.heading).not.toMatch(CJK);
    const order = CATEGORIES.map(([z]) => z);
    const positions = herbGroups(zh, rows).map((g) => order.indexOf(g.heading ?? ""));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
  it("puts a category the table does not know last, in Chinese", () => {
    const odd: HerbRow = { ...rows[0]!, slug: "odd", category: "新類藥" };
    const groups = herbGroups(en, [odd, ...rows]);
    expect(groups.at(-1)!.heading).toBe("新類藥");
    expect(groups.at(-1)!.items.map((i) => i.id)).toEqual(["odd"]);
  });
  it("lists a herb with its name in both languages where it has both, the first functions in Chinese, and what its record flags", () => {
    const group = herbGroups(en, rows).flatMap((g) => g.items);
    const bean = group.find((i) => i.id === "baibiandou")!;
    expect(bean.name).toEqual({ "zh-Hant": "白扁豆", en: "White hyacinth bean" });
    expect(bean.note).toBe("健脾化濕、和中消暑");
    expect(bean.noteLang).toBe("zh");
    expect(bean.marks).toEqual([]);
    const toxic = rows.find((r) => r.toxic && r.pregnancy === "avoid")!;
    expect(group.find((i) => i.id === toxic.slug)!.marks).toEqual(["Toxic", "Avoid in pregnancy"]);
  });
  it("says what the record flags in words: toxic, avoid in pregnancy, a pregnancy caution — and nothing for a herb with none", () => {
    expect(marksOf(en, { toxic: true, pregnancy: "avoid" })).toEqual(["Toxic", "Avoid in pregnancy"]);
    expect(marksOf(en, { toxic: false, pregnancy: "caution" })).toEqual(["Pregnancy caution"]);
    expect(marksOf(zh, { toxic: true, pregnancy: "caution" })).toEqual(["有毒", "孕婦慎用"]);
    expect(marksOf(en, { toxic: false, pregnancy: "ok-unreviewed" })).toEqual([]);
    expect(marksOf(en, { toxic: false, pregnancy: "ok" })).toEqual([]);
  });
  it("offers the natures the herbs have, coldest first, in the page's words", () => {
    const natures = naturesOf(rows);
    expect(natures.slice(0, 3)).toEqual(["大寒", "寒", "微寒"]);
    expect(natures.map((n) => natureLabel(en, n)).slice(0, 4)).toEqual(["very cold", "cold", "slightly cold", "cool"]);
    expect(natures.at(-1)).toBe("大熱");
    expect(naturesOf([])).toEqual([]);
  });
});

describe("the filter", () => {
  const find = (query: string, k: KnowledgeBase = kb, nature = "") => [...matchingHerbs(k, rows, { query, readings: k.script === "Hans" && query.trim() !== "" ? k.traditional(query) : [], nature })];
  it("finds a herb by its Chinese name, English name, Latin name, address and functions, ignoring case, width and tone marks", () => {
    for (const q of ["白扁豆", "white hyacinth", "WHITE HYACINTH BEAN", "Dolichos lablab", "dolichos", "baibiandou", "ＢＡＩＢＩＡＮＤＯＵ", "健脾化濕"]) expect(find(q), q).toContain("baibiandou");
  });
  it("finds a herb by a Simplified name when the page shows Simplified, and by its Traditional name there too", () => {
    const row = rows.find((r) => kbHans.zh(r.name["zh-Hant"]) !== r.name["zh-Hant"])!;
    const simplified = kbHans.zh(row.name["zh-Hant"]);
    expect(find(simplified, kbHans)).toContain(row.slug);
    expect(find(row.name["zh-Hant"], kbHans)).toContain(row.slug);
    expect(formsOf(kbHans, row)).toContain(simplified);
  });
  it("keeps only the herbs of one nature, and combines the two filters", () => {
    const warm = find("", kb, "溫");
    expect(warm.length).toBeGreaterThan(40);
    for (const slug of warm) expect(rows.find((r) => r.slug === slug)!.nature).toContain("溫");
    expect(find("", kb, "")).toHaveLength(703);
    const both = find("健脾", kb, "溫");
    expect(both.every((s) => warm.includes(s))).toBe(true);
    expect(both.length).toBeLessThan(find("健脾").length);
  });
  it("finds nothing for nothing, and every herb for an empty query", () => {
    expect(find("qzxqzxqzx")).toEqual([]);
    expect(find("   ")).toHaveLength(703);
    expect(find("", kb, "no-such-nature")).toEqual([]);
  });
  it("answers from the cache of forms when it is given one, with the same result", () => {
    const cache = new Map(rows.map((r) => [r.slug, formsOf(kb, r)] as const));
    const q = { query: "當歸", readings: [], nature: "" };
    expect([...matchingHerbs(kb, rows, q, cache)]).toEqual([...matchingHerbs(kb, rows, q)]);
  });
});

describe.each([["en", en], ["zh-Hant", zh]] as const)("every herb page · %s", (name, t) => {
  const pages = rows.map((r) => ({ slug: r.slug, d: details.get(r.slug)!, page: herbPage(kb, details.get(r.slug)!, t) }));
  const has = (page: PageModel, text: string): boolean => page.flags.some((f) => f.includes(text));

  it("R1, R7: puts the record's flags first — toxic or not, the pregnancy level, every interaction or none, the allergy line, the practitioner line — and the caution text the record has", () => {
    for (const { slug, d, page } of pages) {
      expect(page.type, slug).toBe("herb");
      expect(page.adviceLike, slug).toBe(true);
      expect(page.flags, slug).toHaveLength(5);
      expect(page.flags[0], `${slug} toxic`).toBe(t.t(d.toxic ? "learn.herb.toxic" : "learn.herb.notToxic"));
      expect(page.flags[1], `${slug} pregnancy ${d.pregnancy}`).toBe(t.t(`learn.herb.pregnancy.${d.pregnancy}` as MessageKey));
      if (d.interactions.length === 0) expect(page.flags[2], slug).toBe(t.t("learn.herb.noInteraction"));
      else for (const i of d.interactions) expect(page.flags[2], `${slug} ${i}`).toContain(t.t(`formula.interaction.${i}` as MessageKey));
      expect(page.flags[3], slug).toBe(t.t("learn.herb.allergy"));
      expect(page.flags[4], slug).toBe(t.t("learn.herb.practitioner"));
      expect(page.cautions.map((c) => c["zh-Hant"]), slug).toEqual(d.caution === null ? [] : [d.caution]);
      expect(page.cautions.every((c) => c.en === undefined), "the Pharmacopoeia gives its cautions in Chinese only").toBe(true);
    }
  });
  it("R7: no flag the record does not carry — a herb recorded as not toxic is never said to be toxic, and one with no interaction never lists one", () => {
    for (const { slug, d, page } of pages) {
      if (!d.toxic) expect(has(page, t.t("learn.herb.toxic")) && !has(page, t.t("learn.herb.notToxic")), slug).toBe(false);
      if (d.interactions.length === 0) expect(has(page, t.t("formula.cautions.interactions")), slug).toBe(false);
      if (d.pregnancy !== "avoid") expect(has(page, t.t("learn.herb.pregnancy.avoid")), slug).toBe(false);
    }
  });
  it("R2: no second-person wording on any page, in what the page says or in what the data gives", () => {
    const second = name === "en" ? /\b(you|your|yours|yourself)\b/i : /[你您]/;
    for (const { slug, page } of pages) expect(strings(page).filter((s) => second.test(s)), slug).toEqual([]);
  });
  it("R6: every page names its source — the Pharmacopoeia entry — and says how far it has been checked", () => {
    for (const { slug, d, page } of pages) {
      if (d.source.book === "—") expect(page.sourceLabel, `${slug} was added by hand`).toBe(t.t("learn.herb.source.byHand"));
      else { expect(page.sourceLabel, slug).toContain(d.source.entry); expect(page.sourceLabel, slug).toContain(t.zh(d.source.book)); }
      expect(page.review, slug).toBe(d.status === "reviewed" ? "reviewed" : d.status === "derived" ? "derived" : "curated-draft");
    }
  });
  it("carries a draft note for every herb that has not been covered by a sample review, and none for one that has", () => {
    for (const { slug, d, page } of pages) {
      if (d.status === "reviewed") expect(page.draftNote, slug).toBeUndefined();
      else expect(page.draftNote, slug).toBe(t.t(d.status === "derived" ? "learn.herb.draft.derived" : "learn.herb.draft.curated"));
    }
    const reviewed = herbPage(kb, { ...details.get("baibiandou")!, status: "reviewed" }, t);
    expect(reviewed.draftNote).toBeUndefined();
    expect(reviewed.review).toBe("reviewed");
  });
  it("starts with the overview, then the functions, and has a formulas section only when the herb is in a formula of this build or the source names one", () => {
    for (const { slug, d, page } of pages) {
      expect(page.sections.map((s) => s.id).slice(0, 2), slug).toEqual(["overview", "functions"]);
      const linked = [...kb.formulas.values()].filter((f) => f.composition.some((c) => c.herb === `herb-${slug}`) || d.classicalFormulas.includes(f.name["zh-Hant"]));
      const block = blocksOf(page, "formulas").find((b): b is Extract<Block, { kind: "links" }> => b.kind === "links");
      expect(block?.groups[0]?.items.map((i) => i.href).sort() ?? [], slug).toEqual(linked.map((f) => hrefOf("formula", f.id)).sort());
      const elsewhere = d.classicalFormulas.filter((n) => ![...kb.formulas.values()].some((f) => f.name["zh-Hant"] === n));
      const named = blocksOf(page, "formulas").find((b): b is Extract<Block, { kind: "groups" }> => b.kind === "groups");
      expect(named?.groups[0]?.items.map((i) => i["zh-Hant"]) ?? [], slug).toEqual(elsewhere);
      expect(page.sections.some((s) => s.id === "formulas"), slug).toBe(linked.length > 0 || elsewhere.length > 0);
    }
  });
  it("says the overview in the page's words: category, nature, flavours, channels — English in English, with no Chinese left where the tables have a word", () => {
    for (const { slug, page } of pages) {
      const facts = blocksOf(page, "overview").find((b): b is Extract<Block, { kind: "facts" }> => b.kind === "facts")!;
      const text = Object.fromEntries(facts.rows.map((r) => [r.label, r.value]));
      expect(typeof text[t.t("learn.herb.category")], slug).toBe("string");
      if (name === "en") for (const label of ["learn.herb.category", "learn.herb.nature", "learn.herb.flavors"] as const) expect(String(text[t.t(label)]), `${slug} ${label}`).not.toMatch(CJK);
    }
  });
  it("shows the Latin name as such and the aliases in Chinese, only where the record has them", () => {
    for (const { slug, d, page } of pages) {
      const facts = blocksOf(page, "overview").find((b): b is Extract<Block, { kind: "facts" }> => b.kind === "facts")!;
      const latin = facts.rows.find((r) => r.label === t.t("learn.herb.latin"));
      expect(latin?.value ?? null, slug).toBe(d.latin);
      if (latin) expect(latin.lang).toBe("la");
      expect(facts.rows.some((r) => r.label === t.t("learn.herb.aliases")), slug).toBe(d.aliases !== undefined);
    }
  });
  it("links to the herb nowhere else and to the assessment nowhere (R5): a page has no related list of its own", () => {
    for (const { slug, page } of pages) expect(page.related, slug).toEqual([]);
  });
  it("shows no amount: nothing in the page is a quantity of the herb", () => {
    for (const { slug, page } of pages) {
      const text = strings({ ...page, cautions: [], flags: page.flags }).join("\n");
      expect(text, slug).not.toMatch(/\b\d+\s?(g|mg|grams?)\b/i);
    }
  });
});

describe("a herb used by the formulas of this app", () => {
  it("links to them, in the page's language", () => {
    const page = herbPage(kb, details.get("baibiandou")!, en);
    const links = blocksOf(page, "formulas").find((b): b is Extract<Block, { kind: "links" }> => b.kind === "links")!;
    expect(links.groups[0]!.label).toBe("Formulas of this app that use it");
    expect(links.groups[0]!.items.map((i) => i.href)).toContain("/learn/formulas/F_SHENLING");
    const named = blocksOf(page, "formulas").find((b): b is Extract<Block, { kind: "groups" }> => b.kind === "groups")!;
    expect(named.groups[0]!.items.map((i) => i["zh-Hant"])).toEqual(["香薷散"]);          // the other classical formula the source lists it in: not in this build, so a name and no link
  });
  it("in a public build the same herb links only to the tier-A formulas that exist there", () => {
    const publicKb = indexKnowledgeBase(buildFromDisk("release", undefined, true).chunks);
    const hrefs = (page: PageModel): string[] => blocksOf(page, "formulas").flatMap((b) => (b.kind === "links" ? b.groups.flatMap((g) => g.items.map((i) => i.href)) : []));
    for (const href of hrefs(herbPage(publicKb, details.get("baibiandou")!, en))) expect(publicKb.formulas.has(href.split("/").at(-1)!), href).toBe(true);
  });
});

describe("a herb page in the Chinese pages", () => {
  it("shows the Chinese caution as it is, without saying it is Chinese", () => {
    const toxic = rows.find((r) => r.toxic && details.get(r.slug)!.caution !== null)!;
    const page = herbPage(kb, details.get(toxic.slug)!, zh);
    expect(page.cautions[0]!["zh-Hant"]).toBe(details.get(toxic.slug)!.caution);
    expect(page.flags[0]).toBe("出處標示此藥材有毒。");
  });
  it("names the source of a herb added by hand as what it is — a hand entry with no source — and a textbook herb by its book", () => {
    expect(herbPage(kb, details.get("bingtang")!, zh).sourceLabel).toBe("由人工加入本應用的資料：此藥材沒有記錄出處條目。");
    expect(herbPage(kb, details.get("bingtang")!, en).sourceLabel).toBe("Added by hand to the app's data: no source entry is recorded for this herb.");
    const textbook = rows.find((r) => details.get(r.slug)!.source.book.startsWith("《中藥學》"))!;
    expect(herbPage(kb, details.get(textbook.slug)!, en).sourceLabel).toContain("《中藥學》（清華社）· 藥典外品種");
  });
});
